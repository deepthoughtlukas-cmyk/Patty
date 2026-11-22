import type { CoreProfile, FactorKey, RegionKey } from './types'

export const COUNTRY_NAMES: Record<string, string> = {
  US: 'USA', CA: 'Kanada', GB: 'Großbritannien', JP: 'Japan', CH: 'Schweiz', DE: 'Deutschland',
  FR: 'Frankreich', NL: 'Niederlande', DK: 'Dänemark', SE: 'Schweden', ES: 'Spanien', IT: 'Italien',
  NO: 'Norwegen', FI: 'Finnland', BE: 'Belgien', AU: 'Australien', HK: 'Hongkong', SG: 'Singapur',
  NZ: 'Neuseeland', CN: 'China', TW: 'Taiwan', IN: 'Indien', KR: 'Südkorea', BR: 'Brasilien',
  SA: 'Saudi-Arabien', ZA: 'Südafrika', MX: 'Mexiko', TH: 'Thailand', MY: 'Malaysia',
  VN: 'Vietnam', NG: 'Nigeria', KZ: 'Kasachstan', RO: 'Rumänien', MA: 'Marokko', OM: 'Oman',
  KE: 'Kenia', BD: 'Bangladesch', PK: 'Pakistan', LK: 'Sri Lanka', HR: 'Kroatien', SI: 'Slowenien',
  IS: 'Island',
  EU_OTH: 'Sonst. Europa', PAC_OTH: 'Sonst. Pazifik (DM)', EM_OTH: 'Sonst. Schwellenländer',
  FM_OTH: 'Sonst. Frontier-Märkte',
}

export const REGION_LABELS: Record<RegionKey, string> = {
  US: 'USA',
  CA: 'Kanada',
  EU: 'Europa',
  JP: 'Japan',
  PAC: 'Pazifik ex Japan',
  EM: 'Schwellenländer',
  FM: 'Frontier / Entwicklungsländer',
}

export const ALL_REGIONS: RegionKey[] = ['US', 'CA', 'EU', 'JP', 'PAC', 'EM', 'FM']

const REGION_BY_COUNTRY: Record<string, RegionKey> = {
  US: 'US', CA: 'CA', JP: 'JP',
  GB: 'EU', CH: 'EU', DE: 'EU', FR: 'EU', NL: 'EU', DK: 'EU', SE: 'EU', ES: 'EU', IT: 'EU',
  NO: 'EU', FI: 'EU', BE: 'EU', EU_OTH: 'EU',
  AU: 'PAC', HK: 'PAC', SG: 'PAC', NZ: 'PAC', PAC_OTH: 'PAC',
  VN: 'FM', NG: 'FM', KZ: 'FM', RO: 'FM', MA: 'FM', OM: 'FM', KE: 'FM', BD: 'FM',
  PK: 'FM', LK: 'FM', HR: 'FM', SI: 'FM', IS: 'FM', FM_OTH: 'FM',
}

/** Unbekannte Codes gelten als Schwellenländer (EM); Frontier-Länder sind explizit als FM hinterlegt */
export function regionOf(country: string): RegionKey {
  return REGION_BY_COUNTRY[country] ?? 'EM'
}

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code
}

const MULTI_COUNTRY_REGIONS = new Set<RegionKey>(['EU', 'PAC', 'EM'])

/** Erkennt, ob ein ETF überwiegend (≥ 50 %) in Frontier-/Entwicklungsländern investiert ist */
export function isFrontierProfile(profile: CoreProfile): boolean {
  const total = Object.values(profile.countries).reduce((s, v) => s + (v > 0 ? v : 0), 0)
  if (total <= 0) return false
  let fmSum = 0
  for (const [code, val] of Object.entries(profile.countries)) {
    if (val > 0 && regionOf(code) === 'FM') {
      fmSum += val
    }
  }
  return fmSum / total >= 0.5
}

/**
 * Erkennt Einzelland-ETFs (≥ 80 % in einem Land) innerhalb von Multi-Land-Regionen (EU, PAC, EM).
 * USA, Kanada und Japan bilden jeweils eigene Kern-Regionen und sind explizit erlaubt.
 */
export function isSingleCountryTilt(profile: CoreProfile): boolean {
  const total = Object.values(profile.countries).reduce((s, v) => s + (v > 0 ? v : 0), 0)
  if (total <= 0) return false
  for (const [code, val] of Object.entries(profile.countries)) {
    if (val <= 0) continue
    if (val / total >= 0.8 && MULTI_COUNTRY_REGIONS.has(regionOf(code))) {
      return true
    }
  }
  return false
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', CH: 'CHF', JP: 'JPY', AU: 'AUD', HK: 'HKD',
  DE: 'EUR', FR: 'EUR', NL: 'EUR', ES: 'EUR', IT: 'EUR', FI: 'EUR', BE: 'EUR', EU_OTH: 'EUR',
  CN: 'CNY', TW: 'TWD', IN: 'INR', KR: 'KRW', BR: 'BRL',
}

/** Näherung: Währung des Landes (Hedging wird im Profil über hedgedToEur berücksichtigt) */
export function currencyOf(country: string): string {
  return CURRENCY_BY_COUNTRY[country] ?? 'Übrige'
}

export const FACTOR_LABELS: Record<FactorKey, string> = {
  quality: 'Quality',
  value: 'Value',
  momentum: 'Momentum',
  lowVol: 'Low Volatility',
  dividend: 'Dividende',
  size: 'Size (Small Cap)',
}

export const ALL_FACTORS: FactorKey[] = ['quality', 'value', 'momentum', 'lowVol', 'dividend', 'size']
