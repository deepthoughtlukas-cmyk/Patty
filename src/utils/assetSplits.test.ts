import { beforeEach, describe, expect, it } from 'vitest'
import {
  applySplits,
  deleteSplitConfig,
  getSplitInvestmentKey,
  loadSplits,
  setSplitConfig,
} from './assetSplits'
import { TROY_OZ_IN_GRAMS } from './metalOunces'
import type { Investment } from './parser'

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

describe('assetSplits', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists and deletes split configurations', () => {
    setSplitConfig({
      assetKey: 'XC0009655157',
      totalOunces: 5,
      splits: [{ id: 's1', name: 'Krügerrand', denomination: '1 oz', coinCount: 2, depository: 'Schließfach' }],
    })

    expect(loadSplits()).toHaveLength(1)
    deleteSplitConfig('XC0009655157')
    expect(loadSplits()).toHaveLength(0)
  })

  it('splits physical gold into coins + (Rest) preserving total value and _ounces', () => {
    const inv = makeInv({
      name: 'Gold Depot',
      isin: 'XC0009655157',
      category: 'Safe-Haven Gold',
      quantity: 4,
      purchasePrice: 2000,
      currentPrice: 2500,
      currentValue: 10000,
    })

    setSplitConfig({
      assetKey: 'XC0009655157',
      totalOunces: 4,
      splits: [
        { id: 'c1', name: 'Krügerrand', denomination: '1 oz', coinCount: 2, depository: 'Tresor' },
        { id: 'c2', name: 'Maple Leaf 1/2', denomination: '1/2 oz', coinCount: 1, depository: 'Tresor' },
      ],
    })

    const out = applySplits([inv])
    expect(out).toHaveLength(3)

    const splitKey1 = getSplitInvestmentKey(inv, 'c1')
    expect(out[0].isin).toBe(splitKey1)
    expect(out[0].currentValue).toBeCloseTo(5000, 4)
    expect(out[0]._ounces).toBeCloseTo(2, 4)

    expect(out[1].currentValue).toBeCloseTo(1250, 4)
    expect(out[1]._ounces).toBeCloseTo(0.5, 4)

    const rest = out[2]
    expect(rest.name).toContain('(Rest)')
    expect(rest.currentValue).toBeCloseTo(3750, 4)
    expect(rest._ounces).toBeCloseTo(1.5, 4)

    const sumValue = out.reduce((s, i) => s + i.currentValue, 0)
    const sumOz = out.reduce((s, i) => s + (i._ounces ?? 0), 0)
    expect(sumValue).toBeCloseTo(10000, 4)
    expect(sumOz).toBeCloseTo(4, 4)
  })

  it('auto-computes total ounces for Xetra-Gold (grams -> oz) and Xtrackers Silver (* 1.43 oz)', () => {
    const xetra = makeInv({
      name: 'Xetra-Gold',
      isin: 'DE000A0S9GB0',
      category: 'Safe-Haven Gold',
      quantity: TROY_OZ_IN_GRAMS * 2, // 2 oz in grams
      currentPrice: 80,
      currentValue: TROY_OZ_IN_GRAMS * 2 * 80,
    })
    const xtrackers = makeInv({
      name: 'Xtrackers Silver',
      isin: 'DE000A2T0VS9',
      category: 'Performance Gold',
      subcategory: 'Silber',
      quantity: 10, // 14.3 oz
      currentPrice: 40,
      currentValue: 400,
    })

    setSplitConfig({
      assetKey: 'DE000A0S9GB0',
      totalOunces: 1,
      splits: [{ id: 'g1', name: 'Münze', denomination: '1 oz', coinCount: 1, depository: 'Bank' }],
    })
    setSplitConfig({
      assetKey: 'DE000A2T0VS9',
      totalOunces: 1,
      splits: [{ id: 's1', name: 'Maple', denomination: '1 oz', coinCount: 4, depository: 'Bank' }],
    })

    const out = applySplits([xetra, xtrackers])
    expect(out).toHaveLength(4)
    expect(out[0]._ounces).toBeCloseTo(1, 4)
    expect(out[1]._ounces).toBeCloseTo(1, 4)
    expect(out[2]._ounces).toBeCloseTo(4, 4)
    expect(out[3]._ounces).toBeCloseTo(10.3, 4)
  })
})
