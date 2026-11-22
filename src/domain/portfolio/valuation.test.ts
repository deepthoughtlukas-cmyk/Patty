import { describe, expect, it } from 'vitest'
import {
  applyMetalPriceOverrides,
  computePortfolioValuation,
  computeReferenceMetalOzPrices,
} from './valuation'
import { TROY_OZ_IN_GRAMS } from '../../utils/metalOunces'
import type { Investment } from '../../utils/parser'

function makeInv(overrides: Partial<Investment> & Pick<Investment, 'name' | 'isin' | 'category'>): Investment {
  const quantity = overrides.quantity ?? 1
  const currentPrice = overrides.currentPrice ?? 100
  const currentValue = overrides.currentValue ?? quantity * currentPrice
  return {
    wkn: '',
    type: 'Rohstoffe',
    subcategory: 'General',
    quantity,
    purchasePrice: currentPrice,
    currentPrice,
    currentValue,
    currency: 'EUR',
    exchangeRate: 1,
    region: 'Global',
    sector: 'Broad',
    ...overrides,
  }
}

describe('applyMetalPriceOverrides', () => {
  it('overrides whole/fractional oz coins and spot ISINs while preserving gram/ETF holdings', () => {
    const investments: Investment[] = [
      makeInv({ name: 'Krügerrand 1 oz Gold', isin: 'GOLD1OZ', category: 'Safe-Haven Gold', quantity: 2, currentPrice: 2000, currentValue: 4000 }),
      makeInv({ name: 'Philharmoniker 1/2 oz Gold', isin: 'GOLDHALF', category: 'Safe-Haven Gold', quantity: 4, currentPrice: 1000, currentValue: 4000 }),
      makeInv({ name: 'Safe-Haven Gold Spot', isin: 'XC0009655157', category: 'Safe-Haven Gold', quantity: 1, currentPrice: 2000, currentValue: 2000 }),
      makeInv({ name: 'Silberbarren Spot', isin: 'XC0009653103', category: 'Performance Gold', subcategory: 'Silber', quantity: 10, currentPrice: 25, currentValue: 250 }),
      makeInv({ name: 'Xetra-Gold', isin: 'DE000A0S9GB0', category: 'Safe-Haven Gold', quantity: 100, currentPrice: 80, currentValue: 8000 }),
    ]

    const result = applyMetalPriceOverrides(investments, 2600, 32)

    expect(result[0].currentPrice).toBe(2600)
    expect(result[0].currentValue).toBe(5200)

    expect(result[1].currentPrice).toBe(1300)
    expect(result[1].currentValue).toBe(5200)

    expect(result[2].currentPrice).toBe(2600)
    expect(result[2].currentValue).toBe(2600)

    expect(result[3].currentPrice).toBe(32)
    expect(result[3].currentValue).toBe(320)

    // Xetra-Gold ETF should remain unchanged
    expect(result[4].currentPrice).toBe(80)
    expect(result[4].currentValue).toBe(8000)
  })
})

describe('computeReferenceMetalOzPrices', () => {
  it('prefers manual prices when > 0', () => {
    const prices = computeReferenceMetalOzPrices([], 2750, 35)
    expect(prices).toEqual({ goldOzPrice: 2750, silverOzPrice: 35 })
  })

  it('derives gold price from Xetra-Gold gram ETF with 3% coin premium and silver from Xtrackers ETC', () => {
    const investments: Investment[] = [
      makeInv({ name: 'Xetra-Gold', isin: 'DE000A0S9GB0', category: 'Safe-Haven Gold', currentPrice: 80 }),
      makeInv({ name: 'Xtrackers Physical Silver', isin: 'DE000A2T0VS9', category: 'Performance Gold', subcategory: 'Silber', currentPrice: 42.9 }),
    ]

    const prices = computeReferenceMetalOzPrices(investments, 0, 0)
    expect(prices.goldOzPrice).toBeCloseTo(80 * TROY_OZ_IN_GRAMS * 1.03, 4)
    expect(prices.silverOzPrice).toBeCloseTo(42.9 / 1.43, 4)
  })

  it('falls back to default gold (75 EUR/g * oz * 1.03) and silver (30 EUR/oz) when no references exist', () => {
    const prices = computeReferenceMetalOzPrices([], 0, 0)
    expect(prices.goldOzPrice).toBeCloseTo(75 * TROY_OZ_IN_GRAMS * 1.03, 4)
    expect(prices.silverOzPrice).toBe(30)
  })
})

describe('computePortfolioValuation', () => {
  it('computes portfolio totals and applies metal price overrides', () => {
    const investments: Investment[] = [
      makeInv({ name: 'MSCI World', isin: 'IE00B4L5Y983', category: 'Stocks', subcategory: 'Core', quantity: 10, purchasePrice: 80, currentPrice: 100, currentValue: 1000 }),
      makeInv({ name: 'Gold 1 oz', isin: 'XC0009655157', category: 'Safe-Haven Gold', quantity: 2, purchasePrice: 1500, currentPrice: 2000, currentValue: 4000 }),
    ]

    const valuation = computePortfolioValuation(investments, 2500, 0)

    expect(valuation.totalValue).toBe(6000) // 1000 + 2*2500
    expect(valuation.totalCost).toBe(3800) // 10*80 + 2*1500
    expect(valuation.totalGain).toBe(2200)
    expect(valuation.totalGainPct).toBeCloseTo(2200 / 3800, 4)
    expect(valuation.goldOzPrice).toBe(2500)
    expect(valuation.activeInvestments).toHaveLength(2)
  })
})
