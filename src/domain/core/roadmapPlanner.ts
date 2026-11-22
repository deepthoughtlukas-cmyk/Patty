import { BUILTIN_PROFILES } from '../../utils/core/builtinProfiles'
import { computeCoreExposure } from '../../utils/core/coreExposure'
import { REGION_LABELS } from '../../utils/core/countries'
import { getAllProfiles } from '../../utils/core/profileStore'
import { DEFAULT_FRONTIER_CAP, REGION_TOLERANCE } from '../../utils/core/targets'
import type { CoreExposure, CorePosition, RegionKey, TargetStage } from '../../utils/core/types'
import { scoreAndAllocateMonthlyStep, type SparplanItem } from './scoring'

export type { SparplanItem }

export interface ProjectionPoint {
  month: number
  totalValue: number
  usShare: number
  euShare: number
  emShare: number
  fmShare: number
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
    frontierCap?: number
  }
): SparplanItem[] {
  const maxPos = options?.maxPositions ?? 4
  const frontierCap = options?.frontierCap ?? DEFAULT_FRONTIER_CAP
  const activePositions = positions.filter((p) => p.profile !== null && p.value > 0)
  return scoreAndAllocateMonthlyStep(
    activePositions,
    targetStage,
    monthlyBudget,
    maxPos,
    options?.selectedKeys,
    frontierCap
  ).items
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

    const allRegionsInTolerance = targetStage.groups.every((g) => {
      const curShare = g.regions.reduce((s, r) => s + (exp.regions[r] || 0), 0)
      return Math.abs(curShare - g.target) <= REGION_TOLERANCE
    })

    const sizeInTarget =
      targetStage.id === 'stage3'
        ? exp.size.small >= 0.12 && exp.size.small <= 0.165
        : true

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

    if (
      milestoneMonths.has(m) ||
      m === monthsToRegionTarget ||
      m === monthsToSizeTarget ||
      m === monthsToAllTargets
    ) {
      timeline.push({
        month: m,
        totalValue: exp.total,
        usShare: exp.regions.US || 0,
        euShare: exp.regions.EU || 0,
        emShare: exp.regions.EM || 0,
        fmShare: exp.regions.FM || 0,
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
  focusLabels: string[],
  targetsSmallCap: boolean
): { title: string; focusSummary: string } {
  const parts: string[] = []
  if (focusLabels.length > 0) {
    for (const lbl of focusLabels.slice(0, 2)) {
      parts.push(lbl)
    }
  } else {
    for (const r of focusRegions.slice(0, 2)) {
      if (r !== 'FM') parts.push(REGION_LABELS[r])
    }
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
    frontierCap?: number
  }
): CoreRoadmap {
  const maxMonths = options?.maxMonths ?? 36
  const maxPositions = Math.max(1, Math.min(4, options?.maxPositions ?? 4))
  const includeCandidates = Boolean(options?.includeModelCandidates)
  const selectedFilter = !includeCandidates ? options?.selectedKeys : undefined
  const frontierCap = options?.frontierCap ?? DEFAULT_FRONTIER_CAP

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
      targetStage.id === 'stage3' ? exp.size.small >= 0.12 && exp.size.small <= 0.165 : true
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
      fmShare: exp.regions.FM || 0,
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
    focusLabels: string[]
    targetsSmallCap: boolean
    milestoneReached?: string
  }
  const rawSteps: RawStep[] = []
  let currentStepAlloc = scoreAndAllocateMonthlyStep(
    pool,
    targetStage,
    monthlyBudget,
    maxPositions,
    selectedFilter,
    frontierCap
  )

  let prevExposure = baseExposure

  for (let m = 1; m <= maxMonths; m++) {
    const monthIdx = m - 1
    const hasSatelliteActive = currentStepAlloc.items.some((i) => i.isSatellite)
    const frontierReachedCap =
      hasSatelliteActive &&
      frontierCap > 0 &&
      (prevExposure.regions.FM || 0) >= frontierCap - 0.002

    if ((monthIdx > 0 && monthIdx % 3 === 0) || frontierReachedCap) {
      const virtualPool = pool.map((p) => ({
        ...p,
        value: p.value + (cumulativeDeltas[p.key] || 0),
      }))
      currentStepAlloc = scoreAndAllocateMonthlyStep(
        virtualPool,
        targetStage,
        monthlyBudget,
        maxPositions,
        selectedFilter,
        frontierCap
      )
    }

    for (const item of currentStepAlloc.items) {
      cumulativeDeltas[item.key] = (cumulativeDeltas[item.key] || 0) + item.amount
    }

    const exp = computeCoreExposure(pool, cumulativeDeltas)
    prevExposure = exp
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

    if (
      monthlyBudget > 0 &&
      currentStepAlloc.items.length > 0 &&
      (monthsToAllTargets === null || monthsToAllTargets === m)
    ) {
      rawSteps.push({
        month: m,
        items: currentStepAlloc.items,
        focusRegions: currentStepAlloc.primaryFocusRegions,
        focusLabels: currentStepAlloc.primaryFocusLabels,
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
        step.focusLabels,
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

  while (groupedPhases.length > 3) {
    // Keep Phase 1 (immediate plan) and the final phase (settled allocation after caps/milestones),
    // merging intermediate transition steps into the middle phase.
    const removed = groupedPhases.splice(2, 1)[0]
    const middle = groupedPhases[1]
    middle.endMonth = removed.endMonth
    if (removed.milestoneReached && !middle.milestoneReached) {
      middle.milestoneReached = removed.milestoneReached
    }
  }
  groupedPhases.forEach((p, idx) => {
    p.phaseNumber = idx + 1
  })

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
