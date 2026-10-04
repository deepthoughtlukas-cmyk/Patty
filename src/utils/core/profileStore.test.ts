import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadCustomProfiles,
  saveCustomProfiles,
  upsertCustomProfiles,
  clearCustomProfiles,
  getAllProfiles,
  validateProfiles,
  setRoleOverride,
  loadRoleOverrides,
  loadCoreSparplanConfig,
  saveCoreSparplanConfig,
} from './profileStore'
import type { CoreProfile } from './types'

describe('profileStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('validates invalid profile structures', () => {
    expect(validateProfiles(null)).toEqual([])
    expect(validateProfiles({})).toEqual([])
    expect(validateProfiles([{ id: 'test' }])).toEqual([]) // missing name/countries
  })

  it('saves and loads custom profiles', () => {
    const custom: CoreProfile = {
      id: 'custom-etf-1',
      name: 'Custom World ETF',
      isins: ['US1234567890'],
      matchers: [['custom']],
      countries: { US: 60, EU: 40 },
      size: { large: 80, mid: 20, small: 0 },
      factors: { quality: 1 },
      role: 'market',
      asOf: '2026-10',
      confidence: 'custom',
    }

    saveCustomProfiles([custom])
    const loaded = loadCustomProfiles()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Custom World ETF')

    const all = getAllProfiles()
    expect(all.some((p) => p.id === 'custom-etf-1')).toBe(true)

    clearCustomProfiles()
    expect(loadCustomProfiles()).toHaveLength(0)
  })

  it('stores and retrieves role overrides', () => {
    expect(loadRoleOverrides()).toEqual({})
    setRoleOverride('ishares-edge-world-quality', 'market')
    expect(loadRoleOverrides()['ishares-edge-world-quality']).toBe('market')
  })

  it('stores and retrieves core sparplan configuration', () => {
    expect(loadCoreSparplanConfig()).toBeNull()
    saveCoreSparplanConfig({
      monthlyBudget: 400,
      selectedKeys: ['pos-avantis-em'],
      customAmounts: { 'pos-avantis-em': 400 },
      projectionHorizon: 24,
      maxPositions: 4,
    })
    const loaded = loadCoreSparplanConfig()
    expect(loaded).not.toBeNull()
    expect(loaded?.monthlyBudget).toBe(400)
    expect(loaded?.selectedKeys).toEqual(['pos-avantis-em'])
    expect(loaded?.customAmounts).toEqual({ 'pos-avantis-em': 400 })
    expect(loaded?.projectionHorizon).toBe(24)
  })
})
