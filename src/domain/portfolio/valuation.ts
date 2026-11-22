import type { Investment } from '../../utils/parser'
import { applySplits } from '../../utils/assetSplits'
import {
  GRAM_GOLD_ETFS,
  ONE_OZ_SILVER_ETCS,
  TROY_OZ_IN_GRAMS,
  XTRACKERS_SILVER_OZ_PER_SHARE,
  parseOunceDenomination,
} from '../../utils/metalOunces'

export interface PortfolioValuationResult {
  displayInvestments: Investment[]
  activeInvestments: Investment[]
  totalValue: number
  totalCost: number
  totalGain: number
  totalGainPct: number
  goldOzPrice: number
  silverOzPrice: number
}

const DEALER_PREMIUM = 1.03

export function applyMetalPriceOverrides(
  investments: Investment[],
  manualGoldPrice: number,
  manualSilverPrice: number
): Investment[] {
  return investments.map((inv) => {
    const isinUpper = inv.isin?.toUpperCase() || ''
    if (
      inv.category === 'Safe-Haven Gold' &&
      manualGoldPrice > 0 &&
      isinUpper === 'XC0009655157' &&
      inv.quantity > 0
    ) {
      return {
        ...inv,
        currentPrice: manualGoldPrice,
        currentValue: inv.quantity * manualGoldPrice,
      }
    }
    if (
      inv.subcategory === 'Silber' &&
      manualSilverPrice > 0 &&
      isinUpper === 'XC0009653103' &&
      inv.quantity > 0
    ) {
      return {
        ...inv,
        currentPrice: manualSilverPrice,
        currentValue: inv.quantity * manualSilverPrice,
      }
    }

    let mPrice = 0
    if (inv.category === 'Safe-Haven Gold') mPrice = manualGoldPrice
    else if (inv.subcategory === 'Silber') mPrice = manualSilverPrice

    if (mPrice > 0) {
      const ounces = parseOunceDenomination(inv.name)
      if (ounces && ounces > 0) {
        return {
          ...inv,
          currentPrice: ounces * mPrice,
          currentValue: ounces * (inv.quantity || 1) * mPrice,
        }
      }
    }
    return inv
  })
}

export function computeReferenceMetalOzPrices(
  investments: Investment[],
  manualGoldPrice: number,
  manualSilverPrice: number
): { goldOzPrice: number; silverOzPrice: number } {
  let goldGramPrice = 0
  const exactGramEtf = investments.find(
    (inv) => GRAM_GOLD_ETFS.includes(inv.isin.toUpperCase()) && inv.currentPrice > 0
  )

  if (exactGramEtf) {
    goldGramPrice = exactGramEtf.currentPrice
  } else {
    const genericGoldEtf = investments.find(
      (inv) =>
        inv.sector.toLowerCase() === 'gold' &&
        inv.name.toLowerCase().includes('gold') &&
        inv.currentPrice >= 60 &&
        inv.currentPrice <= 95
    )
    goldGramPrice = genericGoldEtf ? genericGoldEtf.currentPrice : 75
  }

  const goldOzPrice =
    manualGoldPrice > 0 ? manualGoldPrice : goldGramPrice * TROY_OZ_IN_GRAMS * DEALER_PREMIUM

  let silverSharePrice = 30
  const knownSilverEtcs = [...ONE_OZ_SILVER_ETCS, 'XC0009653103']
  const exactSilverEtc = investments.find(
    (inv) => knownSilverEtcs.includes(inv.isin?.toUpperCase() || '') && inv.currentPrice > 0
  )

  if (exactSilverEtc) {
    silverSharePrice = exactSilverEtc.currentPrice
  } else {
    const xtrackersSilver = investments.find(
      (inv) => inv.isin === 'DE000A2T0VS9' || inv.name.toUpperCase().includes('SILBER 80')
    )
    if (xtrackersSilver && xtrackersSilver.currentPrice > 0) {
      silverSharePrice = xtrackersSilver.currentPrice / XTRACKERS_SILVER_OZ_PER_SHARE
    } else {
      const genericSilver = investments.find(
        (inv) =>
          (inv.name.toLowerCase().includes('silber') || inv.name.toLowerCase().includes('silver')) &&
          inv.currentPrice > 15 &&
          inv.currentPrice < 50 &&
          (!inv.isin || inv.isin.length >= 6)
      )
      if (genericSilver) silverSharePrice = genericSilver.currentPrice
    }
  }

  const silverOzPrice = manualSilverPrice > 0 ? manualSilverPrice : silverSharePrice

  return { goldOzPrice, silverOzPrice }
}

export function computePortfolioValuation(
  investments: Investment[],
  manualGoldPrice: number,
  manualSilverPrice: number
): PortfolioValuationResult {
  const afterSplits = applySplits(investments)
  const displayInvestments = applyMetalPriceOverrides(afterSplits, manualGoldPrice, manualSilverPrice)
  const activeInvestments = displayInvestments.filter((inv) => inv.currentValue > 0)
  const totalValue = activeInvestments.reduce((s, inv) => s + inv.currentValue, 0)
  const totalCost = activeInvestments.reduce((s, inv) => s + inv.purchasePrice * inv.quantity, 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? totalGain / totalCost : 0
  const { goldOzPrice, silverOzPrice } = computeReferenceMetalOzPrices(
    displayInvestments,
    manualGoldPrice,
    manualSilverPrice
  )

  return {
    displayInvestments,
    activeInvestments,
    totalValue,
    totalCost,
    totalGain,
    totalGainPct,
    goldOzPrice,
    silverOzPrice,
  }
}
