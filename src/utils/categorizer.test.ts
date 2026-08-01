import { describe, it, expect } from 'vitest'
import { autoCategory, autoSubcategory } from './categorizer'
import type { Investment } from './parser'

describe('Categorizer', () => {
  it('categorizes known stocks correctly', () => {
    const inv: Investment = {
      id: '1',
      name: 'Apple Inc',
      isin: 'US0378331005',
      type: 'Aktien',
      value: 1000,
      qty: 10,
      sector: 'Technology',
      region: 'Nordamerika',
      currency: 'USD',
      depository: ''
    }
    const category = autoCategory(inv)
    const sub = autoSubcategory(inv)
    expect(category).toBe('Stocks')
    expect(sub).toBe('General')
  })
})
