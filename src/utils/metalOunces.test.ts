import { describe, it, expect, beforeEach } from 'vitest'
import type { Investment } from './parser'
import { applySplits, saveSplits } from './assetSplits'
import {
  getPreciousMetalType,
  getAssetOunceInfo,
  computeMetalOunceOverview,
  TROY_OZ_IN_GRAMS,
  XTRACKERS_SILVER_OZ_PER_SHARE,
} from './metalOunces'

function makeInv(overrides: Partial<Investment>): Investment {
  return {
    name: 'Test Asset',
    isin: '',
    wkn: '',
    type: 'Edelmetalle',
    quantity: 1,
    purchasePrice: 100,
    currentPrice: 100,
    currentValue: 100,
    currency: 'EUR',
    exchangeRate: 1,
    region: 'Global',
    sector: 'Edelmetalle',
    category: 'Safe-Haven Gold',
    subcategory: 'General',
    ...overrides,
  }
}

describe('metalOunces', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('classifies precious metals and excludes mining stocks and non-metal assets', () => {
    expect(getPreciousMetalType(makeInv({ category: 'Safe-Haven Gold', type: 'Edelmetalle' }))).toBe('gold')
    expect(getPreciousMetalType(makeInv({ category: 'Performance Gold', subcategory: 'Silber', type: 'Edelmetalle' }))).toBe('silver')
    expect(getPreciousMetalType(makeInv({ category: 'Performance Gold', subcategory: 'Goldminen', type: 'Aktien' }))).toBeNull()
    expect(getPreciousMetalType(makeInv({ category: 'Performance Gold', subcategory: 'Silber', type: 'Aktien' }))).toBeNull()
    expect(getPreciousMetalType(makeInv({ category: 'Stocks', subcategory: 'Core', type: 'ETF' }))).toBeNull()
  })

  it('calculates exact ounces for gram gold ETFs, spot assets, Xtrackers silver, coins, and gram/kg bars', () => {
    const xetraGold = makeInv({ name: 'DT.BOERSE COM. XETRA-GOLD', isin: 'DE000A0S9GB0', quantity: 28, currentValue: 3525.14 })
    const xetraInfo = getAssetOunceInfo(xetraGold)
    expect(xetraInfo?.metal).toBe('gold')
    expect(xetraInfo?.estimated).toBe(false)
    expect(xetraInfo?.ounces).toBeCloseTo(28 / TROY_OZ_IN_GRAMS, 6)

    const spotGold = makeInv({ name: 'Gold', isin: 'XC0009655157', quantity: 1.652, currentValue: 6450.28 })
    expect(getAssetOunceInfo(spotGold)).toMatchObject({ metal: 'gold', ounces: 1.652, estimated: false })

    const spotSilver = makeInv({ name: 'Silber', isin: 'XC0009653103', category: 'Performance Gold', subcategory: 'Silber', quantity: 9, currentValue: 587.63 })
    expect(getAssetOunceInfo(spotSilver)).toMatchObject({ metal: 'silver', ounces: 9, estimated: false })

    const xtrackersSilver = makeInv({ name: 'XTRACK. ETC SILBER 80', isin: 'DE000A2T0VS9', category: 'Performance Gold', subcategory: 'Silber', quantity: 14, currentValue: 1317.19 })
    const xtrackersInfo = getAssetOunceInfo(xtrackersSilver)
    expect(xtrackersInfo?.metal).toBe('silver')
    expect(xtrackersInfo?.estimated).toBe(false)
    expect(xtrackersInfo?.ounces).toBeCloseTo(14 * XTRACKERS_SILVER_OZ_PER_SHARE, 6)

    const quarterCoins = makeInv({ name: 'Philharmoniker 1/4 oz', isin: '', quantity: 3, currentValue: 2400 })
    expect(getAssetOunceInfo(quarterCoins)).toMatchObject({ metal: 'gold', ounces: 0.75, estimated: false })

    const gramBar = makeInv({ name: 'Goldbarren 100 g', isin: '', quantity: 1, currentValue: 10000 })
    expect(getAssetOunceInfo(gramBar)?.ounces).toBeCloseTo(100 / TROY_OZ_IN_GRAMS, 6)

    const kgBar = makeInv({ name: 'Silberbarren 1 kg', isin: '', category: 'Performance Gold', subcategory: 'Silber', quantity: 1, currentValue: 1200 })
    expect(getAssetOunceInfo(kgBar)?.ounces).toBeCloseTo(1000 / TROY_OZ_IN_GRAMS, 6)
  })

  it('preserves exact _ounces on split coins and (Rest) items via applySplits', () => {
    const xetraGold = makeInv({
      name: 'DT.BOERSE COM. XETRA-GOLD',
      isin: 'DE000A0S9GB0',
      quantity: 31.1035,
      currentValue: 3200,
      purchasePrice: 80,
    })

    saveSplits([
      {
        assetKey: 'DE000A0S9GB0',
        totalOunces: 1,
        splits: [
          {
            id: 'coin1',
            name: 'Philharmoniker',
            denomination: '1/4 oz',
            coinCount: 2,
            depository: 'Kleiderschrank',
          },
        ],
      },
    ])

    const after = applySplits([xetraGold])
    expect(after).toHaveLength(2)

    const splitCoin = after[0]
    const rest = after[1]
    expect(splitCoin._ounces).toBeCloseTo(0.5, 6)
    expect(rest._ounces).toBeCloseTo(0.5, 6)

    const splitOz = getAssetOunceInfo(splitCoin)?.ounces ?? 0
    const restOz = getAssetOunceInfo(rest)?.ounces ?? 0
    expect(splitOz + restOz).toBeCloseTo(1, 6)
  })

  it('falls back to estimated ounces from EUR value when weight cannot be derived directly', () => {
    const unknownGoldEtf = makeInv({
      name: 'Unknown Physical Gold Basket',
      isin: 'LU0000000001',
      quantity: 10,
      currentValue: 6400,
    })

    const info = getAssetOunceInfo(unknownGoldEtf, { goldOzPrice: 3200, silverOzPrice: 40 })
    expect(info).toMatchObject({
      metal: 'gold',
      ounces: 2,
      estimated: true,
    })
  })

  it('aggregates Gold and Silver ounces per depository with unassigned last and excluding mining stocks', () => {
    const investments: Investment[] = [
      makeInv({ name: 'Gold', isin: 'XC0009655157', quantity: 1.652, currentValue: 6450.28, subcategory: 'Münzen' }),
      makeInv({ name: 'Silber', isin: 'XC0009653103', category: 'Performance Gold', subcategory: 'Silber', quantity: 9, currentValue: 587.63 }),
      makeInv({ name: 'DT.BOERSE COM. XETRA-GOLD', isin: 'DE000A0S9GB0', quantity: 28, currentValue: 3525.14, subcategory: 'ETF' }),
      makeInv({ name: 'XTRACK. ETC SILBER 80', isin: 'DE000A2T0VS9', category: 'Performance Gold', subcategory: 'Silber', quantity: 14, currentValue: 1317.19 }),
      makeInv({ name: 'Goldbarren 1 oz', isin: 'DE000BAR1OZ0', quantity: 1, currentValue: 3200 }),
      makeInv({ name: 'Barrick Gold', isin: 'CA0679011084', type: 'Aktien', category: 'Performance Gold', subcategory: 'Goldminen', quantity: 50, currentValue: 900 }),
      makeInv({ name: 'Zero Gold', isin: 'XC000ZERO001', quantity: 5, currentValue: 0 }),
    ]

    const depositories = {
      XC0009655157: 'Kleiderschrank',
      XC0009653103: 'Kleiderschrank',
      DE000A0S9GB0: 'Flatex',
      DE000A2T0VS9: 'Flatex',
      CA0679011084: 'Flatex',
    }

    const overview = computeMetalOunceOverview(investments, depositories)

    expect(overview.totalGoldOz).toBeCloseTo(1.652 + 28 / TROY_OZ_IN_GRAMS + 1, 6)
    expect(overview.totalSilverOz).toBeCloseTo(9 + 14 * XTRACKERS_SILVER_OZ_PER_SHARE, 6)
    expect(overview.byDepository.map(d => d.depository)).toEqual([
      'Kleiderschrank',
      'Flatex',
      'Nicht zugewiesen',
    ])

    expect(overview.byDepository[0]).toMatchObject({
      depository: 'Kleiderschrank',
      goldOz: 1.652,
      silverOz: 9,
      assetCount: 2,
    })
    expect(overview.byDepository[1].goldOz).toBeCloseTo(28 / TROY_OZ_IN_GRAMS, 6)
    expect(overview.byDepository[1].silverOz).toBeCloseTo(14 * XTRACKERS_SILVER_OZ_PER_SHARE, 6)
    expect(overview.byDepository[1].assetCount).toBe(2)
    expect(overview.byDepository[2]).toMatchObject({
      depository: 'Nicht zugewiesen',
      goldOz: 1,
      silverOz: 0,
      assetCount: 1,
    })
  })
})
