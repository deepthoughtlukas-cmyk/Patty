import { BUILTIN_PROFILES } from './builtinProfiles'
import { computeCoreExposure } from './coreExposure'
import { regionOf, REGION_LABELS } from './countries'
import { getAllProfiles } from './profileStore'
import { FACTOR_BUDGET_CAP, REGION_TOLERANCE } from './targets'
import type { CoreExposure, CorePosition, CoreProfile, RegionKey, TargetStage } from './types'

export interface OrderRecommendation {
  profileId: string
  name: string
  isin: string
  action: 'BUY' | 'SELL'
  amount: number
  targetShare: number
  reason: string
}

export interface OptimizationResult {
  orders: OrderRecommendation[]
  budgetUsed: number
  remainingBudget: number
  simulatedDeltas: Record<string, number>
}

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

export interface CoreGapDiagnostic {
  id: string
  severity: 'warning' | 'info'
  title: string
  detail: string
  actionType?: 'open-holdings' | 'enable-candidates'
  suggestedProfileName?: string
  suggestedIsin?: string
}

export interface RoadmapPhase {
  phaseNumber: number
  startMonth: number
  endMonth: number
  title: string
  focusSummary: string
  milestoneReached?: string
  allocations: SparplanItem[]
}

export interface CoreRoadmap {
  phases: RoadmapPhase[]
  monthsToRegionTarget: number | null
  monthsToSizeTarget: number | null
  monthsToAllTargets: number | null
  timeline: ProjectionPoint[]
  exposureAfter12m: CoreExposure
  deltas12m: Record<string, number>
  deltasToTarget: Record<string, number>
  exposureAtEnd: CoreExposure
}

export interface ProjectionPoint {
  month: number
  totalValue: number
  usShare: number
  euShare: number
  emShare: number
  jpShare: number
  pacShare: number
  caShare: number
  smallCapShare: number
  factorShare: number
  allRegionsInTolerance: boolean
  sizeInTarget: boolean
}

export interface SparplanProjection {
  monthsToRegionTarget: number | null
  monthsToSizeTarget: number | null
  monthsToAllTargets: number | null
  timeline: ProjectionPoint[]
  finalExposure: CoreExposure
}

/**
 * Optimiert einen monatlichen Sparplan basierend auf den VORHANDENEN Core-ETFs des Anlegers.
 * Begrenzt auf bis zu 4 Positionen pro Monat (oder frei wählbare Positionen).
 */
export function optimizeExistingCoreSparplan(
  positions: CorePosition[],
  targetStage: TargetStage,
  monthlyBudget: number,
  options?: {
    maxPositions?: number
    selectedKeys?: string[]
  }
): SparplanItem[] {
  const maxPos = options?.maxPositions ?? 4
  const activePositions = positions.filter((p) => p.profile !== null && p.value > 0)
  if (activePositions.length === 0 || monthlyBudget <= 0) return []

  const baseExposure = computeCoreExposure(activePositions)

  // 1. Defizite der Regionen ermitteln
  const deficitsByRegion: Record<RegionKey, number> = { US: 0, CA: 0, EU: 0, JP: 0, PAC: 0, EM: 0 }
  const surplusByRegion: Record<RegionKey, number> = { US: 0, CA: 0, EU: 0, JP: 0, PAC: 0, EM: 0 }

  for (const group of targetStage.groups) {
    const curVal = group.regions.reduce((s, r) => s + (baseExposure.regions[r] || 0), 0)
    const diff = group.target - curVal
    if (diff > 0) {
      for (const r of group.regions) deficitsByRegion[r] = diff
    } else {
      for (const r of group.regions) surplusByRegion[r] = Math.abs(diff)
    }
  }

  // 2. Defizit beim Size-Faktor (Small Caps)
  // Stufe 3 hat ca. 14 % Small Caps als Ziel
  const smallCapTarget = targetStage.id === 'stage3' ? 0.14 : 0
  const smallCapDeficit = Math.max(0, smallCapTarget - baseExposure.size.small)

  // 3. Score für jede vorhandene Position berechnen
  const scoredPositions = activePositions.map((pos) => {
    const prof = pos.profile!
    let score = 0
    let reasons: string[] = []

    // Nutzen für Regionen-Defizite
    const countrySum = Object.values(prof.countries).reduce((s, v) => s + (v > 0 ? v : 0), 0) || 100
    for (const [cCode, rawVal] of Object.entries(prof.countries)) {
      if (rawVal <= 0) continue
      const share = rawVal / countrySum
      // Region bestimmen (grobe Zuordnung)
      const rKey = (['US', 'CA', 'JP'].includes(cCode)
        ? cCode
        : ['GB', 'DE', 'FR', 'CH', 'NL', 'IT', 'ES', 'SE', 'DK', 'NO', 'FI', 'BE', 'EU_OTH'].includes(cCode)
        ? 'EU'
        : ['AU', 'HK', 'SG', 'NZ', 'PAC_OTH'].includes(cCode)
        ? 'PAC'
        : 'EM') as RegionKey

      if (deficitsByRegion[rKey] > 0) {
        score += share * deficitsByRegion[rKey] * 3.0
      }
      if (surplusByRegion[rKey] > 0.05) {
        score -= share * surplusByRegion[rKey] * 1.5
      }
    }

    // Nutzen für Small Caps
    const scShare = (prof.size.small || 0) / 100
    if (smallCapDeficit > 0 && scShare > 0.2) {
      score += scShare * smallCapDeficit * 4.0
      reasons.push(`Schließt Small-Cap-Defizit (${(scShare * 100).toFixed(0)} % SC)`)
    }

    // Abzug für Faktor-Budget, falls bereits > 20 %
    if (prof.role === 'factor' && baseExposure.roleShares.factor > 0.2) {
      // Wenn die Position jedoch gezielt bestehende Defizite abbaut (z. B. EM oder Small Cap), bleibt der Abzug gering
      const addressesKeyDeficit =
        (smallCapDeficit > 0.02 && scShare >= 0.25) ||
        (deficitsByRegion.EM > 0.03 && Boolean(prof.countries['CN'] || prof.countries['EM_OTH'] || prof.countries['IN']))
      score -= addressesKeyDeficit ? 0.05 : 0.4
    }

    if (prof.countries['EM'] || prof.countries['CN'] || prof.countries['IN'] || prof.countries['TW']) {
      if (deficitsByRegion.EM > 0) reasons.push('Baut Schwellenländer auf')
    }
    if (prof.countries['GB'] || prof.countries['DE'] || prof.countries['FR']) {
      if (deficitsByRegion.EU > 0) reasons.push('Baut Europa auf')
    }

    return {
      pos,
      score,
      reason: reasons.length > 0 ? reasons.join(' · ') : 'Unterstützt regionale Zielquote',
    }
  })

  // 4. Filtern nach Nutzer-Auswahl oder Top N mit positivem Beitrag
  let selected = scoredPositions
  if (options?.selectedKeys && options.selectedKeys.length > 0) {
    selected = scoredPositions.filter((sp) => options.selectedKeys!.includes(sp.pos.key))
  } else {
    // Nur Positionen mit echtem Beitrag zum Abbau von Defiziten auswählen
    const positiveScored = scoredPositions.filter((sp) => sp.score > 0)
    const pool = positiveScored.length > 0 ? positiveScored : scoredPositions
    selected = [...pool].sort((a, b) => b.score - a.score).slice(0, maxPos)
  }

  if (selected.length === 0) return []

  // 5. Budget auf die gewählten Positionen verteilen
  const totalScore = selected.reduce((s, sp) => s + Math.max(0.01, sp.score), 0)
  let remainingBudget = monthlyBudget
  const items: SparplanItem[] = []

  selected.forEach((sp, idx) => {
    const isLast = idx === selected.length - 1
    const rawShare = (Math.max(0.01, sp.score) / totalScore) * monthlyBudget
    // Runden auf 25 € Schritte
    let roundedAmount = Math.max(25, Math.round(rawShare / 25) * 25)

    if (isLast) {
      roundedAmount = Math.max(25, remainingBudget)
    } else {
      roundedAmount = Math.min(roundedAmount, remainingBudget - 25 * (selected.length - idx - 1))
      remainingBudget -= roundedAmount
    }

    items.push({
      key: sp.pos.key,
      profileId: sp.pos.profile!.id,
      name: sp.pos.name,
      isin: sp.pos.profile!.isins[0] || '',
      amount: roundedAmount,
      shareOfBudget: monthlyBudget > 0 ? roundedAmount / monthlyBudget : 0,
      reason: sp.reason,
      enabled: true,
    })
  })

  return items.sort((a, b) => b.amount - a.amount)
}

/**
 * Simuliert die zeitliche Entwicklung des Portfolios Monat für Monat bei gegebener Sparrate.
 * Ermittelt den Zeitpunkt, wann die Regionenverteilung und die Size-Faktor-Verteilung erreicht sind.
 */
export function projectSparplanTimeline(
  positions: CorePosition[],
  sparplan: SparplanItem[],
  targetStage: TargetStage,
  maxMonths = 60
): SparplanProjection {
  const activePositions = positions.filter((p) => p.profile !== null && p.value > 0)
  const activeSparplan = sparplan.filter((s) => s.enabled && s.amount > 0)

  const monthlyAmountsByKey = new Map<string, number>()
  for (const s of activeSparplan) {
    monthlyAmountsByKey.set(s.key, s.amount)
  }

  let monthsToRegionTarget: number | null = null
  let monthsToSizeTarget: number | null = null
  let monthsToAllTargets: number | null = null

  const timeline: ProjectionPoint[] = []
  const milestoneMonths = new Set<number>([0, 1, 2, 3, 6, 9, 12, 18, 24, 36, 48, maxMonths])

  let finalExposure = computeCoreExposure(activePositions)

  for (let m = 0; m <= maxMonths; m++) {
    const deltas: Record<string, number> = {}
    for (const pos of activePositions) {
      const monthlyRate = monthlyAmountsByKey.get(pos.key) || 0
      deltas[pos.key] = m * monthlyRate
    }

    const exp = computeCoreExposure(activePositions, deltas)
    if (m === maxMonths) finalExposure = exp

    // Regionen-Check
    const allRegionsInTolerance = targetStage.groups.every((g) => {
      const curShare = g.regions.reduce((s, r) => s + (exp.regions[r] || 0), 0)
      return Math.abs(curShare - g.target) <= REGION_TOLERANCE
    })

    // Size-Check (Small Cap)
    // Bei Stufe 3: ~14 % Ziel, Toleranzbereich 12 % bis 16 % oder >= 13.5 %
    const sizeInTarget =
      targetStage.id === 'stage3'
        ? exp.size.small >= 0.12 && exp.size.small <= 0.165
        : true // Bei Stufe 2 gibt es kein Small-Cap Ziel

    if (allRegionsInTolerance && monthsToRegionTarget === null) {
      monthsToRegionTarget = m
      milestoneMonths.add(m)
    }

    if (sizeInTarget && monthsToSizeTarget === null) {
      monthsToSizeTarget = m
      milestoneMonths.add(m)
    }

    if (allRegionsInTolerance && sizeInTarget && monthsToAllTargets === null) {
      monthsToAllTargets = m
      milestoneMonths.add(m)
    }

    if (milestoneMonths.has(m) || m === monthsToRegionTarget || m === monthsToSizeTarget || m === monthsToAllTargets) {
      timeline.push({
        month: m,
        totalValue: exp.total,
        usShare: exp.regions.US || 0,
        euShare: exp.regions.EU || 0,
        emShare: exp.regions.EM || 0,
        jpShare: exp.regions.JP || 0,
        pacShare: exp.regions.PAC || 0,
        caShare: exp.regions.CA || 0,
        smallCapShare: exp.size.small || 0,
        factorShare: exp.roleShares.factor || 0,
        allRegionsInTolerance,
        sizeInTarget,
      })
    }
  }

  // Sicherstellen, dass timeline nach Monaten sortiert und eindeutig ist
  const uniqueTimeline = Array.from(new Map(timeline.map((p) => [p.month, p])).values()).sort(
    (a, b) => a.month - b.month
  )

  return {
    monthsToRegionTarget,
    monthsToSizeTarget,
    monthsToAllTargets,
    timeline: uniqueTimeline,
    finalExposure,
  }
}

/**
 * Erstellt Kauf- bzw. Rebalancing-Empfehlungen auf Basis des gewählten Whitepaper-Soll-Modells (Stufe 2 oder 3).
 * Berücksichtigt vorhandene ETFs, falls vorhanden, sonst Fallback auf Modell-ETFs.
 */
export function optimizeCoreOrders(
  positions: CorePosition[],
  targetStage: TargetStage,
  budget: number,
  mode: 'buy-only' | 'rebalance' = 'buy-only',
  minOrderSize = 25
): OptimizationResult {
  const allProfiles = getAllProfiles()
  const profileMap = new Map(allProfiles.map((p) => [p.id, p]))

  // Wenn der Nutzer vorhandene Core-Positionen hat und im Modus 'buy-only' ist:
  // Nutze die Sparplan-Optimierung über die vorhandenen ETFs!
  const activeExistingPositions = positions.filter((p) => p.profile !== null && p.value > 0)

  if (mode === 'buy-only' && activeExistingPositions.length > 0) {
    const sparplanItems = optimizeExistingCoreSparplan(activeExistingPositions, targetStage, budget, {
      maxPositions: 4,
    })

    const orders: OrderRecommendation[] = sparplanItems.map((item) => ({
      profileId: item.profileId,
      name: item.name,
      isin: item.isin,
      action: 'BUY',
      amount: item.amount,
      targetShare: item.shareOfBudget,
      reason: item.reason,
    }))

    const simulatedDeltas: Record<string, number> = {}
    let budgetUsed = 0
    for (const item of sparplanItems) {
      simulatedDeltas[item.key] = item.amount
      budgetUsed += item.amount
    }

    return {
      orders,
      budgetUsed,
      remainingBudget: Math.max(0, budget - budgetUsed),
      simulatedDeltas,
    }
  }

  // Fallback / Rebalance Modus:
  const currentValueByProfile = new Map<string, number>()
  const positionKeyByProfile = new Map<string, string>()

  for (const pos of positions) {
    if (pos.profile) {
      const pid = pos.profile.id
      currentValueByProfile.set(pid, (currentValueByProfile.get(pid) || 0) + pos.value)
      if (!positionKeyByProfile.has(pid)) {
        positionKeyByProfile.set(pid, pos.key)
      }
    }
  }

  const currentTotal = positions.reduce((s, p) => s + p.value, 0)
  const targetTotal = mode === 'buy-only' ? currentTotal + Math.max(0, budget) : currentTotal

  const orders: OrderRecommendation[] = []
  const simulatedDeltas: Record<string, number> = {}

  if (mode === 'buy-only') {
    if (budget <= 0) {
      return { orders: [], budgetUsed: 0, remainingBudget: 0, simulatedDeltas: {} }
    }

    const deficits: Array<{ profile: CoreProfile; deficit: number; weight: number }> = []

    for (const item of targetStage.model) {
      const prof = profileMap.get(item.profileId) || BUILTIN_PROFILES.find((p) => p.id === item.profileId)
      if (!prof) continue

      const curVal = currentValueByProfile.get(prof.id) || 0
      const desiredVal = targetTotal * item.weight
      const deficit = Math.max(0, desiredVal - curVal)

      if (deficit > 0) {
        deficits.push({ profile: prof, deficit, weight: item.weight })
      }
    }

    const totalDeficit = deficits.reduce((s, d) => s + d.deficit, 0)
    let allocatedTotal = 0

    if (totalDeficit > 0) {
      for (const item of deficits) {
        const rawShare = (item.deficit / totalDeficit) * budget
        const roundedAmount = Math.floor(rawShare / 5) * 5

        if (roundedAmount >= minOrderSize) {
          allocatedTotal += roundedAmount
          orders.push({
            profileId: item.profile.id,
            name: item.profile.name,
            isin: item.profile.isins[0] || '',
            action: 'BUY',
            amount: roundedAmount,
            targetShare: item.weight,
            reason: `Untergewicht im Soll-Modell (${(item.weight * 100).toFixed(0)} % Zielquote)`,
          })

          const key = positionKeyByProfile.get(item.profile.id) || item.profile.id
          simulatedDeltas[key] = (simulatedDeltas[key] || 0) + roundedAmount
        }
      }
    }

    return {
      orders: orders.sort((a, b) => b.amount - a.amount),
      budgetUsed: allocatedTotal,
      remainingBudget: Math.max(0, budget - allocatedTotal),
      simulatedDeltas,
    }
  } else {
    // Rebalance Modus
    let netBought = 0
    for (const item of targetStage.model) {
      const prof = profileMap.get(item.profileId) || BUILTIN_PROFILES.find((p) => p.id === item.profileId)
      if (!prof) continue

      const curVal = currentValueByProfile.get(prof.id) || 0
      const targetVal = targetTotal * item.weight
      const diff = targetVal - curVal
      const rounded = Math.round(diff / 5) * 5

      if (Math.abs(rounded) >= minOrderSize) {
        const isBuy = rounded > 0
        orders.push({
          profileId: prof.id,
          name: prof.name,
          isin: prof.isins[0] || '',
          action: isBuy ? 'BUY' : 'SELL',
          amount: Math.abs(rounded),
          targetShare: item.weight,
          reason: isBuy
            ? `Aufstockung auf Soll-Quote (${(item.weight * 100).toFixed(0)} %)`
            : `Gewinnmitnahme / Rebalancing auf Soll-Quote (${(item.weight * 100).toFixed(0)} %)`,
        })

        const key = positionKeyByProfile.get(prof.id) || prof.id
        simulatedDeltas[key] = (simulatedDeltas[key] || 0) + rounded
        if (isBuy) netBought += rounded
      }
    }

    return {
      orders: orders.sort((a, b) => b.amount - a.amount),
      budgetUsed: netBought,
      remainingBudget: 0,
      simulatedDeltas,
    }
  }
}

function getProfileRegionShares(profile: CoreProfile): Record<RegionKey, number> {
  const shares: Record<RegionKey, number> = { US: 0, CA: 0, EU: 0, JP: 0, PAC: 0, EM: 0 }
  const countrySum = Object.values(profile.countries).reduce((s, v) => s + (v > 0 ? v : 0), 0) || 100
  for (const [cCode, rawVal] of Object.entries(profile.countries)) {
    if (rawVal <= 0) continue
    const rKey = regionOf(cCode)
    shares[rKey] += rawVal / countrySum
  }
  return shares
}

/**
 * Erkennt strukturelle Engpässe im Core-Depot (fehlende Profile, Faktor-Budget > 20 %, fehlende Regionen/Small-Caps).
 */
export function diagnoseCoreGaps(
  positions: CorePosition[],
  exposure: CoreExposure,
  targetStage: TargetStage,
  targetExposure: CoreExposure
): CoreGapDiagnostic[] {
  const diagnostics: CoreGapDiagnostic[] = []
  const allProfiles = getAllProfiles()
  const profileMap = new Map(allProfiles.map((p) => [p.id, p]))
  const builtinMap = new Map(BUILTIN_PROFILES.map((p) => [p.id, p]))

  // 1. Nicht zugeordnete Core-ETFs
  const unmatched = positions.filter((p) => !p.profile && p.value > 0)
  if (unmatched.length > 0) {
    const names = unmatched.map((u) => u.name).slice(0, 2).join(', ')
    const suffix = unmatched.length > 2 ? ` (+${unmatched.length - 2} weitere)` : ''
    diagnostics.push({
      id: 'unmatched-profiles',
      severity: 'warning',
      title: `${unmatched.length} Core-${unmatched.length === 1 ? 'ETF' : 'ETFs'} ohne Look-Through Profil`,
      detail: `${names}${suffix} fließt aktuell nicht in Länder-, Cap- und Regionen-Quoten ein.`,
      actionType: 'open-holdings',
    })
  }

  // 2. Faktor-Budget > 20 %
  if (exposure.roleShares.factor > FACTOR_BUDGET_CAP) {
    const pct = (exposure.roleShares.factor * 100).toFixed(1)
    diagnostics.push({
      id: 'factor-budget-over',
      severity: 'warning',
      title: `Faktor-Budget bei ${pct} % (über 20 %-Cap)`,
      detail: 'Neue Sparraten bevorzugt in meinungsfreie Markt-Core-ETFs lenken, um den Faktor-Anteil unter 20 % zu drücken.',
    })
  }

  const coveredPositions = positions.filter((p) => p.profile !== null && p.value > 0)

  // 3. Fehlender regionaler Zugang über bestehende ETFs
  const missingRegionGroups: Array<{ label: string; deficit: number; regions: RegionKey[]; modelProf: CoreProfile | null }> = []
  for (const group of targetStage.groups) {
    const curShare = group.regions.reduce((s, r) => s + (exposure.regions[r] || 0), 0)
    const deficit = group.target - curShare
    if (deficit <= REGION_TOLERANCE) continue

    const hasAccess = coveredPositions.some((pos) => {
      const rShares = getProfileRegionShares(pos.profile!)
      const groupShare = group.regions.reduce((s, r) => s + (rShares[r] || 0), 0)
      return groupShare >= 0.2
    })

    if (!hasAccess) {
      let bestModelProf: CoreProfile | null = null
      let bestGroupShare = 0
      for (const m of targetStage.model) {
        const prof = profileMap.get(m.profileId) ?? builtinMap.get(m.profileId) ?? null
        if (!prof) continue
        const rShares = getProfileRegionShares(prof)
        const groupShare = group.regions.reduce((s, r) => s + (rShares[r] || 0), 0)
        if (groupShare > bestGroupShare) {
          bestGroupShare = groupShare
          bestModelProf = prof
        }
      }
      missingRegionGroups.push({
        label: `${group.label} (Ziel ${(group.target * 100).toFixed(0)} %)`,
        deficit,
        regions: group.regions,
        modelProf: bestModelProf,
      })
    }
  }

  if (missingRegionGroups.length > 0) {
    missingRegionGroups.sort((a, b) => b.deficit - a.deficit)
    const primary = missingRegionGroups[0]
    const allLabels = missingRegionGroups.slice(0, 3).map((g) => g.label).join(', ')
    const suggestionText = primary.modelProf
      ? ` Ergänzbar z. B. mit ${primary.modelProf.name} (${primary.modelProf.isins[0] || ''}).`
      : ''
    diagnostics.push({
      id: 'missing-region-access',
      severity: 'info',
      title: `Fehlender Regionen-Zugang im Bestand`,
      detail: `Für ${allLabels} existiert aktuell kein dedizierter ETF im Depot.${suggestionText}`,
      actionType: 'enable-candidates',
      suggestedProfileName: primary.modelProf?.name,
      suggestedIsin: primary.modelProf?.isins[0],
    })
  }

  // 4. Fehlendes Small-Cap-Exposure in Stufe 3
  if (
    targetStage.id === 'stage3' &&
    exposure.size.small < targetExposure.size.small - 0.02
  ) {
    const hasSmallCapFund = coveredPositions.some((pos) => (pos.profile!.size.small || 0) >= 30)
    if (!hasSmallCapFund) {
      const scProf =
        profileMap.get('wp-xtrackers-russell-2000') ??
        builtinMap.get('wp-xtrackers-russell-2000') ??
        profileMap.get('wp-vanguard-dev-europe-small-cap') ??
        builtinMap.get('wp-vanguard-dev-europe-small-cap') ??
        null
      diagnostics.push({
        id: 'missing-smallcap-access',
        severity: 'info',
        title: `Kein dedizierter Small-Cap-ETF vorhanden`,
        detail: `Stufe 3 zielt auf ${(targetExposure.size.small * 100).toFixed(0)} % Small Caps ab${scProf ? ` (z. B. über ${scProf.name})` : ''}.`,
        actionType: 'enable-candidates',
        suggestedProfileName: scProf?.name,
        suggestedIsin: scProf?.isins[0],
      })
    }
  }

  return diagnostics.slice(0, 3)
}

function allocateRoadmapStep(
  pool: CorePosition[],
  targetStage: TargetStage,
  monthlyBudget: number,
  maxPositions: number,
  selectedKeys?: string[]
): { items: SparplanItem[]; primaryFocusRegions: RegionKey[]; targetsSmallCap: boolean } {
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

    // Geringe Grundpräferenz für Markt-Core vs. Cashflow-Satellit
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

function areAllocationsCompatible(a: SparplanItem[], b: SparplanItem[]): boolean {
  if (a.length !== b.length) return false
  const mapA = new Map(a.map((item) => [item.key, item.amount]))
  for (const item of b) {
    const prevAmt = mapA.get(item.key)
    if (prevAmt === undefined) return false
    if (Math.abs(prevAmt - item.amount) > 50) return false
  }
  return true
}

function buildPhaseTitleAndFocus(
  phaseNumber: number,
  items: SparplanItem[],
  focusRegions: RegionKey[],
  targetsSmallCap: boolean
): { title: string; focusSummary: string } {
  const parts: string[] = []
  for (const r of focusRegions.slice(0, 2)) {
    parts.push(REGION_LABELS[r])
  }
  if (targetsSmallCap) parts.push('Small Caps')

  const focusText = parts.length > 0 ? parts.join(' & ') : 'Regionale Ausbalancierung'
  const title =
    phaseNumber === 1
      ? `Phase 1: Größte Lücken schließen (${focusText})`
      : phaseNumber === 2
      ? `Phase 2: Feinsteuerung (${focusText})`
      : `Phase ${phaseNumber}: Ziel-Annäherung (${focusText})`

  const topEtfNames = items.slice(0, 2).map((i) => i.name).join(' + ')
  return {
    title,
    focusSummary: `Schwerpunkt auf ${focusText} über ${topEtfNames}${items.length > 2 ? ` (+${items.length - 2})` : ''}.`,
  }
}

/**
 * Erstellt einen mehrstufigen monatlichen Fahrplan inkl. Szenario-Vorschau (12 M / Ziel)
 * über bestehende Core-ETFs oder optional inklusive fehlender Whitepaper-Bausteine.
 */
export function buildPhasedRoadmap(
  positions: CorePosition[],
  targetStage: TargetStage,
  monthlyBudget: number,
  options?: {
    maxPositions?: number
    maxMonths?: number
    includeModelCandidates?: boolean
    selectedKeys?: string[]
  }
): CoreRoadmap {
  const maxMonths = options?.maxMonths ?? 36
  const maxPositions = Math.max(1, Math.min(4, options?.maxPositions ?? 4))
  const includeCandidates = Boolean(options?.includeModelCandidates)
  const selectedFilter = !includeCandidates ? options?.selectedKeys : undefined

  const activeExisting = positions.filter((p) => p.profile !== null && p.value > 0)
  const pool: CorePosition[] = [...activeExisting]

  if (includeCandidates) {
    const allProfiles = getAllProfiles()
    const profileMap = new Map(allProfiles.map((p) => [p.id, p]))
    const builtinMap = new Map(BUILTIN_PROFILES.map((p) => [p.id, p]))
    const heldProfileIds = new Set(activeExisting.map((p) => p.profile!.id))

    for (const item of targetStage.model) {
      if (heldProfileIds.has(item.profileId)) continue
      const prof = profileMap.get(item.profileId) ?? builtinMap.get(item.profileId)
      if (!prof) continue
      pool.push({
        key: `candidate-${prof.id}`,
        name: prof.name,
        value: 0,
        profile: prof,
        role: prof.role,
        isCandidate: true,
      })
    }
  }

  const baseExposure = computeCoreExposure(pool)
  const checkTargets = (exp: CoreExposure) => {
    const allRegionsInTolerance = targetStage.groups.every((g) => {
      const curShare = g.regions.reduce((s, r) => s + (exp.regions[r] || 0), 0)
      return Math.abs(curShare - g.target) <= REGION_TOLERANCE
    })
    const sizeInTarget =
      targetStage.id === 'stage3'
        ? exp.size.small >= 0.12 && exp.size.small <= 0.165
        : true
    return { allRegionsInTolerance, sizeInTarget }
  }

  const initialStatus = checkTargets(baseExposure)
  let monthsToRegionTarget: number | null = initialStatus.allRegionsInTolerance ? 0 : null
  let monthsToSizeTarget: number | null = initialStatus.sizeInTarget ? 0 : null
  let monthsToAllTargets: number | null =
    initialStatus.allRegionsInTolerance && initialStatus.sizeInTarget ? 0 : null

  const toPoint = (month: number, exp: CoreExposure): ProjectionPoint => {
    const status = checkTargets(exp)
    return {
      month,
      totalValue: exp.total,
      usShare: exp.regions.US || 0,
      euShare: exp.regions.EU || 0,
      emShare: exp.regions.EM || 0,
      jpShare: exp.regions.JP || 0,
      pacShare: exp.regions.PAC || 0,
      caShare: exp.regions.CA || 0,
      smallCapShare: exp.size.small || 0,
      factorShare: exp.roleShares.factor || 0,
      allRegionsInTolerance: status.allRegionsInTolerance,
      sizeInTarget: status.sizeInTarget,
    }
  }

  const timeline: ProjectionPoint[] = [toPoint(0, baseExposure)]
  const cumulativeDeltas: Record<string, number> = {}
  let exposureAfter12m = baseExposure
  let deltas12m: Record<string, number> = {}
  let deltasToTarget: Record<string, number> = {}
  let exposureAtEnd = baseExposure

  interface RawStep {
    month: number
    items: SparplanItem[]
    focusRegions: RegionKey[]
    targetsSmallCap: boolean
    milestoneReached?: string
  }
  const rawSteps: RawStep[] = []
  let currentStepAlloc = allocateRoadmapStep(pool, targetStage, monthlyBudget, maxPositions, selectedFilter)

  for (let m = 1; m <= maxMonths; m++) {
    const monthIdx = m - 1
    if (monthIdx > 0 && monthIdx % 3 === 0) {
      const virtualPool = pool.map((p) => ({
        ...p,
        value: p.value + (cumulativeDeltas[p.key] || 0),
      }))
      currentStepAlloc = allocateRoadmapStep(
        virtualPool,
        targetStage,
        monthlyBudget,
        maxPositions,
        selectedFilter
      )
    }

    for (const item of currentStepAlloc.items) {
      cumulativeDeltas[item.key] = (cumulativeDeltas[item.key] || 0) + item.amount
    }

    const exp = computeCoreExposure(pool, cumulativeDeltas)
    const status = checkTargets(exp)
    const milestonesNow: string[] = []

    if (status.allRegionsInTolerance && monthsToRegionTarget === null) {
      monthsToRegionTarget = m
      milestonesNow.push(`Regionen-Ziel in Monat ${m}`)
    }
    if (status.sizeInTarget && monthsToSizeTarget === null) {
      monthsToSizeTarget = m
      if (targetStage.id === 'stage3') milestonesNow.push(`Small-Cap-Ziel in Monat ${m}`)
    }
    if (status.allRegionsInTolerance && status.sizeInTarget && monthsToAllTargets === null) {
      monthsToAllTargets = m
      deltasToTarget = { ...cumulativeDeltas }
      milestonesNow.push(`Gesamtziel erreicht in Monat ${m}`)
    }

    if (monthlyBudget > 0 && currentStepAlloc.items.length > 0 && (monthsToAllTargets === null || monthsToAllTargets === m)) {
      rawSteps.push({
        month: m,
        items: currentStepAlloc.items,
        focusRegions: currentStepAlloc.primaryFocusRegions,
        targetsSmallCap: currentStepAlloc.targetsSmallCap,
        milestoneReached: milestonesNow[0],
      })
    }

    if (m === Math.min(12, maxMonths)) {
      exposureAfter12m = exp
      deltas12m = { ...cumulativeDeltas }
    }
    if (m === maxMonths) {
      exposureAtEnd = exp
    }

    if (m % 3 === 0 || m === maxMonths || milestonesNow.length > 0) {
      timeline.push(toPoint(m, exp))
    }
  }

  if (monthsToAllTargets === null) {
    deltasToTarget = { ...cumulativeDeltas }
  }

  // Konsekutive Monate zu lesbaren Phasen zusammenfassen
  const groupedPhases: RoadmapPhase[] = []
  for (const step of rawSteps) {
    const last = groupedPhases[groupedPhases.length - 1]
    if (last && areAllocationsCompatible(last.allocations, step.items)) {
      last.endMonth = step.month
      if (step.milestoneReached) {
        last.milestoneReached = step.milestoneReached
      }
    } else {
      const phaseNumber = groupedPhases.length + 1
      const meta = buildPhaseTitleAndFocus(
        phaseNumber,
        step.items,
        step.focusRegions,
        step.targetsSmallCap
      )
      groupedPhases.push({
        phaseNumber,
        startMonth: step.month,
        endMonth: step.month,
        title: meta.title,
        focusSummary: meta.focusSummary,
        milestoneReached: step.milestoneReached,
        allocations: step.items,
      })
    }
  }

  // Maximal 3 Phasen behalten, damit der Fahrplan übersichtlich bleibt
  while (groupedPhases.length > 3) {
    const last = groupedPhases.pop()!
    const prev = groupedPhases[groupedPhases.length - 1]
    prev.endMonth = last.endMonth
    if (last.milestoneReached) {
      prev.milestoneReached = last.milestoneReached
    }
  }

  return {
    phases: groupedPhases,
    monthsToRegionTarget,
    monthsToSizeTarget,
    monthsToAllTargets,
    timeline,
    exposureAfter12m,
    deltas12m,
    deltasToTarget,
    exposureAtEnd,
  }
}
