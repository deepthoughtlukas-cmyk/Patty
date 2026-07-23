import type { Investment } from './parser'
import { investmentKey } from './userRules'

const STORAGE_KEY = 'patty-asset-splits'

export interface CoinSplit {
  id: string
  name: string
  denomination: string // e.g. "1 oz"
  coinCount: number
  depository: string
}

export interface AssetSplitConfig {
  assetKey: string
  totalOunces: number
  splits: CoinSplit[]
}

export function loadSplits(): AssetSplitConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is AssetSplitConfig => s && typeof s === 'object' && typeof s.assetKey === 'string')
  } catch {
    return []
  }
}

export function saveSplits(splits: AssetSplitConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(splits))
}

export function setSplitConfig(config: AssetSplitConfig): void {
  const splits = loadSplits()
  const idx = splits.findIndex(s => s.assetKey === config.assetKey)
  if (idx >= 0) {
    splits[idx] = config
  } else {
    splits.push(config)
  }
  saveSplits(splits)
}

export function deleteSplitConfig(assetKey: string): void {
  const splits = loadSplits().filter(s => s.assetKey !== assetKey)
  saveSplits(splits)
}

function parseDenomination(denom: string): number {
  try {
    const clean = denom.replace(/oz|unze|ounce/i, '').replace(',', '.').trim()
    if (clean.includes('/')) {
      const [num, den] = clean.split('/')
      return (parseFloat(num) || 0) / (parseFloat(den) || 1)
    }
    return parseFloat(clean) || 0
  } catch {
    return 0
  }
}

export function getSplitInvestmentKey(originalInv: Investment, splitId: string): string {
  const key = investmentKey(originalInv)
  return `${key}-split-${splitId}`
}

export function applySplits(investments: Investment[]): Investment[] {
  const configs = loadSplits()
  if (configs.length === 0) return investments

  const configMap = new Map(configs.map(c => [c.assetKey, c]))
  const result: Investment[] = []

  for (const inv of investments) {
    const config = configMap.get(investmentKey(inv))
    if (!config || config.splits.length === 0 || config.totalOunces <= 0) {
      result.push(inv)
      continue
    }

    let remainingQuantity = inv.quantity
    let remainingValue = inv.currentValue
    let remainingCost = inv.purchasePrice * inv.quantity

    for (const split of config.splits) {
      const denomWeight = parseDenomination(split.denomination)
      const splitOunces = split.coinCount * denomWeight
      const fraction = splitOunces / config.totalOunces

      const splitValue = inv.currentValue * fraction
      const splitCost = (inv.purchasePrice * inv.quantity) * fraction

      const splitInv: Investment = {
        ...inv,
        name: `${split.name} ${split.denomination}`,
        _originalName: inv._originalName || inv.name,
        customName: undefined,
        quantity: split.coinCount,
        currentValue: splitValue,
        purchasePrice: split.coinCount > 0 ? splitCost / split.coinCount : 0,
        isin: `${inv.isin ? inv.isin + '-' : ''}split-${split.id}`,
        _originalKey: investmentKey(inv),
      }

      // To ensure investmentKey(splitInv) maps exactly to getSplitInvestmentKey
      if (!inv.isin || inv.isin.toUpperCase() === 'N/A') {
         // If original didn't have ISIN, its key was its name.
         // But now the name changed!
         // We must forcefully inject the predictable key into the ISIN field, so that `validIsin()` picks it up.
         splitInv.isin = getSplitInvestmentKey(inv, split.id)
      } else {
         splitInv.isin = getSplitInvestmentKey(inv, split.id)
      }

      result.push(splitInv)

      remainingValue -= splitValue
      remainingCost -= splitCost
      remainingQuantity -= inv.quantity * fraction
    }

    if (remainingValue > 0.01) {
      const restKey = `${investmentKey(inv)}-rest`
      result.push({
        ...inv,
        name: `${inv.name} (Rest)`,
        _originalName: inv._originalName || inv.name,
        customName: undefined,
        quantity: remainingQuantity > 0 ? remainingQuantity : 1,
        currentValue: remainingValue,
        purchasePrice: remainingQuantity > 0 ? remainingCost / remainingQuantity : remainingCost,
        isin: restKey,
        _originalKey: investmentKey(inv),
      })
    }
  }

  return result
}
