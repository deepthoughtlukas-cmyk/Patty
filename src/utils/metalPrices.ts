export type MetalType = 'gold' | 'silver'

export interface MetalPricesResult {
  goldEur: number
  silverEur: number
  source: string
  fetchedAt: string
  providerUpdatedAt?: string
}

export interface SingleMetalPriceResult {
  metal: MetalType
  priceEur: number
  source: string
  fetchedAt: string
  providerUpdatedAt?: string
}

export interface MetalPricesMeta {
  fetchedAt: string
  source: string
  providerUpdatedAt?: string
}

export interface FetchMetalPricesOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

const METAL_PRICES_META_KEY = 'patty-metal-prices-meta'
const DEFAULT_TIMEOUT_MS = 8000

export const METAL_FETCH_ERROR_MESSAGE =
  'Edelmetallpreise konnten nicht geladen werden. Bitte Internetverbindung prüfen oder später erneut versuchen.'

interface ParsedQuote {
  priceEur: number
  updatedAt?: string
}

interface MetalProvider {
  name: string
  urls: Record<MetalType, string>
  parse: (payload: unknown, metal: MetalType) => ParsedQuote
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100
}

function assertValidPrice(value: unknown, providerName: string, metal: MetalType): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${metal} price from ${providerName}`)
  }
  return roundPrice(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseGoldApiQuote(payload: unknown, metal: MetalType, providerName: string): ParsedQuote {
  if (!isRecord(payload)) {
    throw new Error(`Invalid response shape from ${providerName}`)
  }
  const priceEur = assertValidPrice(payload.price, providerName, metal)
  const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : undefined
  return { priceEur, updatedAt }
}

function parseCurrencyApiQuote(payload: unknown, metal: MetalType, providerName: string): ParsedQuote {
  if (!isRecord(payload)) {
    throw new Error(`Invalid response shape from ${providerName}`)
  }
  const key = metal === 'gold' ? 'xau' : 'xag'
  const metalRates = payload[key]
  if (!isRecord(metalRates)) {
    throw new Error(`Missing ${key} rates from ${providerName}`)
  }
  const priceEur = assertValidPrice(metalRates.eur, providerName, metal)
  const updatedAt = typeof payload.date === 'string' ? payload.date : undefined
  return { priceEur, updatedAt }
}

const PROVIDERS: MetalProvider[] = [
  {
    name: 'gold-api.com',
    urls: {
      gold: 'https://api.gold-api.com/price/XAU/EUR',
      silver: 'https://api.gold-api.com/price/XAG/EUR',
    },
    parse: (payload, metal) => parseGoldApiQuote(payload, metal, 'gold-api.com'),
  },
  {
    name: 'currency-api (jsDelivr)',
    urls: {
      gold: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json',
      silver: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xag.json',
    },
    parse: (payload, metal) => parseCurrencyApiQuote(payload, metal, 'currency-api (jsDelivr)'),
  },
  {
    name: 'currency-api (Pages)',
    urls: {
      gold: 'https://latest.currency-api.pages.dev/v1/currencies/xau.json',
      silver: 'https://latest.currency-api.pages.dev/v1/currencies/xag.json',
    },
    parse: (payload, metal) => parseCurrencyApiQuote(payload, metal, 'currency-api (Pages)'),
  },
]

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError')
  }
  const err = new Error('The operation was aborted.')
  err.name = 'AbortError'
  return err
}

async function fetchJsonSimple(url: string, options?: FetchMetalPricesOptions): Promise<unknown> {
  const externalSignal = options?.signal
  if (externalSignal?.aborted) {
    throw createAbortError()
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()

  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Plain CORS-simple GET without custom headers or cache directives so preflight is never triggered
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort)
    }
  }
}

async function fetchMetalFromProvider(
  provider: MetalProvider,
  metal: MetalType,
  options?: FetchMetalPricesOptions
): Promise<ParsedQuote> {
  const payload = await fetchJsonSimple(provider.urls[metal], options)
  return provider.parse(payload, metal)
}

export async function fetchMetalPricesEur(options?: FetchMetalPricesOptions): Promise<MetalPricesResult> {
  for (const provider of PROVIDERS) {
    if (options?.signal?.aborted) {
      throw createAbortError()
    }
    try {
      const [goldQuote, silverQuote] = await Promise.all([
        fetchMetalFromProvider(provider, 'gold', options),
        fetchMetalFromProvider(provider, 'silver', options),
      ])
      return {
        goldEur: goldQuote.priceEur,
        silverEur: silverQuote.priceEur,
        source: provider.name,
        fetchedAt: new Date().toISOString(),
        providerUpdatedAt: goldQuote.updatedAt || silverQuote.updatedAt,
      }
    } catch (err) {
      if (options?.signal?.aborted) {
        throw err
      }
    }
  }

  throw new Error(METAL_FETCH_ERROR_MESSAGE)
}

export async function fetchSingleMetalPriceEur(
  metal: MetalType,
  options?: FetchMetalPricesOptions
): Promise<SingleMetalPriceResult> {
  for (const provider of PROVIDERS) {
    if (options?.signal?.aborted) {
      throw createAbortError()
    }
    try {
      const quote = await fetchMetalFromProvider(provider, metal, options)
      return {
        metal,
        priceEur: quote.priceEur,
        source: provider.name,
        fetchedAt: new Date().toISOString(),
        providerUpdatedAt: quote.updatedAt,
      }
    } catch (err) {
      if (options?.signal?.aborted) {
        throw err
      }
    }
  }

  throw new Error(METAL_FETCH_ERROR_MESSAGE)
}

export function loadMetalPricesMeta(): MetalPricesMeta | null {
  try {
    const raw = localStorage.getItem(METAL_PRICES_META_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (typeof parsed.fetchedAt !== 'string' || typeof parsed.source !== 'string') {
      return null
    }
    return {
      fetchedAt: parsed.fetchedAt,
      source: parsed.source,
      ...(typeof parsed.providerUpdatedAt === 'string'
        ? { providerUpdatedAt: parsed.providerUpdatedAt }
        : {}),
    }
  } catch {
    return null
  }
}

export function saveMetalPricesMeta(meta: MetalPricesMeta | null): void {
  if (meta === null) {
    localStorage.removeItem(METAL_PRICES_META_KEY)
    return
  }
  localStorage.setItem(METAL_PRICES_META_KEY, JSON.stringify(meta))
}
