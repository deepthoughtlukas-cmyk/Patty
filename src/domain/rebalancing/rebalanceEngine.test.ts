import { describe, expect, it } from 'vitest'
import { computeRebalancePlan } from './rebalanceEngine'
import type { AllocationSummary, SubWeight } from '../../utils/categorizer'
import type { Investment } from '../../utils/parser'

function makeInv(
  overrides: Partial<Investment> & Pick<Investment, 'name' | 'isin' | 'category' | 'currentValue'>
): Investment {
  return {
    wkn: '',
    type: overrides.category === 'Stocks' ? 'Aktien' : 'Rohstoffe',
    quantity: 1,
    purchasePrice: overrides.currentValue,
    currentPrice: overrides.currentValue,
    currency: 'EUR',
    exchangeRate: 1,
    region: 'Global',
    sector: 'Broad',
    subcategory: 'General',
    ...overrides,
  }
}

function makeAlloc(
  category: AllocationSummary['category'],
  value: number,
  percentage: number,
  targetPercentage: number,
  color = '#3b82f6'
): AllocationSummary {
  return {
    category,
    value,
    percentage,
    targetPercentage,
    deviation: percentage - targetPercentage,
    color,
  }
}

describe('computeRebalancePlan', () => {
  it('Core-First Stage 1: buys Core and holds satellites when Stocks are underweight', () => {
    const investments: Investment[] = [
      makeInv({ name: 'MSCI World Core', isin: 'IE00B4L5Y983', category: 'Stocks', subcategory: 'Core', currentValue: 40000 }),
      makeInv({ name: 'Satellite AI', isin: 'IE00BGV5VN51', category: 'Stocks', subcategory: 'AI', currentValue: 20000 }),
      makeInv({ name: 'Gold ETF', isin: 'DE000A0S9GB0', category: 'Safe-Haven Gold', subcategory: 'General', currentValue: 20000 }),
    ]
    const totalValue = 80000
    const allocation: AllocationSummary[] = [
      makeAlloc('Stocks', 60000, 0.75, 0.8),
      makeAlloc('Safe-Haven Gold', 20000, 0.25, 0.2),
    ]
    const activeSubWeights: Record<string, SubWeight[]> = {
      Stocks: [
        { name: 'Core', weight: 0.8 },
        { name: 'AI', weight: 0.2 },
      ],
    }

    const plan = computeRebalancePlan({
      activeInvestments: investments,
      allocation,
      activeSubWeights,
      totalValue,
      goldOzPrice: 2500,
      silverOzPrice: 30,
      rebalanceMethod: 'core-first',
    })

    const stocksCat = plan.find((c) => c.category === 'Stocks')!
    expect(stocksCat.action).toBe('buy')
    expect(stocksCat.hasCoreReference).toBe(true)

    const coreSub = stocksCat.subcategories.find((s) => s.subcategory === 'Core')!
    const aiSub = stocksCat.subcategories.find((s) => s.subcategory === 'AI')!

    expect(coreSub.isCoreAnchor).toBe(true)
    expect(coreSub.stocksIsOk).toBe(false)
    expect(coreSub.action).toBe('buy')
    expect(coreSub.badgeText).toMatch(/^Buy /)

    expect(aiSub.action).toBe('hold')
    expect(aiSub.badgeText).toBe('Halten')
    expect(aiSub.tooltip).toContain('[Core-First]')
  })

  it('Core-First Stage 1: sells Core when Stocks are overweight', () => {
    const investments: Investment[] = [
      makeInv({ name: 'MSCI World Core', isin: 'IE00B4L5Y983', category: 'Stocks', subcategory: 'Core', currentValue: 75000 }),
      makeInv({ name: 'Satellite AI', isin: 'IE00BGV5VN51', category: 'Stocks', subcategory: 'AI', currentValue: 15000 }),
      makeInv({ name: 'Gold ETF', isin: 'DE000A0S9GB0', category: 'Safe-Haven Gold', subcategory: 'General', currentValue: 10000 }),
    ]
    const totalValue = 100000
    const allocation: AllocationSummary[] = [
      makeAlloc('Stocks', 90000, 0.9, 0.8),
      makeAlloc('Safe-Haven Gold', 10000, 0.1, 0.2),
    ]
    const activeSubWeights: Record<string, SubWeight[]> = {
      Stocks: [
        { name: 'Core', weight: 0.8 },
        { name: 'AI', weight: 0.2 },
      ],
    }

    const plan = computeRebalancePlan({
      activeInvestments: investments,
      allocation,
      activeSubWeights,
      totalValue,
      goldOzPrice: 2500,
      silverOzPrice: 30,
      rebalanceMethod: 'core-first',
    })

    const stocksCat = plan.find((c) => c.category === 'Stocks')!
    expect(stocksCat.action).toBe('sell')

    const coreSub = stocksCat.subcategories.find((s) => s.subcategory === 'Core')!
    const aiSub = stocksCat.subcategories.find((s) => s.subcategory === 'AI')!

    expect(coreSub.action).toBe('sell')
    expect(coreSub.badgeText).toMatch(/^Sell /)
    expect(aiSub.action).toBe('hold')
    expect(aiSub.badgeText).toBe('Halten')
  })

  it('Core-First Stage 2: rebalances satellites relative to Core and Core absorbs net diff when Stocks are on target', () => {
    const investments: Investment[] = [
      makeInv({ name: 'MSCI World Core', isin: 'IE00B4L5Y983', category: 'Stocks', subcategory: 'Core', currentValue: 70000 }),
      makeInv({ name: 'Satellite AI', isin: 'IE00BGV5VN51', category: 'Stocks', subcategory: 'AI', currentValue: 10000 }),
      makeInv({ name: 'Gold ETF', isin: 'DE000A0S9GB0', category: 'Safe-Haven Gold', subcategory: 'General', currentValue: 20000 }),
    ]
    const totalValue = 100000
    const allocation: AllocationSummary[] = [
      makeAlloc('Stocks', 80000, 0.8, 0.8),
      makeAlloc('Safe-Haven Gold', 20000, 0.2, 0.2),
    ]
    const activeSubWeights: Record<string, SubWeight[]> = {
      Stocks: [
        { name: 'Core', weight: 0.8 },
        { name: 'AI', weight: 0.2 },
      ],
    }

    const plan = computeRebalancePlan({
      activeInvestments: investments,
      allocation,
      activeSubWeights,
      totalValue,
      goldOzPrice: 2500,
      silverOzPrice: 30,
      rebalanceMethod: 'core-first',
    })

    const stocksCat = plan.find((c) => c.category === 'Stocks')!
    expect(stocksCat.action).toBe('ok')

    const coreSub = stocksCat.subcategories.find((s) => s.subcategory === 'Core')!
    const aiSub = stocksCat.subcategories.find((s) => s.subcategory === 'AI')!

    expect(coreSub.stocksIsOk).toBe(true)
    expect(aiSub.action).toBe('buy')
    expect(aiSub.diff).toBeCloseTo(7500, 0)
    expect(coreSub.action).toBe('sell')
    expect(coreSub.diff).toBeCloseTo(-7500, 0)
  })

  it('Standard mode: rebalances Core and satellites independently without holding', () => {
    const investments: Investment[] = [
      makeInv({ name: 'MSCI World Core', isin: 'IE00B4L5Y983', category: 'Stocks', subcategory: 'Core', currentValue: 40000 }),
      makeInv({ name: 'Satellite AI', isin: 'IE00BGV5VN51', category: 'Stocks', subcategory: 'AI', currentValue: 20000 }),
      makeInv({ name: 'Gold ETF', isin: 'DE000A0S9GB0', category: 'Safe-Haven Gold', subcategory: 'General', currentValue: 40000 }),
    ]
    const totalValue = 100000
    const allocation: AllocationSummary[] = [
      makeAlloc('Stocks', 60000, 0.6, 0.8),
      makeAlloc('Safe-Haven Gold', 40000, 0.4, 0.2),
    ]
    const activeSubWeights: Record<string, SubWeight[]> = {
      Stocks: [
        { name: 'Core', weight: 0.8 },
        { name: 'AI', weight: 0.2 },
      ],
    }

    const plan = computeRebalancePlan({
      activeInvestments: investments,
      allocation,
      activeSubWeights,
      totalValue,
      goldOzPrice: 2500,
      silverOzPrice: 30,
      rebalanceMethod: 'standard',
    })

    const stocksCat = plan.find((c) => c.category === 'Stocks')!
    const coreSub = stocksCat.subcategories.find((s) => s.subcategory === 'Core')!
    const aiSub = stocksCat.subcategories.find((s) => s.subcategory === 'AI')!

    expect(coreSub.action).toBe('buy')
    expect(coreSub.diff).toBeCloseTo(24000, 0)
    expect(aiSub.action).toBe('sell')
    expect(aiSub.diff).toBeCloseTo(-4000, 0)
  })

  it('computes Gold and Silver coin counts and tooltips for Safe-Haven Gold and Silber', () => {
    const investments: Investment[] = [
      makeInv({ name: 'Safe-Haven Gold', isin: 'XC0009655157', category: 'Safe-Haven Gold', subcategory: 'General', currentValue: 14000 }),
      makeInv({ name: 'Silber Physisch', isin: 'XC0009653103', category: 'Performance Gold', subcategory: 'Silber', currentValue: 4000 }),
      makeInv({ name: 'Goldminen ETF', isin: 'IE00B6R52036', category: 'Performance Gold', subcategory: 'Goldminen', currentValue: 6000 }),
      makeInv({ name: 'MSCI World', isin: 'IE00B4L5Y983', category: 'Stocks', subcategory: 'Core', currentValue: 76000 }),
    ]
    const totalValue = 100000
    const allocation: AllocationSummary[] = [
      makeAlloc('Safe-Haven Gold', 14000, 0.14, 0.25),
      makeAlloc('Performance Gold', 10000, 0.1, 0.25),
      makeAlloc('Stocks', 76000, 0.76, 0.5),
    ]
    const activeSubWeights: Record<string, SubWeight[]> = {
      'Performance Gold': [
        { name: 'Goldminen', weight: 0.6 },
        { name: 'Silber', weight: 0.4 },
      ],
    }

    const plan = computeRebalancePlan({
      activeInvestments: investments,
      allocation,
      activeSubWeights,
      totalValue,
      goldOzPrice: 2500,
      silverOzPrice: 30,
      rebalanceMethod: 'standard',
    })

    const goldCat = plan.find((c) => c.category === 'Safe-Haven Gold')!
    expect(goldCat.goldCoinCount).toBe(4) // floor(11000 / 2500)
    expect(goldCat.goldCoinTooltip).toBeTruthy()

    const perfCat = plan.find((c) => c.category === 'Performance Gold')!
    const silverSub = perfCat.subcategories.find((s) => s.subcategory === 'Silber')!
    expect(silverSub.silverCoinCount).toBeGreaterThan(0)
    expect(silverSub.silverCoinTooltip).toBeTruthy()
  })
})
