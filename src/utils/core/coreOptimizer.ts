import { BUILTIN_PROFILES } from './builtinProfiles'
import { computeCoreExposure } from './coreExposure'
import { getAllProfiles } from './profileStore'
import { REGION_TOLERANCE } from './targets'
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
