/**
 * Broker availability tracking for investments.
 * 
 * Strategy: Since none of the three brokers (Bitpanda, Scalable Capital, Flatex AT)
 * offer public APIs for checking security availability, we use a heuristic approach:
 * 
 * 1. Flatex AT — Full-service broker with Xetra/European exchange access. 
 *    Generally available: anything with a valid ISIN traded on major exchanges.
 *    Not available: most crypto ETPs, some very exotic small-caps.
 *    
 * 2. Scalable Capital — Uses gettex/Xetra. Broad coverage of EU/US stocks.
 *    Generally available: EU and US stocks/ETFs with standard ISINs.
 *    Not available: very small-caps, some exotic markets, derivatives.
 *    
 * 3. Bitpanda — Offers fractional shares of ~7500 stocks + ~2500 ETFs.
 *    Focused on popular large/mid-caps. 
 *    Not available: small-caps, exotic markets, derivatives, certificates.
 *    
 * Users can override any auto-detection via manual toggles (persisted in localStorage).
 */

import type { Investment } from './parser'

export type BrokerName = 'Bitpanda' | 'Scalable' | 'Flatex AT'

export const ALL_BROKERS: BrokerName[] = ['Bitpanda', 'Scalable', 'Flatex AT']

export const BROKER_COLORS: Record<BrokerName, string> = {
  'Bitpanda': '#00b4a0',   // Bitpanda teal
  'Scalable': '#fc4c53',   // Scalable red/coral
  'Flatex AT': '#06a1e0',  // Flatex blue
}

export const BROKER_SHORT: Record<BrokerName, string> = {
  'Bitpanda': 'BP',
  'Scalable': 'SC',
  'Flatex AT': 'FX',
}

export interface BrokerOverride {
  /** ISIN or fallback name key */
  key: string
  /** Broker name */
  broker: BrokerName
  /** true = force available, false = force unavailable */
  available: boolean
}

const OVERRIDE_STORAGE_KEY = 'patty-broker-overrides'

// ---------- Override persistence ----------

function loadOverrides(): BrokerOverride[] {
  try {
    const raw = localStorage.getItem(OVERRIDE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveOverrides(entries: BrokerOverride[]): void {
  localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(entries))
}

function getOverride(key: string, broker: BrokerName): boolean | null {
  const overrides = loadOverrides()
  const entry = overrides.find((o) => o.key === key && o.broker === broker)
  return entry ? entry.available : null
}

/** Toggle an override for a given asset key + broker. Cycles: auto → force-on → force-off → auto */
export function cycleOverride(key: string, broker: BrokerName): void {
  const overrides = loadOverrides()
  const idx = overrides.findIndex((o) => o.key === key && o.broker === broker)

  if (idx < 0) {
    // No override yet → set force-on
    overrides.push({ key, broker, available: true })
  } else if (overrides[idx].available === true) {
    // force-on → force-off
    overrides[idx].available = false
  } else {
    // force-off → remove (back to auto)
    overrides.splice(idx, 1)
  }

  saveOverrides(overrides)
}

/** Export all broker overrides as a JSON file download */
export function exportBrokerOverrides(): void {
  const overrides = loadOverrides()
  const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `patty-broker-overrides-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Import broker overrides from a JSON file (merges with existing, upserts by key+broker) */
export function importBrokerOverrides(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const imported: BrokerOverride[] = JSON.parse(text)
        if (!Array.isArray(imported)) {
          reject(new Error('Ungültiges Format: Array von Overrides erwartet'))
          return
        }
        const existing = loadOverrides()
        let count = 0
        for (const entry of imported) {
          if (!entry.key || !entry.broker || typeof entry.available !== 'boolean') continue
          const idx = existing.findIndex((o) => o.key === entry.key && o.broker === entry.broker)
          if (idx >= 0) {
            existing[idx] = entry
          } else {
            existing.push(entry)
          }
          count++
        }
        saveOverrides(existing)
        resolve(count)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.readAsText(file, 'utf-8')
  })
}

/** Clear all broker overrides */
export function clearBrokerOverrides(): void {
  localStorage.removeItem(OVERRIDE_STORAGE_KEY)
}

/** Get count of broker overrides */
export function getBrokerOverrideCount(): number {
  return loadOverrides().length
}

// ---------- Heuristic detection ----------

/** Countries / ISIN prefixes where Bitpanda typically has good coverage */
const BITPANDA_ISIN_PREFIXES = [
  'US', 'DE', 'FR', 'NL', 'GB', 'IT', 'ES', 'CH', 'DK', 'FI', 'NO', 'SE',
  'IE', 'AT', 'BE', 'LU', 'PT', 'JP',
]

/** Countries / ISIN prefixes generally accessible on Scalable via gettex/Xetra */
const SCALABLE_ISIN_PREFIXES = [
  'US', 'DE', 'FR', 'NL', 'GB', 'IT', 'ES', 'CH', 'DK', 'FI', 'NO', 'SE',
  'IE', 'AT', 'BE', 'LU', 'PT', 'JP', 'AU', 'CA', 'HK', 'SG', 'KY', 'CY',
  'BM', 'CZ', 'GR', 'ZA',
]

/** Countries / ISIN prefixes accessible on Flatex AT (broadest coverage) */
const FLATEX_ISIN_PREFIXES = [
  'US', 'DE', 'FR', 'NL', 'GB', 'IT', 'ES', 'CH', 'DK', 'FI', 'NO', 'SE',
  'IE', 'AT', 'BE', 'LU', 'PT', 'JP', 'AU', 'CA', 'HK', 'SG', 'KY', 'CY',
  'BM', 'CZ', 'GR', 'ZA', 'CN', 'BR', 'NG',
]

/** Types that are typically NOT available on Bitpanda */
const EXCLUDED_TYPES_BITPANDA = ['zertifikate/os', 'zertifikat', 'optionsschein', 'manual']

/** Types that are typically NOT available on Scalable */
const EXCLUDED_TYPES_SCALABLE = ['zertifikate/os', 'optionsschein']

/** ISINs that are known to be available on Bitpanda (curated list for common ETFs/stocks) */
const BITPANDA_KNOWN_ISINS = new Set([
  // Popular iShares ETFs
  'IE000I8KRLL9', 'IE00063FT9K6', 'IE000RDRMSD1',
])

function hasValidIsin(isin: string): boolean {
  return Boolean(isin) && isin.length >= 12 && isin.toUpperCase() !== 'N/A'
}

function isinPrefix(isin: string): string {
  return isin.substring(0, 2).toUpperCase()
}

function isDerivative(inv: Investment): boolean {
  const t = inv.type.toLowerCase()
  return t.includes('zertifikat') || t.includes('optionsschein') || t.includes('os')
}

function isLikelySmallCap(inv: Investment): boolean {
  // Heuristic: if the name contains "long", "short", "turbo", "call", "put", "faktor" → derivative product
  const n = inv.name.toLowerCase()
  return /\b(long|short|turbo|call|put|factor|faktor|discount|open end)\b/.test(n)
}

export type AvailabilityStatus = 'available' | 'unavailable' | 'override-on' | 'override-off'

/** Keywords that indicate a crypto asset */
const CRYPTO_KEYWORDS = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'cardano', 'ada',
  'polkadot', 'dot', 'chainlink', 'link', 'ripple', 'xrp', 'litecoin', 'ltc',
  'crypto', 'krypto', 'blockchain', 'altcoin', 'defi', 'token', 'coin',
  'tron', 'trx', 'avalanche', 'avax', 'polygon', 'matic', 'cosmos', 'atom',
  'uniswap', 'aave', 'maker', 'stellar', 'xlm', 'dogecoin', 'doge', 'shib',
]

/** Detect if an investment is a crypto asset */
function isCrypto(inv: Investment): boolean {
  const combined = (inv.name + ' ' + inv.sector + ' ' + inv.type + ' ' + inv.category).toLowerCase()
  // Check category first (most reliable)
  if (inv.category === 'Bitcoin' || inv.category === 'Altcoins') return true
  // Sector/type hints
  if (combined.includes('kryptowähr') || combined.includes('blockchain') || combined.includes('fremdwährungen')) return true
  // Name keyword matching
  return CRYPTO_KEYWORDS.some((kw) => combined.includes(kw))
}

function detectBitpanda(inv: Investment): boolean {
  // Bitpanda is primarily a crypto exchange — crypto is always available
  if (isCrypto(inv)) return true

  if (!hasValidIsin(inv.isin)) return false
  if (isDerivative(inv) || isLikelySmallCap(inv)) return false
  const type = inv.type.toLowerCase()
  if (EXCLUDED_TYPES_BITPANDA.some((t) => type.includes(t))) return false

  // Bitpanda known ISINs
  if (BITPANDA_KNOWN_ISINS.has(inv.isin)) return true

  const prefix = isinPrefix(inv.isin)
  if (!BITPANDA_ISIN_PREFIXES.includes(prefix)) return false

  // Bitpanda focuses on larger, more popular stocks
  // ETFs from iShares/Xtrackers etc. are generally available
  const isETF = type === 'etf'
  if (isETF) return true

  // For stocks: Bitpanda has ~7500 stocks. Large/mid cap from major markets are likely available.
  // Very small companies are less likely.
  return true
}

function detectScalable(inv: Investment): boolean {
  if (!hasValidIsin(inv.isin)) return false
  if (isLikelySmallCap(inv)) return false
  const type = inv.type.toLowerCase()
  if (EXCLUDED_TYPES_SCALABLE.some((t) => type.includes(t))) return false

  const prefix = isinPrefix(inv.isin)
  if (!SCALABLE_ISIN_PREFIXES.includes(prefix)) return false

  return true
}

function detectFlatex(inv: Investment): boolean {
  if (!hasValidIsin(inv.isin)) return false
  // Flatex has the broadest access — essentially anything tradable on an exchange  
  const prefix = isinPrefix(inv.isin)
  if (!FLATEX_ISIN_PREFIXES.includes(prefix)) return false

  return true
}

/** Get the availability status for one broker on one investment */
export function getAvailability(inv: Investment, broker: BrokerName, assetKey: string): AvailabilityStatus {
  // Check for manual override first
  const override = getOverride(assetKey, broker)
  if (override === true) return 'override-on'
  if (override === false) return 'override-off'

  // Auto-detect
  switch (broker) {
    case 'Bitpanda': return detectBitpanda(inv) ? 'available' : 'unavailable'
    case 'Scalable': return detectScalable(inv) ? 'available' : 'unavailable'
    case 'Flatex AT': return detectFlatex(inv) ? 'available' : 'unavailable'
  }
}

/** Build a full availability map for all investments */
export function buildAvailabilityMap(
  investments: Investment[],
  keyFn: (inv: Investment) => string
): Map<string, Record<BrokerName, AvailabilityStatus>> {
  const map = new Map<string, Record<BrokerName, AvailabilityStatus>>()
  for (const inv of investments) {
    const key = keyFn(inv)
    const record = {} as Record<BrokerName, AvailabilityStatus>
    for (const broker of ALL_BROKERS) {
      record[broker] = getAvailability(inv, broker, key)
    }
    map.set(key, record)
  }
  return map
}
