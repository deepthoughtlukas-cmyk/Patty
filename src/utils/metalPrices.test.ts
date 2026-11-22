import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchMetalPricesEur,
  fetchSingleMetalPriceEur,
  loadMetalPricesMeta,
  saveMetalPricesMeta,
  METAL_FETCH_ERROR_MESSAGE,
} from './metalPrices'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('metalPrices', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('fetches Gold and Silver EUR prices from primary provider (gold-api.com) without custom headers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://api.gold-api.com/price/XAU/EUR') {
        return jsonResponse({ price: 3225.094, updatedAt: '2026-11-22T14:00:10Z' })
      }
      if (url === 'https://api.gold-api.com/price/XAG/EUR') {
        return jsonResponse({ price: 37.4362, updatedAt: '2026-11-22T14:00:09Z' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchMetalPricesEur()

    expect(result.goldEur).toBe(3225.09)
    expect(result.silverEur).toBe(37.44)
    expect(result.source).toBe('gold-api.com')
    expect(result.providerUpdatedAt).toBe('2026-11-22T14:00:10Z')
    expect(typeof result.fetchedAt).toBe('string')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toBeDefined()
      expect((init as RequestInit).headers).toBeUndefined()
      expect((init as RequestInit).cache).toBeUndefined()
    }
  })

  it('falls back to currency-api (jsDelivr) when primary fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.gold-api.com/')) {
        return jsonResponse({ error: 'Service unavailable' }, 503)
      }
      if (url === 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json') {
        return jsonResponse({ date: '2026-11-22', xau: { eur: 3224.5199 } })
      }
      if (url === 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xag.json') {
        return jsonResponse({ date: '2026-11-22', xag: { eur: 37.3677 } })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchMetalPricesEur()

    expect(result.goldEur).toBe(3224.52)
    expect(result.silverEur).toBe(37.37)
    expect(result.source).toBe('currency-api (jsDelivr)')
    expect(result.providerUpdatedAt).toBe('2026-11-22')
  })

  it('falls back to currency-api (Pages) when primary and jsDelivr fail', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.gold-api.com/')) {
        throw new Error('Network failure')
      }
      if (url.startsWith('https://cdn.jsdelivr.net/')) {
        return jsonResponse({}, 500)
      }
      if (url === 'https://latest.currency-api.pages.dev/v1/currencies/xau.json') {
        return jsonResponse({ date: '2026-11-22', xau: { eur: 3210.125 } })
      }
      if (url === 'https://latest.currency-api.pages.dev/v1/currencies/xag.json') {
        return jsonResponse({ date: '2026-11-22', xag: { eur: 36.894 } })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchMetalPricesEur()

    expect(result.goldEur).toBe(3210.13)
    expect(result.silverEur).toBe(36.89)
    expect(result.source).toBe('currency-api (Pages)')
    expect(result.providerUpdatedAt).toBe('2026-11-22')
  })

  it('falls back when primary returns invalid payload (zero or missing price)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://api.gold-api.com/price/XAU/EUR') {
        return jsonResponse({ price: 0 })
      }
      if (url === 'https://api.gold-api.com/price/XAG/EUR') {
        return jsonResponse({})
      }
      if (url === 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json') {
        return jsonResponse({ date: '2026-11-22', xau: { eur: 3201.4 } })
      }
      if (url === 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xag.json') {
        return jsonResponse({ date: '2026-11-22', xag: { eur: 36.5 } })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchMetalPricesEur()

    expect(result.goldEur).toBe(3201.4)
    expect(result.silverEur).toBe(36.5)
    expect(result.source).toBe('currency-api (jsDelivr)')
  })

  it('rejects with German error message when all providers fail', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'down' }, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMetalPricesEur()).rejects.toThrow(METAL_FETCH_ERROR_MESSAGE)
  })

  it('fetches single metal price for gold and silver independently', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://api.gold-api.com/price/XAU/EUR') {
        return jsonResponse({ price: 3250.555, updatedAt: '2026-11-22T14:05:00Z' })
      }
      if (url === 'https://api.gold-api.com/price/XAG/EUR') {
        return jsonResponse({ price: 38.124, updatedAt: '2026-11-22T14:05:01Z' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const goldResult = await fetchSingleMetalPriceEur('gold')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.gold-api.com/price/XAU/EUR', expect.any(Object))
    expect(goldResult).toMatchObject({
      metal: 'gold',
      priceEur: 3250.56,
      source: 'gold-api.com',
      providerUpdatedAt: '2026-11-22T14:05:00Z',
    })

    const silverResult = await fetchSingleMetalPriceEur('silver')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.gold-api.com/price/XAG/EUR', expect.any(Object))
    expect(silverResult).toMatchObject({
      metal: 'silver',
      priceEur: 38.12,
      source: 'gold-api.com',
      providerUpdatedAt: '2026-11-22T14:05:01Z',
    })
  })

  it('persists and clears metal price metadata in localStorage', () => {
    expect(loadMetalPricesMeta()).toBeNull()

    const meta = {
      fetchedAt: '2026-11-22T14:00:00.000Z',
      source: 'gold-api.com',
      providerUpdatedAt: '2026-11-22T14:00:10Z',
    }
    saveMetalPricesMeta(meta)
    expect(loadMetalPricesMeta()).toEqual(meta)

    saveMetalPricesMeta(null)
    expect(loadMetalPricesMeta()).toBeNull()
  })
})
