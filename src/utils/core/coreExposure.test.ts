import { describe, it, expect } from 'vitest'
import type { Investment } from '../parser'
import { BUILTIN_PROFILES } from './builtinProfiles'
import { isFrontierProfile, isSingleCountryTilt } from './countries'
import {
  extractCoreInvestments,
  findProfileForInvestment,
  buildCorePositions,
  computeCoreExposure,
  computeStageTargetExposure,
  computeCoreFitSummary,
} from './coreExposure'
import { getStage } from './targets'

describe('coreExposure logic', () => {
  const sampleInvestments: Investment[] = [
    {
      name: 'ISHARES EDGE MSCI WLD QUAL FCTR',
      isin: 'IE00BP3QZ601',
      wkn: 'A12ATF',
      type: 'ETF',
      quantity: 100,
      purchasePrice: 80,
      currentPrice: 98.22,
      currentValue: 9822.27,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'USA',
      sector: 'Finanzen',
      category: 'Stocks',
      subcategory: 'Core',
    },
    {
      name: 'XTRACKERS MSCI WORLD ETF',
      isin: 'IE00BJ0KDQ90',
      wkn: 'A1XB5U',
      type: 'ETF',
      quantity: 80,
      purchasePrice: 75,
      currentPrice: 90.52,
      currentValue: 7241.85,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Global',
      sector: 'IT',
      category: 'Stocks',
      subcategory: 'Core',
    },
    {
      name: 'NVIDIA CORP',
      isin: 'US67066G1040',
      wkn: '918422',
      type: 'Aktie',
      quantity: 10,
      purchasePrice: 100,
      currentPrice: 120,
      currentValue: 1200,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'USA',
      sector: 'IT',
      category: 'Stocks',
      subcategory: 'AI', // Not Core
    },
    {
      name: 'SPDR S&P PAN ASIA DIV ARISTOCRATS',
      isin: 'IE00B9KNR336',
      wkn: 'A1T8GD',
      type: 'ETF',
      quantity: 30,
      purchasePrice: 35,
      currentPrice: 37.92,
      currentValue: 1137.62,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Asien',
      sector: 'Finanzen',
      category: 'Stocks',
      subcategory: 'Core',
    },
  ]

  it('filters only Core stocks investments', () => {
    const coreOnly = extractCoreInvestments(sampleInvestments)
    expect(coreOnly).toHaveLength(3)
    expect(coreOnly.map((i) => i.name)).not.toContain('NVIDIA CORP')
  })

  it('matches iShares Quality by ISIN and Xtrackers by token matcher', () => {
    const qual = sampleInvestments[0]
    const matchedQual = findProfileForInvestment(qual, BUILTIN_PROFILES)
    expect(matchedQual).toBeDefined()
    expect(matchedQual?.id).toBe('ishares-edge-world-quality')

    const panAsia = sampleInvestments[3]
    const matchedPanAsia = findProfileForInvestment(panAsia, BUILTIN_PROFILES)
    expect(matchedPanAsia?.id).toBe('spdr-pan-asia-div-aristocrats')
    expect(matchedPanAsia?.role).toBe('cashflow')
  })

  it('computes aggregated core exposure correctly', () => {
    const positions = buildCorePositions(sampleInvestments, BUILTIN_PROFILES)
    expect(positions).toHaveLength(3)

    const exp = computeCoreExposure(positions)
    expect(exp.total).toBeCloseTo(9822.27 + 7241.85 + 1137.62, 1)
    expect(exp.coverage).toBe(1) // all 3 matched

    // Quality is ~73% US, World is ~71.5% US -> total US should be ~68-73%
    expect(exp.regions.US).toBeGreaterThan(0.65)
    expect(exp.factors.quality).toBeGreaterThan(0.8) // Quality factor tilt
    expect(exp.roleShares.factor).toBeGreaterThan(0.5) // Quality ETF is factor role
  })

  it('reflects simulated deltas in real-time', () => {
    const positions = buildCorePositions(sampleInvestments, BUILTIN_PROFILES)
    const baseExp = computeCoreExposure(positions)

    // Simulate selling 5000 € of Quality factor ETF
    const qualKey = positions[0].key
    const simExp = computeCoreExposure(positions, { [qualKey]: -5000 })

    expect(simExp.total).toBeCloseTo(baseExp.total - 5000, 1)
    // Factor role share must decrease
    expect(simExp.roleShares.factor).toBeLessThan(baseExp.roleShares.factor)
  })

  it('matches ISHARES MSCI INDIA ETF (IE00BZCQB185) and Xtrackers MSCI World (IE00BJ0KDQ92)', () => {
    const indiaInv: Investment = {
      name: 'ISHARES MSCI INDIA ETF',
      isin: 'IE00BZCQB185',
      wkn: 'A2AFCY',
      type: 'ETF',
      quantity: 60,
      purchasePrice: 8,
      currentPrice: 7.5,
      currentValue: 450,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Indien',
      sector: 'Diversifizierte Kapitalmärkte',
      category: 'Stocks',
      subcategory: 'Core',
    }
    const worldInv: Investment = {
      ...sampleInvestments[1],
      isin: 'IE00BJ0KDQ92',
    }

    const indiaProfile = findProfileForInvestment(indiaInv, BUILTIN_PROFILES)
    expect(indiaProfile?.id).toBe('ishares-msci-india')
    expect(indiaProfile?.countries).toEqual({ IN: 100 })

    const worldProfile = findProfileForInvestment(worldInv, BUILTIN_PROFILES)
    expect(worldProfile?.id).toBe('xtrackers-msci-world')
  })

  it('computes derived target exposure and Core-Fit summary for Stage 3', () => {
    const stage3 = getStage('stage3')
    const targetExp = computeStageTargetExposure(stage3, BUILTIN_PROFILES)

    // 6% US SC + 6% EU SC + 2% JP SC + 10% of 16% EM IMI = 15.6%
    expect(targetExp.size.small).toBeCloseTo(0.156, 2)
    expect(targetExp.regions.US).toBeCloseTo(0.42, 2)
    expect(targetExp.regions.EU).toBeCloseTo(0.23, 2)
    expect(targetExp.countries.US).toBeGreaterThan(0.4)

    // Target portfolio itself should score 100/100 with all regions in band
    const targetFit = computeCoreFitSummary(targetExp, stage3, targetExp)
    expect(targetFit.score).toBe(100)
    expect(targetFit.regionsInBand).toBe(targetFit.totalRegionGroups)
    expect(targetFit.largestOverweight).toBeNull()
    expect(targetFit.largestUnderweight).toBeNull()

    // US-heavy portfolio should have lower score and identify US overweight + EM underweight
    const positions = buildCorePositions(sampleInvestments, BUILTIN_PROFILES)
    const actualExp = computeCoreExposure(positions)
    const actualFit = computeCoreFitSummary(actualExp, stage3, targetExp)
    expect(actualFit.score).toBeLessThan(80)
    expect(actualFit.largestOverweight?.id).toBe('us')
    expect(actualFit.largestUnderweight?.id).toBe('eu')
    expect(actualFit.largestUnderweight!.eurDiff).toBeGreaterThan(0)
    const emGap = actualFit.regionGaps.find((g) => g.id === 'em')
    expect(emGap?.eurDiff).toBeGreaterThan(0)
  })

  it('separates Frontier Markets (FM) from EM and flags non-core single-country tilts only in multi-country buckets', () => {
    const frontierInv: Investment = {
      name: 'XTRACKERS S&P SELECT FRONTIER SWAP ETF',
      isin: 'LU0328476410',
      wkn: 'DBX1A9',
      type: 'ETF',
      quantity: 20,
      purchasePrice: 15,
      currentPrice: 20,
      currentValue: 400,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Global',
      sector: 'Broad',
      category: 'Stocks',
      subcategory: 'Core',
    }
    const indiaInv: Investment = {
      name: 'ISHARES MSCI INDIA ETF',
      isin: 'IE00BZCQB185',
      wkn: 'A2AFCY',
      type: 'ETF',
      quantity: 10,
      purchasePrice: 50,
      currentPrice: 50,
      currentValue: 500,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Indien',
      sector: 'Broad',
      category: 'Stocks',
      subcategory: 'Core',
    }

    const frontierProf = findProfileForInvestment(frontierInv, BUILTIN_PROFILES)!
    const indiaProf = findProfileForInvestment(indiaInv, BUILTIN_PROFILES)!
    const canadaProf = BUILTIN_PROFILES.find((p) => p.id === 'wp-ubs-msci-canada')!
    const japanProf = BUILTIN_PROFILES.find((p) => p.id === 'wp-amundi-msci-japan')!

    expect(frontierProf.role).toBe('satellite')
    expect(isFrontierProfile(frontierProf)).toBe(true)
    expect(indiaProf.role).toBe('satellite')
    expect(isSingleCountryTilt(indiaProf)).toBe(true)
    // Canada & Japan are dedicated core region buckets -> allowed
    expect(isSingleCountryTilt(canadaProf)).toBe(false)
    expect(isSingleCountryTilt(japanProf)).toBe(false)

    const fmPos = buildCorePositions([frontierInv], BUILTIN_PROFILES)
    const exp = computeCoreExposure(fmPos)
    expect(exp.regions.FM).toBeCloseTo(1, 4)
    expect(exp.regions.EM).toBe(0)
    expect(exp.roleShares.satellite).toBeCloseTo(1, 4)
  })
})
