import type { Investment } from './parser'
import type { DepositoryMap } from './depositories'
import { investmentKey } from './userRules'

export const TROY_OZ_IN_GRAMS = 31.1035
export const XTRACKERS_SILVER_OZ_PER_SHARE = 1.43
export const GRAM_GOLD_ETFS = ['DE000A0S9GB0', 'DE000EWG0LD1', 'DE000EWG2LD7']
export const ONE_OZ_SILVER_ETCS = ['JE00B1VS3333', 'IE00B4NCWG09', 'IE00B43VDT70']

export type PreciousMetalKind = 'gold' | 'silver'

export interface AssetOunceInfo {
  metal: PreciousMetalKind
  ounces: number
  estimated: boolean
  detail: string
}

export interface RefMetalPrices {
  goldOzPrice?: number
  silverOzPrice?: number
}

export interface DepositoryOunceSummary {
  depository: string
  goldOz: number
  silverOz: number
  goldEstimated: boolean
  silverEstimated: boolean
  goldValue: number
  silverValue: number
  totalValue: number
  assetCount: number
}

export interface MetalOunceOverview {
  totalGoldOz: number
  totalSilverOz: number
  goldEstimated: boolean
  silverEstimated: boolean
  byDepository: DepositoryOunceSummary[]
}

export function getPreciousMetalType(inv: Investment): PreciousMetalKind | null {
  if ((inv.type || '').toLowerCase() === 'aktien') return null
  if (inv.category === 'Safe-Haven Gold') return 'gold'
  if (inv.subcategory === 'Silber') return 'silver'
  return null
}

export function parseOunceDenomination(name: string): number | null {
  const match = name.match(/\b(1\/[248]|1\/10|1\/20|\d+(?:[.,]\d+)?)\s*(oz|unze|unzen|ounce|ounces)\b/i)
  if (!match) return null
  const sizeStr = match[1].replace(',', '.')
  let ounces = 0
  if (sizeStr.includes('/')) {
    const [n, d] = sizeStr.split('/')
    const num = parseFloat(n)
    const den = parseFloat(d)
    ounces = den > 0 ? num / den : 0
  } else {
    ounces = parseFloat(sizeStr)
  }
  return Number.isFinite(ounces) && ounces > 0 ? ounces : null
}

export function formatOunces(ounces: number): string {
  return ounces.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })
}

export function getAssetOunceInfo(inv: Investment, refPrices?: RefMetalPrices): AssetOunceInfo | null {
  const metal = getPreciousMetalType(inv)
  if (!metal) return null

  if (typeof inv._ounces === 'number' && Number.isFinite(inv._ounces) && inv._ounces > 0) {
    return {
      metal,
      ounces: inv._ounces,
      estimated: false,
      detail: `${formatOunces(inv._ounces)} oz aus Stückelung / Bestand`,
    }
  }

  const unitOz = parseOunceDenomination(inv.name)
  if (unitOz !== null) {
    const qty = inv.quantity > 0 ? inv.quantity : 1
    const ounces = unitOz * qty
    return {
      metal,
      ounces,
      estimated: false,
      detail: `${qty} × ${formatOunces(unitOz)} oz`,
    }
  }

  const kgMatch = inv.name.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilogramm)\b/i)
  if (kgMatch) {
    const kg = parseFloat(kgMatch[1].replace(',', '.'))
    if (Number.isFinite(kg) && kg > 0) {
      const qty = inv.quantity > 0 ? inv.quantity : 1
      const ounces = ((kg * 1000) / TROY_OZ_IN_GRAMS) * qty
      return {
        metal,
        ounces,
        estimated: false,
        detail: `${qty} × ${kg} kg ÷ ${TROY_OZ_IN_GRAMS} g/oz`,
      }
    }
  }

  const gramMatch = inv.name.match(/\b(\d+(?:[.,]\d+)?)\s*(g|gramm|gram)\b/i)
  if (gramMatch) {
    const grams = parseFloat(gramMatch[1].replace(',', '.'))
    if (Number.isFinite(grams) && grams > 0) {
      const qty = inv.quantity > 0 ? inv.quantity : 1
      const ounces = (grams / TROY_OZ_IN_GRAMS) * qty
      return {
        metal,
        ounces,
        estimated: false,
        detail: `${qty} × ${grams} g ÷ ${TROY_OZ_IN_GRAMS} g/oz`,
      }
    }
  }

  const isinUpper = inv.isin?.toUpperCase() || ''
  const nameUpper = inv.name.toUpperCase()

  if (
    (GRAM_GOLD_ETFS.includes(isinUpper) ||
      nameUpper.includes('XETRA-GOLD') ||
      nameUpper.includes('EUWAX GOLD')) &&
    inv.quantity > 0
  ) {
    const ounces = inv.quantity / TROY_OZ_IN_GRAMS
    return {
      metal,
      ounces,
      estimated: false,
      detail: `${inv.quantity.toLocaleString('de-DE')} g ÷ ${TROY_OZ_IN_GRAMS} g/oz`,
    }
  }

  if ((isinUpper === 'DE000A2T0VS9' || nameUpper.includes('SILBER 80')) && inv.quantity > 0) {
    const ounces = inv.quantity * XTRACKERS_SILVER_OZ_PER_SHARE
    return {
      metal,
      ounces,
      estimated: false,
      detail: `${inv.quantity.toLocaleString('de-DE')} Anteile × ${formatOunces(XTRACKERS_SILVER_OZ_PER_SHARE)} oz`,
    }
  }

  if (
    (isinUpper === 'XC0009655157' ||
      isinUpper === 'XC0009653103' ||
      ONE_OZ_SILVER_ETCS.includes(isinUpper)) &&
    inv.quantity > 0
  ) {
    return {
      metal,
      ounces: inv.quantity,
      estimated: false,
      detail: `${formatOunces(inv.quantity)} oz Bestand`,
    }
  }

  const refPrice = metal === 'gold' ? refPrices?.goldOzPrice : refPrices?.silverOzPrice
  if (inv.currentValue > 0 && refPrice && refPrice > 0) {
    return {
      metal,
      ounces: inv.currentValue / refPrice,
      estimated: true,
      detail: 'Geschätzt aus aktuellem Wert / Unzenpreis',
    }
  }

  return null
}

export function computeMetalOunceOverview(
  investments: Investment[],
  depositories: DepositoryMap,
  refPrices?: RefMetalPrices
): MetalOunceOverview {
  const depoMap = new Map<string, DepositoryOunceSummary>()
  let totalGoldOz = 0
  let totalSilverOz = 0
  let goldEstimated = false
  let silverEstimated = false

  for (const inv of investments) {
    if (inv.currentValue <= 0) continue
    const info = getAssetOunceInfo(inv, refPrices)
    if (!info || info.ounces <= 0) continue

    const depository = (depositories[investmentKey(inv)] || '').trim() || 'Nicht zugewiesen'
    let entry = depoMap.get(depository)
    if (!entry) {
      entry = {
        depository,
        goldOz: 0,
        silverOz: 0,
        goldEstimated: false,
        silverEstimated: false,
        goldValue: 0,
        silverValue: 0,
        totalValue: 0,
        assetCount: 0,
      }
      depoMap.set(depository, entry)
    }

    if (info.metal === 'gold') {
      entry.goldOz += info.ounces
      entry.goldValue += inv.currentValue
      if (info.estimated) {
        entry.goldEstimated = true
        goldEstimated = true
      }
      totalGoldOz += info.ounces
    } else {
      entry.silverOz += info.ounces
      entry.silverValue += inv.currentValue
      if (info.estimated) {
        entry.silverEstimated = true
        silverEstimated = true
      }
      totalSilverOz += info.ounces
    }

    entry.totalValue += inv.currentValue
    entry.assetCount += 1
  }

  const byDepository = Array.from(depoMap.values()).sort((a, b) => {
    if (a.depository === 'Nicht zugewiesen') return 1
    if (b.depository === 'Nicht zugewiesen') return -1
    if (Math.abs(b.totalValue - a.totalValue) > 0.001) {
      return b.totalValue - a.totalValue
    }
    return a.depository.localeCompare(b.depository)
  })

  return {
    totalGoldOz,
    totalSilverOz,
    goldEstimated,
    silverEstimated,
    byDepository,
  }
}
