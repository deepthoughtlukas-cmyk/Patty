import { describe, it, expect } from 'vitest'
import type { CorePosition } from './types'
import { getStage } from './targets'
import {
  optimizeCoreOrders,
  optimizeExistingCoreSparplan,
  projectSparplanTimeline,
  diagnoseCoreGaps,
  buildPhasedRoadmap,
} from './coreOptimizer'
import { computeCoreExposure, computeStageTargetExposure } from './coreExposure'
import { BUILTIN_PROFILES } from './builtinProfiles'

describe('coreOptimizer logic with existing ETFs & projection', () => {
  const stage2 = getStage('stage2')
  const stage3 = getStage('stage3')

  // Sample portfolio similar to user's real holdings
  const userPositions: CorePosition[] = [
    {
      key: 'pos-qual',
      name: 'iShares World Quality',
      value: 9800,
      profile: BUILTIN_PROFILES.find((p) => p.id === 'ishares-edge-world-quality')!,
      role: 'factor',
    },
    {
      key: 'pos-world',
      name: 'Xtrackers MSCI World',
      value: 7200,
      profile: BUILTIN_PROFILES.find((p) => p.id === 'xtrackers-msci-world')!,
      role: 'market',
    },
    {
      key: 'pos-europe-sc',
      name: 'Xtrackers MSCI Europe Small Cap',
      value: 1300,
      profile: BUILTIN_PROFILES.find((p) => p.id === 'xtrackers-msci-europe-small-cap')!,
      role: 'market',
    },
    {
      key: 'pos-pan-asia',
      name: 'SPDR Pan Asia Dividend',
      value: 1100,
      profile: BUILTIN_PROFILES.find((p) => p.id === 'spdr-pan-asia-div-aristocrats')!,
      role: 'cashflow',
    },
    {
      key: 'pos-avantis-sc',
      name: 'Avantis Global Small Cap Value',
      value: 200,
      profile: BUILTIN_PROFILES.find((p) => p.id === 'avantis-global-small-cap-value')!,
      role: 'factor',
    },
    {
      key: 'pos-avantis-em',
      name: 'Avantis Emerging Markets',
      value: 300,
      profile: BUILTIN_PROFILES.find((p) => p.id === 'avantis-emerging-markets')!,
      role: 'factor',
    },
  ]

  it('optimizes Sparplan by picking up to 4 existing positions that reduce deficits', () => {
    const sparplan = optimizeExistingCoreSparplan(userPositions, stage3, 1000, { maxPositions: 4 })

    expect(sparplan.length).toBeGreaterThan(0)
    expect(sparplan.length).toBeLessThanOrEqual(4)

    // Sum of amounts should match budget
    const totalAmount = sparplan.reduce((s, item) => s + item.amount, 0)
    expect(totalAmount).toBe(1000)

    // It should prioritize underweighted positions (Avantis EM, Avantis SC, Europe SC) over overweight US Quality
    const sparplanNames = sparplan.map((s) => s.name)
    expect(sparplanNames).not.toContain('iShares World Quality')
    expect(sparplanNames).toContain('Avantis Emerging Markets')
  })

  it('calculates projection timeline and target milestones', () => {
    const sparplan = optimizeExistingCoreSparplan(userPositions, stage3, 1000, { maxPositions: 4 })
    const projection = projectSparplanTimeline(userPositions, sparplan, stage3, 60)

    expect(projection.timeline.length).toBeGreaterThan(5)
    expect(projection.timeline[0].month).toBe(0)

    // With regular monthly additions to EM and Small Cap, the shares should improve over time
    const month0 = projection.timeline[0]
    const monthLast = projection.timeline[projection.timeline.length - 1]

    expect(monthLast.smallCapShare).toBeGreaterThan(month0.smallCapShare)
    expect(monthLast.emShare).toBeGreaterThan(month0.emShare)
    expect(monthLast.usShare).toBeLessThan(month0.usShare) // US concentration dilutes

    // Either region target or size target or both should be reached within the simulation
    expect(typeof projection.monthsToRegionTarget === 'number' || projection.monthsToRegionTarget === null).toBe(true)
    expect(typeof projection.monthsToSizeTarget === 'number' || projection.monthsToSizeTarget === null).toBe(true)
  })

  it('respects manually selected keys for Sparplan', () => {
    const selectedKeys = ['pos-avantis-em', 'pos-avantis-sc']
    const sparplan = optimizeExistingCoreSparplan(userPositions, stage3, 500, {
      selectedKeys,
      maxPositions: 4,
    })

    expect(sparplan).toHaveLength(2)
    expect(sparplan.map((s) => s.key)).toEqual(expect.arrayContaining(selectedKeys))
    expect(sparplan.reduce((s, i) => s + i.amount, 0)).toBe(500)
  })

  it('diagnoses factor budget excess, unmatched ETFs, and missing regional/SC access', () => {
    const partialPositions: CorePosition[] = [
      userPositions[0], // factor 9800 (US-heavy)
      userPositions[1], // market 7200 (US-heavy)
      {
        key: 'pos-unmatched',
        name: 'Mystery Core ETF',
        value: 1000,
        profile: null,
        role: 'market',
      },
    ]

    const exp = computeCoreExposure(partialPositions)
    const targetExp = computeStageTargetExposure(stage3, BUILTIN_PROFILES)
    const diagnostics = diagnoseCoreGaps(partialPositions, exp, stage3, targetExp)

    const ids = diagnostics.map((d) => d.id)
    expect(ids).toContain('unmatched-profiles')
    expect(ids).toContain('factor-budget-over')
    expect(ids.some((id) => id === 'missing-region-access' || id === 'missing-smallcap-access')).toBe(true)
  })

  it('builds a phased roadmap that shifts allocations and improves 12m exposure', () => {
    const roadmap = buildPhasedRoadmap(userPositions, stage3, 1000, {
      maxPositions: 4,
      maxMonths: 24,
      includeModelCandidates: false,
    })

    expect(roadmap.phases.length).toBeGreaterThanOrEqual(1)
    expect(roadmap.phases.length).toBeLessThanOrEqual(3)
    expect(roadmap.phases[0].startMonth).toBe(1)

    const phase1Total = roadmap.phases[0].allocations.reduce((s, a) => s + a.amount, 0)
    expect(phase1Total).toBe(1000)

    const baseExp = computeCoreExposure(userPositions)
    expect(roadmap.exposureAfter12m.regions.US).toBeLessThan(baseExp.regions.US)
    expect(roadmap.exposureAfter12m.regions.EM).toBeGreaterThan(baseExp.regions.EM)
    expect(roadmap.exposureAfter12m.size.small).toBeGreaterThan(baseExp.size.small)

    // With includeModelCandidates enabled, candidate ETFs from stage3 model can appear
    const candidateRoadmap = buildPhasedRoadmap([userPositions[1]], stage3, 1000, {
      maxPositions: 4,
      maxMonths: 24,
      includeModelCandidates: true,
    })
    expect(candidateRoadmap.phases.length).toBeGreaterThanOrEqual(1)
    expect(candidateRoadmap.phases[0].allocations.some((a) => a.isCandidate)).toBe(true)
  })

  it('caps Frontier ETF separately from EM and excludes dividend satellites from Stage 2 Sparplan', () => {
    const frontierProfile = BUILTIN_PROFILES.find((p) => p.id === 'xtrackers-sp-select-frontier')!
    const positionsWithFrontier: CorePosition[] = [
      ...userPositions,
      {
        key: 'pos-frontier',
        name: 'XTRACKERS S&P SELECT FRONTIER SWAP ETF',
        value: 200, // ~1% of ~20.1k Core
        profile: frontierProfile,
        role: frontierProfile.role,
      },
    ]

    const sparplan = optimizeExistingCoreSparplan(positionsWithFrontier, stage2, 350, {
      maxPositions: 4,
      frontierCap: 0.03,
    })

    const frontierItem = sparplan.find((s) => s.key === 'pos-frontier')
    const emItem = sparplan.find((s) => s.key === 'pos-avantis-em')
    const cashflowItem = sparplan.find((s) => s.key === 'pos-pan-asia')

    expect(cashflowItem).toBeUndefined()
    expect(emItem).toBeDefined()
    expect(frontierItem).toBeDefined()
    expect(frontierItem!.isSatellite).toBe(true)
    expect(frontierItem!.amount).toBeLessThanOrEqual(350 * 0.15)
    expect(frontierItem!.amount).toBeLessThan(emItem!.amount)

    // When frontierCap is 0 (or already >= 3%), Frontier receives 0 EUR
    const pausedPlan = optimizeExistingCoreSparplan(positionsWithFrontier, stage2, 350, {
      maxPositions: 4,
      frontierCap: 0,
    })
    expect(pausedPlan.find((s) => s.key === 'pos-frontier')).toBeUndefined()

    const alreadyAtCapPositions = positionsWithFrontier.map((p) =>
      p.key === 'pos-frontier' ? { ...p, value: 1200 } : p
    )
    const atCapPlan = optimizeExistingCoreSparplan(alreadyAtCapPositions, stage2, 350, {
      maxPositions: 4,
      frontierCap: 0.03,
    })
    expect(atCapPlan.find((s) => s.key === 'pos-frontier')).toBeUndefined()

    // In phased roadmap, Frontier allocation drops out once the 3% cap is reached
    const roadmap = buildPhasedRoadmap(positionsWithFrontier, stage2, 350, {
      maxPositions: 4,
      maxMonths: 24,
      frontierCap: 0.03,
    })
    expect(roadmap.phases.length).toBeGreaterThanOrEqual(1)
    const lastPhase = roadmap.phases[roadmap.phases.length - 1]
    expect(lastPhase.allocations.find((a) => a.key === 'pos-frontier')).toBeUndefined()
  })

  it('excludes India single-country ETF from filling EM gap and flags missing EM access in diagnostics', () => {
    const indiaProfile = BUILTIN_PROFILES.find((p) => p.id === 'ishares-msci-india')!
    const frontierProfile = BUILTIN_PROFILES.find((p) => p.id === 'xtrackers-sp-select-frontier')!

    const positionsWithoutBroadEm: CorePosition[] = [
      userPositions[1], // MSCI World (7200)
      {
        key: 'pos-india',
        name: 'ISHARES MSCI INDIA ETF',
        value: 500,
        profile: indiaProfile,
        role: indiaProfile.role,
      },
      {
        key: 'pos-frontier',
        name: 'XTRACKERS S&P SELECT FRONTIER SWAP ETF',
        value: 500,
        profile: frontierProfile,
        role: frontierProfile.role,
      },
    ]

    const exp = computeCoreExposure(positionsWithoutBroadEm)
    const targetExp = computeStageTargetExposure(stage2, BUILTIN_PROFILES)
    const diagnostics = diagnoseCoreGaps(positionsWithoutBroadEm, exp, stage2, targetExp, 0.03)

    expect(diagnostics.map((d) => d.id)).toContain('missing-region-access')
    expect(diagnostics.map((d) => d.id)).toContain('frontier-over-cap')

    const sparplan = optimizeExistingCoreSparplan(positionsWithoutBroadEm, stage2, 350, {
      maxPositions: 4,
      frontierCap: 0.03,
    })
    // India satellite is not used as automatic core filler
    expect(sparplan.find((s) => s.key === 'pos-india')).toBeUndefined()
  })
})
