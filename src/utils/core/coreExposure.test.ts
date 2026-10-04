import { describe, it, expect } from 'vitest'
import type { Investment } from '../parser'
import { BUILTIN_PROFILES } from './builtinProfiles'
import {
  extractCoreInvestments,
  findProfileForInvestment,
  buildCorePositions,
  computeCoreExposure,
} from './coreExposure'

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
})
