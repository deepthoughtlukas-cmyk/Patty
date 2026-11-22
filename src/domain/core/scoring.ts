import { computeCoreExposure } from '../../utils/core/coreExposure'
import { regionOf, REGION_LABELS } from '../../utils/core/countries'
import { FACTOR_BUDGET_CAP } from '../../utils/core/targets'
import type { CorePosition, CoreProfile, RegionKey, TargetStage } from '../../utils/core/types'

export interface SparplanItem {
  key: string
  profileId: string
  name: string
  isin: string
  amount: number
  shareOfBudget: number
  reason: string
  enabled: boolean
  isCandidate?: boolean
}

export interface MonthlyStepAllocation {
  items: SparplanItem[]
  primaryFocusRegions: RegionKey[]
  targetsSmallCap: boolean
}

export function getProfileRegionShares(profile: CoreProfile): Record<RegionKey, number> {
  const shares: Record<RegionKey, number> = { US: 0, CA: 0, EU: 0, JP: 0, PAC: 0, EM: 0 }
  const countrySum =
    Object.values(profile.countries).reduce((s, v) => s + (v > 0 ? v : 0), 0) || 100
  for (const [cCode, rawVal] of Object.entries(profile.countries)) {
    if (rawVal <= 0) continue
    const rKey = regionOf(cCode)
    shares[rKey] += rawVal / countrySum
  }
  return shares
}

export function scoreAndAllocateMonthlyStep(
  pool: CorePosition[],
  targetStage: TargetStage,
  monthlyBudget: number,
  maxPositions: number,
  selectedKeys?: string[]
): MonthlyStepAllocation {
  if (pool.length === 0 || monthlyBudget <= 0) {
    return { items: [], primaryFocusRegions: [], targetsSmallCap: false }
  }

  const currentExposure = computeCoreExposure(pool)

  const deficitsByRegion: Record<RegionKey, number> = { US: 0, CA: 0, EU: 0, JP: 0, PAC: 0, EM: 0 }
  const surplusByRegion: Record<RegionKey, number> = { US: 0, CA: 0, EU: 0, JP: 0, PAC: 0, EM: 0 }

  for (const group of targetStage.groups) {
    const curVal = group.regions.reduce((s, r) => s + (currentExposure.regions[r] || 0), 0)
    const diff = group.target - curVal
    if (diff > 0) {
      for (const r of group.regions) deficitsByRegion[r] = diff
    } else {
      for (const r of group.regions) surplusByRegion[r] = Math.abs(diff)
    }
  }

  const smallCapTarget = targetStage.id === 'stage3' ? 0.14 : 0
  const smallCapDeficit = Math.max(0, smallCapTarget - currentExposure.size.small)

  const scored = pool.map((pos) => {
    const prof = pos.profile!
    const rShares = getProfileRegionShares(prof)
    let score = 0
    const reasons: string[] = []
    let topRegionGain = 0
    let topRegion: RegionKey | null = null

    for (const rKey of ['US', 'CA', 'EU', 'JP', 'PAC', 'EM'] as RegionKey[]) {
      const share = rShares[rKey]
      if (share <= 0) continue
      if (deficitsByRegion[rKey] > 0) {
        const gain = share * deficitsByRegion[rKey] * 3.0
        score += gain
        if (gain > topRegionGain) {
          topRegionGain = gain
          topRegion = rKey
        }
      }
      if (surplusByRegion[rKey] > 0.03) {
        score -= share * surplusByRegion[rKey] * 1.6
      }
    }

    if (topRegion && topRegionGain > 0.03) {
      reasons.push(`Stärkt ${REGION_LABELS[topRegion]}`)
    }

    const scShare = (prof.size.small || 0) / 100
    if (smallCapDeficit > 0 && scShare > 0.2) {
      score += scShare * smallCapDeficit * 4.0
      reasons.push(`Small-Cap (${(scShare * 100).toFixed(0)} %)`)
    }

    if (pos.role === 'factor' && currentExposure.roleShares.factor > FACTOR_BUDGET_CAP) {
      const addressesKeyDeficit =
        (smallCapDeficit > 0.02 && scShare >= 0.25) ||
        (deficitsByRegion.EM > 0.03 && rShares.EM >= 0.4)
      score -= addressesKeyDeficit ? 0.04 : 0.45
    }

    if (pos.role === 'cashflow') {
      score -= 0.12
    }

    return {
      pos,
      score,
      topRegion,
      scShare,
      reason: reasons.length > 0 ? reasons.join(' · ') : 'Unterstützt Zielgewichtung',
    }
  })

  let chosen = scored
  if (selectedKeys && selectedKeys.length > 0) {
    chosen = scored.filter((s) => selectedKeys.includes(s.pos.key))
  } else {
    const positive = scored.filter((s) => s.score > 0)
    const candidates = positive.length > 0 ? positive : scored
    chosen = [...candidates].sort((a, b) => b.score - a.score).slice(0, maxPositions)
  }

  if (chosen.length === 0) {
    return { items: [], primaryFocusRegions: [], targetsSmallCap: false }
  }

  const totalScore = chosen.reduce((s, sp) => s + Math.max(0.01, sp.score), 0)
  const stepUnit = monthlyBudget >= chosen.length * 25 ? 25 : 5
  let remainingBudget = monthlyBudget
  const items: SparplanItem[] = []

  chosen.forEach((sp, idx) => {
    const isLast = idx === chosen.length - 1
    const rawShare = (Math.max(0.01, sp.score) / totalScore) * monthlyBudget
    let rounded = Math.max(stepUnit, Math.round(rawShare / stepUnit) * stepUnit)

    if (isLast) {
      rounded = Math.max(0, remainingBudget)
    } else {
      const minReserve = stepUnit * (chosen.length - idx - 1)
      rounded = Math.min(rounded, Math.max(0, remainingBudget - minReserve))
      remainingBudget -= rounded
    }

    if (rounded > 0) {
      items.push({
        key: sp.pos.key,
        profileId: sp.pos.profile!.id,
        name: sp.pos.name,
        isin: sp.pos.profile!.isins[0] || '',
        amount: rounded,
        shareOfBudget: monthlyBudget > 0 ? rounded / monthlyBudget : 0,
        reason: sp.reason,
        enabled: true,
        isCandidate: sp.pos.isCandidate,
      })
    }
  })

  const focusSet = new Set<RegionKey>()
  for (const c of chosen) {
    if (c.topRegion) focusSet.add(c.topRegion)
  }
  const targetsSmallCap = chosen.some((c) => c.scShare >= 0.25 && smallCapDeficit > 0.01)

  return {
    items: items.sort((a, b) => b.amount - a.amount),
    primaryFocusRegions: Array.from(focusSet),
    targetsSmallCap,
  }
}
