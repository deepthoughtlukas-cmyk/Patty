import type { Investment } from '../parser'
import { investmentKey, validIsin } from '../userRules'
import { currencyOf, regionOf, ALL_FACTORS } from './countries'
import { BUILTIN_PROFILES } from './builtinProfiles'
import { getAllProfiles, loadRoleOverrides } from './profileStore'
import { FACTOR_BUDGET_CAP, REGION_TOLERANCE } from './targets'
import type { CoreExposure, CorePosition, CoreProfile, CoreRole, FactorKey, RegionKey, SizeSplit, TargetStage } from './types'

/**
 * Filtert alle aktiven Core-Investments heraus:
 * Gehört zur Kategorie 'Stocks' und Subkategorie 'Core' (Groß-/Kleinschreibung tolerant).
 */
export function extractCoreInvestments(investments: Investment[]): Investment[] {
  return investments.filter(
    (inv) => inv.category === 'Stocks' && (inv.subcategory || '').toLowerCase().trim() === 'core' && inv.currentValue > 0
  )
}

/**
 * Findet das passende Profil für ein Investment:
 * 1. Exakter ISIN-Treffer (höchste Priorität)
 * 2. Token-basiertes Matching im Namen (alle Tokens einer Gruppe müssen vorkommen, Excludes dürfen nicht vorkommen)
 */
export function findProfileForInvestment(inv: Investment, profiles: CoreProfile[]): CoreProfile | null {
  const isin = validIsin(inv.isin).toUpperCase()
  if (isin) {
    const byIsin = profiles.find((p) => p.isins.some((i) => i.toUpperCase() === isin))
    if (byIsin) return byIsin
  }

  const nameLower = (inv.name || '').toLowerCase()
  for (const p of profiles) {
    if (p.excludes && p.excludes.some((ex) => nameLower.includes(ex.toLowerCase()))) {
      continue
    }
    const matchGroup = p.matchers.some((group) => group.every((tok) => nameLower.includes(tok.toLowerCase())))
    if (matchGroup) return p
  }

  return null
}

/**
 * Erstellt die Liste der Core-Positionen inklusive gematchtem Profil und Rollen-Override.
 */
export function buildCorePositions(
  investments: Investment[],
  profiles: CoreProfile[] = getAllProfiles(),
  roleOverrides: Record<string, CoreRole> = loadRoleOverrides()
): CorePosition[] {
  const coreInvs = extractCoreInvestments(investments)
  return coreInvs.map((inv) => {
    const key = investmentKey(inv)
    const profile = findProfileForInvestment(inv, profiles)
    const role: CoreRole = (profile && roleOverrides[profile.id]) || (profile ? profile.role : 'market')
    return {
      key,
      name: inv.customName || inv.name,
      value: inv.currentValue,
      profile,
      role,
    }
  })
}

/**
 * Berechnet die gewichtete Exposure-Zusammenfassung (Länder, Regionen, Währungen, Size, Faktoren, TER).
 * Optional können simulierte Wertänderungen (Deltas in €) je Position übergeben werden.
 */
export function computeCoreExposure(
  positions: CorePosition[],
  simulatedDeltas: Record<string, number> = {}
): CoreExposure {
  const activePositions = positions
    .map((pos) => ({
      ...pos,
      effectiveValue: Math.max(0, pos.value + (simulatedDeltas[pos.key] || 0)),
    }))
    .filter((p) => p.effectiveValue > 0)

  const total = activePositions.reduce((s, p) => s + p.effectiveValue, 0)
  const coveredPositions = activePositions.filter((p) => p.profile !== null)
  const covered = coveredPositions.reduce((s, p) => s + p.effectiveValue, 0)
  const coverage = total > 0 ? covered / total : 0

  const countries: Record<string, number> = {}
  const regions: Record<RegionKey, number> = { US: 0, CA: 0, EU: 0, JP: 0, PAC: 0, EM: 0 }
  const currencies: Record<string, number> = {}
  const size: SizeSplit = { large: 0, mid: 0, small: 0 }
  const factors: Record<FactorKey, number> = { quality: 0, value: 0, momentum: 0, lowVol: 0, dividend: 0, size: 0 }
  const roleSums: Record<CoreRole, number> = { market: 0, factor: 0, cashflow: 0 }
  let weightedTerSum = 0
  let terWeightTotal = 0

  // 1. Rollen-Anteile bezogen auf den Gesamtwert (auch nicht abgedeckte gelten als 'market')
  for (const pos of activePositions) {
    const r = pos.role || 'market'
    roleSums[r] = (roleSums[r] || 0) + pos.effectiveValue
  }

  const roleShares: Record<CoreRole, number> = {
    market: total > 0 ? roleSums.market / total : 0,
    factor: total > 0 ? roleSums.factor / total : 0,
    cashflow: total > 0 ? roleSums.cashflow / total : 0,
  }

  // 2. Look-Through Aggregation über abgedeckte Positionen
  if (covered > 0) {
    for (const pos of coveredPositions) {
      const p = pos.profile!
      const weightInCovered = pos.effectiveValue / covered

      // Länder normieren & aggregieren
      const rawCountrySum = Object.values(p.countries).reduce((s, v) => s + (v > 0 ? v : 0), 0) || 100
      for (const [cCode, rawVal] of Object.entries(p.countries)) {
        if (rawVal <= 0) continue
        const normShare = (rawVal / rawCountrySum) * weightInCovered
        countries[cCode] = (countries[cCode] || 0) + normShare

        // Region aggregieren
        const rKey = regionOf(cCode)
        regions[rKey] = (regions[rKey] || 0) + normShare

        // Währung aggregieren
        const curr = p.hedgedToEur ? 'EUR' : currencyOf(cCode)
        currencies[curr] = (currencies[curr] || 0) + normShare
      }

      // Size Split
      const sizeSum = (p.size.large || 0) + (p.size.mid || 0) + (p.size.small || 0) || 100
      size.large += ((p.size.large || 0) / sizeSum) * weightInCovered
      size.mid += ((p.size.mid || 0) / sizeSum) * weightInCovered
      size.small += ((p.size.small || 0) / sizeSum) * weightInCovered

      // Faktor-Scores
      for (const f of ALL_FACTORS) {
        const fVal = p.factors[f] || 0
        factors[f] += fVal * weightInCovered
      }

      // TER
      if (typeof p.ter === 'number') {
        weightedTerSum += p.ter * pos.effectiveValue
        terWeightTotal += pos.effectiveValue
      }
    }
  }

  const avgTer = terWeightTotal > 0 ? weightedTerSum / terWeightTotal : 0

  return {
    total,
    covered,
    coverage,
    countries,
    regions,
    currencies,
    size,
    factors,
    roleShares,
    ter: avgTer,
  }
}

export interface RegionGapItem {
  id: string
  label: string
  regions: RegionKey[]
  actual: number
  target: number
  diff: number
  eurDiff: number
  inTolerance: boolean
}

export interface CoreFitSummary {
  score: number
  regionsInBand: number
  totalRegionGroups: number
  regionGaps: RegionGapItem[]
  largestOverweight: RegionGapItem | null
  largestUnderweight: RegionGapItem | null
  smallCapActual: number
  smallCapTarget: number
  smallCapInBand: boolean
  factorOverBudget: boolean
}

/**
 * Berechnet das implizite Soll-Exposure (Länder, Regionen, Währungen, Size, Faktoren, TER)
 * direkt aus den Modell-Bausteinen einer Zielstrategie (Stufe 2 oder Stufe 3).
 */
export function computeStageTargetExposure(
  stage: TargetStage,
  profiles?: CoreProfile[]
): CoreExposure {
  const catalog = profiles ?? getAllProfiles()
  const catalogMap = new Map(catalog.map((p) => [p.id, p]))
  const builtinMap = new Map(BUILTIN_PROFILES.map((p) => [p.id, p]))

  const syntheticPositions: CorePosition[] = stage.model.map((item) => {
    const profile = catalogMap.get(item.profileId) ?? builtinMap.get(item.profileId) ?? null
    return {
      key: `target-${item.profileId}`,
      name: profile?.name ?? item.profileId,
      value: item.weight * 10000,
      profile,
      role: profile?.role ?? 'market',
    }
  })

  return computeCoreExposure(syntheticPositions)
}

/**
 * Verdichtet die Abweichungen zu Zielregionen, Market Cap und Faktor-Cap in einen 0-100 Core-Fit Score.
 */
export function computeCoreFitSummary(
  exposure: CoreExposure,
  targetStage: TargetStage,
  targetExposure: CoreExposure
): CoreFitSummary {
  const regionGaps: RegionGapItem[] = targetStage.groups.map((group) => {
    const actual = group.regions.reduce((s, r) => s + (exposure.regions[r] || 0), 0)
    const target = group.target
    const diff = actual - target
    const eurDiff = (target - actual) * exposure.total
    const inTolerance = Math.abs(diff) <= REGION_TOLERANCE
    return {
      id: group.id,
      label: group.label,
      regions: group.regions,
      actual,
      target,
      diff,
      eurDiff,
      inTolerance,
    }
  })

  const regionsInBand = regionGaps.filter((g) => g.inTolerance).length
  const totalRegionGroups = regionGaps.length

  const largestOverweight =
    regionGaps
      .filter((g) => !g.inTolerance && g.diff > 0)
      .sort((a, b) => b.diff - a.diff)[0] ?? null

  const largestUnderweight =
    regionGaps
      .filter((g) => !g.inTolerance && g.diff < 0)
      .sort((a, b) => a.diff - b.diff)[0] ?? null

  const l1Regions = regionGaps.reduce((s, g) => s + Math.abs(g.diff), 0)
  const smallCapActual = exposure.size.small
  const smallCapTarget = targetExposure.size.small
  const smallCapDiff = Math.abs(smallCapActual - smallCapTarget)
  const sizePenalty = targetStage.id === 'stage3' ? Math.max(0, smallCapDiff - 0.01) * 120 : 0
  const factorPenalty = Math.max(0, exposure.roleShares.factor - FACTOR_BUDGET_CAP) * 50

  const score = Math.round(Math.max(0, Math.min(100, 100 - l1Regions * 110 - sizePenalty - factorPenalty)))
  const smallCapInBand = targetStage.id === 'stage2' ? true : smallCapDiff <= 0.025
  const factorOverBudget = exposure.roleShares.factor > FACTOR_BUDGET_CAP

  return {
    score,
    regionsInBand,
    totalRegionGroups,
    regionGaps,
    largestOverweight,
    largestUnderweight,
    smallCapActual,
    smallCapTarget,
    smallCapInBand,
    factorOverBudget,
  }
}
