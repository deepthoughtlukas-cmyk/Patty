import { computeCoreExposure } from '../../utils/core/coreExposure'
import { isFrontierProfile, regionOf } from '../../utils/core/countries'
import {
  DEFAULT_FRONTIER_CAP,
  FACTOR_BUDGET_CAP,
  FRONTIER_MAX_BUDGET_SHARE,
  REGION_TOLERANCE,
} from '../../utils/core/targets'
import type {
  CoreExposure,
  CorePosition,
  CoreProfile,
  RegionKey,
  TargetGroup,
  TargetStage,
} from '../../utils/core/types'

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
  isSatellite?: boolean
}

export interface MonthlyStepAllocation {
  items: SparplanItem[]
  primaryFocusRegions: RegionKey[]
  primaryFocusLabels: string[]
  targetsSmallCap: boolean
}

export function getProfileRegionShares(profile: CoreProfile): Record<RegionKey, number> {
  const shares: Record<RegionKey, number> = {
    US: 0,
    CA: 0,
    EU: 0,
    JP: 0,
    PAC: 0,
    EM: 0,
    FM: 0,
  }
  const countrySum =
    Object.values(profile.countries).reduce((s, v) => s + Math.max(v, 0), 0) || 100
  for (const [cCode, rawVal] of Object.entries(profile.countries)) {
    if (rawVal <= 0) continue
    const rKey = regionOf(cCode)
    shares[rKey] += rawVal / countrySum
  }
  return shares
}

interface ScoredCandidate {
  pos: CorePosition
  score: number
  topGroup: TargetGroup | null
  scShare: number
  reason: string
}

interface GroupStatus {
  group: TargetGroup
  deficit: number
  surplus: number
}

function scoreCandidatesAgainstGroups(
  positions: CorePosition[],
  groupStatuses: GroupStatus[],
  marketCoveredGroupIds: Set<string>,
  hasMarketSmallCap: boolean,
  currentExposure: CoreExposure,
  targetStage: TargetStage
): ScoredCandidate[] {
  const smallCapTarget = targetStage.id === 'stage3' ? 0.14 : 0
  const smallCapDeficit = Math.max(0, smallCapTarget - currentExposure.size.small)

  return positions.map((pos) => {
    const prof = pos.profile!
    const rShares = getProfileRegionShares(prof)
    let score = 0
    const reasons: string[] = []
    let topGroupGain = 0
    let topGroup: TargetGroup | null = null

    for (const status of groupStatuses) {
      const groupShare = status.group.regions.reduce((s, r) => s + (rShares[r] || 0), 0)
      if (groupShare <= 0) continue

      if (status.deficit > 0) {
        const gain = groupShare * status.deficit * 3.0
        score += gain
        if (gain > topGroupGain) {
          topGroupGain = gain
          topGroup = status.group
        }
      }
      if (status.surplus > REGION_TOLERANCE) {
        score -= groupShare * status.surplus * 1.6
      }
    }

    if (topGroup && topGroupGain > 0.03) {
      reasons.push(`Stärkt ${topGroup.label}`)
    }

    const scShare = (prof.size.small || 0) / 100
    if (smallCapDeficit > 0 && scShare > 0.2) {
      score += scShare * smallCapDeficit * 4.0
      reasons.push(`Small-Cap (${(scShare * 100).toFixed(0)} %)`)
    } else if (
      targetStage.id === 'stage2' &&
      scShare >= 0.5 &&
      currentExposure.size.small > 0.2
    ) {
      score -= 0.15
    }

    if (pos.role === 'factor' && currentExposure.roleShares.factor > FACTOR_BUDGET_CAP) {
      const topGroupDeficit =
        groupStatuses.find((g) => g.group.id === topGroup?.id)?.deficit ?? 0
      const fillsUncoveredGroup =
        topGroup !== null &&
        topGroupDeficit > REGION_TOLERANCE &&
        !marketCoveredGroupIds.has(topGroup.id)
      const fillsUncoveredSmallCap =
        targetStage.id === 'stage3' &&
        smallCapDeficit > 0.02 &&
        scShare >= 0.25 &&
        !hasMarketSmallCap

      if (fillsUncoveredGroup || fillsUncoveredSmallCap) {
        score -= 0.04
        reasons.push('Faktor-ETF (kein Markt-Core im Bestand)')
      } else {
        score -= 0.45
      }
    }

    if (pos.role === 'cashflow' || pos.role === 'satellite') {
      score -= 0.25
    }

    if (typeof prof.ter === 'number' && prof.ter > 0.5) {
      score -= (prof.ter - 0.5) * 0.08
    }

    return {
      pos,
      score,
      topGroup,
      scShare,
      reason: reasons.length > 0 ? reasons.join(' · ') : 'Unterstützt Zielgewichtung',
    }
  })
}

function allocateProportionally(
  chosen: ScoredCandidate[],
  budget: number,
  totalBudgetForShare: number
): SparplanItem[] {
  if (chosen.length === 0 || budget <= 0) return []

  const totalScore = chosen.reduce((s, sp) => s + Math.max(0.01, sp.score), 0)
  const stepUnit = budget >= chosen.length * 25 ? 25 : 5
  let remainingBudget = budget
  const items: SparplanItem[] = []

  chosen.forEach((sp, idx) => {
    const isLast = idx === chosen.length - 1
    const rawShare = (Math.max(0.01, sp.score) / totalScore) * budget
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
        shareOfBudget: totalBudgetForShare > 0 ? rounded / totalBudgetForShare : 0,
        reason: sp.reason,
        enabled: true,
        isCandidate: sp.pos.isCandidate,
      })
    }
  })

  return items
}

function computeFrontierAllocation(
  pool: CorePosition[],
  currentExposure: CoreExposure,
  monthlyBudget: number,
  maxPositions: number,
  hasCorePool: boolean,
  frontierCap: number
): { candidate: CorePosition; amount: number } | null {
  if (frontierCap <= 0) return null
  if (maxPositions < 2 && hasCorePool) return null

  const frontierCandidates = pool
    .filter(
      (pos) =>
        pos.profile &&
        !pos.isCandidate &&
        pos.role === 'satellite' &&
        isFrontierProfile(pos.profile)
    )
    .sort((a, b) => {
      const fmDiff =
        getProfileRegionShares(b.profile!).FM - getProfileRegionShares(a.profile!).FM
      if (Math.abs(fmDiff) > 0.01) return fmDiff
      return (a.profile!.ter ?? 1) - (b.profile!.ter ?? 1)
    })

  const candidate = frontierCandidates[0]
  if (!candidate) return null

  const fmActualShare = currentExposure.regions.FM || 0
  if (fmActualShare >= frontierCap - 0.002) return null

  const projectedTotal = currentExposure.total + monthlyBudget
  const fmNeededEur = Math.max(
    0,
    projectedTotal * frontierCap - currentExposure.total * fmActualShare
  )
  const budgetShareLimit = hasCorePool
    ? monthlyBudget * FRONTIER_MAX_BUDGET_SHARE
    : monthlyBudget
  const maxFrontierMonthly = Math.min(fmNeededEur, budgetShareLimit)
  if (maxFrontierMonthly < 10) return null

  const preferredUnit = monthlyBudget >= 100 ? 25 : 5
  let amount = Math.floor(maxFrontierMonthly / preferredUnit) * preferredUnit
  if (amount === 0) {
    amount = Math.floor(maxFrontierMonthly / 5) * 5
  }

  if (hasCorePool) {
    const minCoreReserve = monthlyBudget >= 50 ? 25 : 5
    amount = Math.min(
      amount,
      Math.floor(budgetShareLimit),
      Math.max(0, monthlyBudget - minCoreReserve)
    )
  }

  if (amount <= 0) return null
  return { candidate, amount }
}

export function scoreAndAllocateMonthlyStep(
  pool: CorePosition[],
  targetStage: TargetStage,
  monthlyBudget: number,
  maxPositions: number,
  selectedKeys?: string[],
  frontierCap = DEFAULT_FRONTIER_CAP
): MonthlyStepAllocation {
  if (pool.length === 0 || monthlyBudget <= 0) {
    return {
      items: [],
      primaryFocusRegions: [],
      primaryFocusLabels: [],
      targetsSmallCap: false,
    }
  }

  const currentExposure = computeCoreExposure(pool)

  const groupStatuses: GroupStatus[] = targetStage.groups.map((group) => {
    const curVal = group.regions.reduce((s, r) => s + (currentExposure.regions[r] || 0), 0)
    const diff = group.target - curVal
    return {
      group,
      deficit: diff > 0 ? diff : 0,
      surplus: diff < 0 ? Math.abs(diff) : 0,
    }
  })

  // Manuelle Auswahl durch den Anwender respektieren
  if (selectedKeys && selectedKeys.length > 0) {
    const manualPool = pool.filter((p) => p.profile && selectedKeys.includes(p.key))
    const scoredManual = scoreCandidatesAgainstGroups(
      manualPool,
      groupStatuses,
      new Set(),
      false,
      currentExposure,
      targetStage
    )
    const items = allocateProportionally(scoredManual, monthlyBudget, monthlyBudget)
    const focusRegions = new Set<RegionKey>()
    const focusLabels = new Set<string>()
    for (const c of scoredManual) {
      if (c.topGroup) {
        focusRegions.add(c.topGroup.regions[0])
        focusLabels.add(c.topGroup.label)
      }
    }
    const smallCapDeficit =
      targetStage.id === 'stage3' ? Math.max(0, 0.14 - currentExposure.size.small) : 0
    return {
      items: items.sort((a, b) => b.amount - a.amount),
      primaryFocusRegions: Array.from(focusRegions),
      primaryFocusLabels: Array.from(focusLabels),
      targetsSmallCap: scoredManual.some((c) => c.scShare >= 0.25 && smallCapDeficit > 0.01),
    }
  }

  // Automatik: nur breite Markt-/Faktor-Core-ETFs (keine Frontier/Einzelland-Satelliten, keine Dividenden-Cashflow-Satelliten)
  const corePool = pool.filter(
    (pos) =>
      pos.profile &&
      (pos.role === 'market' || pos.role === 'factor') &&
      !isFrontierProfile(pos.profile)
  )

  const frontierAlloc = computeFrontierAllocation(
    pool,
    currentExposure,
    monthlyBudget,
    maxPositions,
    corePool.length > 0,
    frontierCap
  )
  const frontierAmount = frontierAlloc?.amount ?? 0
  const coreBudget = monthlyBudget - frontierAmount
  const coreMaxSlots =
    frontierAmount > 0 && corePool.length > 0 ? Math.max(1, maxPositions - 1) : maxPositions

  const marketCoveredGroupIds = new Set<string>()
  for (const status of groupStatuses) {
    if (status.deficit <= REGION_TOLERANCE) continue
    const coveredByMarket = corePool.some((pos) => {
      if (pos.role !== 'market') return false
      const rShares = getProfileRegionShares(pos.profile!)
      const groupShare = status.group.regions.reduce((s, r) => s + (rShares[r] || 0), 0)
      return groupShare >= 0.25
    })
    if (coveredByMarket) {
      marketCoveredGroupIds.add(status.group.id)
    }
  }

  const hasMarketSmallCap = corePool.some(
    (pos) => pos.role === 'market' && (pos.profile!.size.small || 0) >= 30
  )

  const scoredCore = scoreCandidatesAgainstGroups(
    corePool,
    groupStatuses,
    marketCoveredGroupIds,
    hasMarketSmallCap,
    currentExposure,
    targetStage
  )

  const positive = scoredCore.filter((s) => s.score > 0)
  const candidates = positive.length > 0 ? positive : scoredCore
  const chosenCore = [...candidates].sort((a, b) => b.score - a.score).slice(0, coreMaxSlots)

  const items = allocateProportionally(chosenCore, coreBudget, monthlyBudget)

  if (frontierAlloc && frontierAmount > 0) {
    items.push({
      key: frontierAlloc.candidate.key,
      profileId: frontierAlloc.candidate.profile!.id,
      name: frontierAlloc.candidate.name,
      isin: frontierAlloc.candidate.profile!.isins[0] || '',
      amount: frontierAmount,
      shareOfBudget: monthlyBudget > 0 ? frontierAmount / monthlyBudget : 0,
      reason: `Frontier-Beimischung (Cap ${(frontierCap * 100).toFixed(0)} %)`,
      enabled: true,
      isSatellite: true,
    })
  }

  const focusRegions = new Set<RegionKey>()
  const focusLabels = new Set<string>()
  for (const c of chosenCore) {
    if (c.topGroup) {
      focusRegions.add(c.topGroup.regions[0])
      focusLabels.add(c.topGroup.label)
    }
  }
  const smallCapDeficit =
    targetStage.id === 'stage3' ? Math.max(0, 0.14 - currentExposure.size.small) : 0
  const targetsSmallCap = chosenCore.some(
    (c) => c.scShare >= 0.25 && smallCapDeficit > 0.01
  )

  return {
    items: items.sort((a, b) => b.amount - a.amount),
    primaryFocusRegions: Array.from(focusRegions),
    primaryFocusLabels: Array.from(focusLabels),
    targetsSmallCap,
  }
}
