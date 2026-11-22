import { beforeEach, describe, expect, it } from 'vitest'
import {
  computeDimensionAllocation,
  loadDimensions,
  runAutoTagging,
  setDimensionTag,
} from './dimensions'
import type { Investment } from './parser'

function makeInv(overrides: Partial<Investment> & Pick<Investment, 'name' | 'isin' | 'category'>): Investment {
  return {
    wkn: '',
    type: 'Aktien',
    subcategory: 'Core',
    quantity: 1,
    purchasePrice: 100,
    currentPrice: 100,
    currentValue: 100,
    currency: 'EUR',
    exchangeRate: 1,
    region: '',
    sector: 'Broad',
    ...overrides,
  }
}

describe('dimensions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads default geo and market-type dimensions', () => {
    const dims = loadDimensions()
    expect(dims.map((d) => d.id)).toEqual(expect.arrayContaining(['geo', 'market-type']))
  })

  it('auto-tags German region strings and preserves manual overrides', () => {
    const invUS = makeInv({ name: 'Apple', isin: 'US0378331005', category: 'Stocks', region: 'Vereinigte Staaten (USA)', currentValue: 500 })
    const invDE = makeInv({ name: 'SAP', isin: 'DE0007164600', category: 'Stocks', region: 'Deutschland', currentValue: 300 })
    const invCN = makeInv({ name: 'Alibaba', isin: 'KYG017191142', category: 'Stocks', region: 'China', currentValue: 200 })

    // Manual override on SAP
    setDimensionTag('geo', 'DE0007164600', 'Benutzerdefiniert', false)

    runAutoTagging([invUS, invDE, invCN])

    const dims = loadDimensions()
    const geoDim = dims.find((d) => d.id === 'geo')!
    const alloc = computeDimensionAllocation([invUS, invDE, invCN], geoDim)

    const usaBucket = alloc.find((a) => a.tag === 'Nordamerika')
    const manualBucket = alloc.find((a) => a.tag === 'Benutzerdefiniert')
    const emBucket = alloc.find((a) => a.tag === 'Asien' || a.tag === 'China' || a.tag === 'Asien-Pazifik')

    expect(usaBucket?.value).toBe(500)
    expect(usaBucket?.percentage).toBeCloseTo(0.5, 4)
    expect(manualBucket?.value).toBe(300) // manual tag preserved!
    expect(emBucket?.value).toBe(200)
  })

  it('places untagged investments into Nicht zugeordnet bucket', () => {
    const invUnknown = makeInv({ name: 'Unknown Co', isin: 'XX0000000001', category: 'Stocks', currentValue: 400 })
    const geoDim = loadDimensions().find((d) => d.id === 'geo')!

    const alloc = computeDimensionAllocation([invUnknown], geoDim)
    expect(alloc).toHaveLength(1)
    expect(alloc[0].tag).toBe('Nicht zugeordnet')
    expect(alloc[0].percentage).toBeCloseTo(1, 4)
  })
})
