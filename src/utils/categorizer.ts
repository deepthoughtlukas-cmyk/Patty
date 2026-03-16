import type { AssetCategory, Investment } from './parser'
import { applyRules } from './userRules'

export const TARGET_ALLOCATION: Record<AssetCategory, number> = {
  'Stocks': 0.45,
  'Bonds': 0.15,
  'Safe-Haven Gold': 0.15,
  'Performance Gold': 0.10,
  'Commodities': 0.10,
  'Bitcoin': 0.05,
}

export const CATEGORY_COLORS: Record<AssetCategory, string> = {
  'Stocks': '#60a5fa',
  'Bonds': '#818cf8',
  'Safe-Haven Gold': '#fcd34d',
  'Performance Gold': '#f59e0b',
  'Commodities': '#34d399',
  'Bitcoin': '#fb923c',
}

export const ALL_CATEGORIES: AssetCategory[] = [
  'Stocks',
  'Bonds',
  'Safe-Haven Gold',
  'Performance Gold',
  'Commodities',
  'Bitcoin',
]

// Default subcategories per main category
export const DEFAULT_SUBCATEGORIES: Record<AssetCategory, string[]> = {
  'Stocks': ['AI', 'Defence', 'Real Estate', 'General'],
  'Bonds': ['General'],
  'Safe-Haven Gold': ['General'],
  'Performance Gold': ['Goldminen', 'Silber', 'Silberminen', 'General'],
  'Commodities': ['Metals', 'Energy', 'Agribusiness', 'Livestock', 'General'],
  'Bitcoin': ['General'],
}

// Subcategory color shades
export const SUBCATEGORY_COLORS: Record<string, string> = {
  'AI': '#93c5fd', 'Defence': '#3b82f6', 'Real Estate': '#2563eb',
  'Metals': '#6ee7b7', 'Energy': '#10b981', 'Agribusiness': '#059669', 'Livestock': '#047857',
  'Goldminen': '#fbbf24', 'Silber': '#94a3b8', 'Silberminen': '#64748b',
  'General': '#6b7280',
}

const PRECIOUS_METALS_SECTOR = 'Edelmetalle & Mineralien'

// Keywords for main categories
const BITCOIN_NAME_KEYWORDS = ['bitcoin', 'btc', 'crypto', 'blockchain', 'strategy', 'microstrategy', 'mara', 'riot', 'hut 8', 'cipher mining', 'defi', 'dwave']
const BITCOIN_SECTOR_KEYWORDS = ['blockchain', 'kryptowähr']

const BOND_NAME_KEYWORDS = ['anleihe', 'bond', 'treasury', 'bund']
const BOND_TYPE_KEYWORDS = ['anleihe', 'bond']

const COMMODITY_SECTOR_KEYWORDS = [
  'roh-', 'bergbau', 'oil', 'erdöl', 'erdgas', 'energie', 'kupfer', 'lithium',
  'uran', 'chemik', 'nahrungsmittel', 'agrar',
]
const COMMODITY_NAME_KEYWORDS = ['copper', 'lithium', 'uranium', 'energy fuel', 'lynas', 'mtm critical', 'seplat', 'repsol', 'totalenergies']

const SAFE_GOLD_NAME_KEYWORDS = ['gold etf', 'physical gold', 'xetra-gold', 'euwax gold', 'gold etc']

// Subcategory keywords
const SUB_COMMODITY_METALS = ['copper', 'lithium', 'kupfer', 'mining', 'bergbau', 'roh-', 'mtm critical', 'lynas', 'rare earth']
const SUB_COMMODITY_ENERGY = ['oil', 'erdöl', 'erdgas', 'energy fuel', 'uran', 'seplat', 'repsol', 'totalenergies', 'energie', 'centrus']
const SUB_COMMODITY_AGRI = ['nahrungsmittel', 'agrar', 'cal-maine', 'jbs', 'cresud']
const SUB_COMMODITY_LIVESTOCK = ['livestock', 'vieh']

const SUB_STOCK_AI = ['palantir', 'nvidia', 'semiconductor', 'halbleiter', 'broadcom', 'asml', 'marvell', 'amd', 'advanced micro', 'qualcomm', 'micron', 'intel', 'arm holding', 'synopsys', 'crowdstrike', 'servicenow', 'oracle', 'tempus ai', 'innodata', 'd-wave', 'nebius', 'super micro', 'advantest', 'tdk', 'hua hong', 'sk hynix', 'suss micro', 'pva tepla']
const SUB_STOCK_DEFENCE = ['verteidigung', 'luftfahrt & verteidigung', 'bae system', 'rolls-royce', 'leonardo', 'rheinmetall', 'hensoldt', 'tkms', 'facc', 'textron', 'general dynamics', 'kratos', 'safran', 'kongsberg', 'qinetiq', 'droneshield', 'colt cz', 'steyr motor', 'renk']
const SUB_STOCK_REALESTATE = ['immobilien', 'realty', 'reit', 'capitaland', 'merlin properties', 're/max']

const SUB_PERFGOLD_SILBER = ['silber', 'silver']
const SUB_PERFGOLD_GOLDMINEN = ['gold miner', 'goldmine', 'barrick', 'newmont', 'agnico', 'kinross', 'franco-nevada', 'wheaton', 'gold fields', 'harmony gold', 'eldorado gold', 'alamos gold', 'b2gold', 'endeavour mining', 'centamin', 'equinox gold', 'torex gold']
const SUB_PERFGOLD_SILBERMINEN = ['silver mine', 'silbermine', 'first majestic', 'pan american', 'hecla', 'coeur mining', 'mag silver', 'silvercrest']

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase()
  return needles.some((n) => lower.includes(n))
}

export function autoCategory(inv: Investment): AssetCategory {
  const name = inv.name.toLowerCase()
  const sector = inv.sector.toLowerCase()
  const type = inv.type.toLowerCase()

  if (containsAny(type, BOND_TYPE_KEYWORDS) || containsAny(name, BOND_NAME_KEYWORDS)) {
    return 'Bonds'
  }
  if (containsAny(name, BITCOIN_NAME_KEYWORDS) || containsAny(sector, BITCOIN_SECTOR_KEYWORDS)) {
    return 'Bitcoin'
  }
  if (containsAny(name, SAFE_GOLD_NAME_KEYWORDS)) {
    return 'Safe-Haven Gold'
  }
  if (sector === PRECIOUS_METALS_SECTOR.toLowerCase()) {
    return 'Performance Gold'
  }
  if (
    containsAny(sector, COMMODITY_SECTOR_KEYWORDS) ||
    containsAny(name, COMMODITY_NAME_KEYWORDS)
  ) {
    return 'Commodities'
  }
  return 'Stocks'
}

export function autoSubcategory(inv: Investment): string {
  const name = inv.name.toLowerCase()
  const sector = inv.sector.toLowerCase()
  const combined = name + ' ' + sector

  if (inv.category === 'Commodities') {
    if (containsAny(combined, SUB_COMMODITY_ENERGY)) return 'Energy'
    if (containsAny(combined, SUB_COMMODITY_METALS)) return 'Metals'
    if (containsAny(combined, SUB_COMMODITY_AGRI)) return 'Agribusiness'
    if (containsAny(combined, SUB_COMMODITY_LIVESTOCK)) return 'Livestock'
  }

  if (inv.category === 'Stocks') {
    if (containsAny(combined, SUB_STOCK_DEFENCE)) return 'Defence'
    if (containsAny(combined, SUB_STOCK_AI)) return 'AI'
    if (containsAny(combined, SUB_STOCK_REALESTATE)) return 'Real Estate'
  }

  if (inv.category === 'Performance Gold') {
    if (containsAny(combined, SUB_PERFGOLD_SILBERMINEN)) return 'Silberminen'
    if (containsAny(combined, SUB_PERFGOLD_SILBER)) return 'Silber'
    if (containsAny(combined, SUB_PERFGOLD_GOLDMINEN)) return 'Goldminen'
    return 'Goldminen' // default for precious metals sector
  }

  return 'General'
}

export function categorize(investments: Investment[]): Investment[] {
  return investments.map((inv) => {
    const category = autoCategory(inv)
    const withCat = { ...inv, category }
    return { ...withCat, subcategory: autoSubcategory(withCat) }
  })
}

/** Auto-categorize and then apply user overrides from localStorage */
export function categorizeWithRules(investments: Investment[]): Investment[] {
  return applyRules(categorize(investments))
}

export interface AllocationSummary {
  category: AssetCategory
  value: number
  percentage: number
  targetPercentage: number
  deviation: number
  color: string
}

export function computeAllocation(investments: Investment[], targetWeights?: Record<AssetCategory, number>): AllocationSummary[] {
  const targets = targetWeights || TARGET_ALLOCATION
  const total = investments.reduce((sum, inv) => sum + inv.currentValue, 0)

  return ALL_CATEGORIES.map((cat) => {
    const value = investments
      .filter((inv) => inv.category === cat)
      .reduce((sum, inv) => sum + inv.currentValue, 0)
    const percentage = total > 0 ? value / total : 0
    const targetPercentage = targets[cat]
    return {
      category: cat,
      value,
      percentage,
      targetPercentage,
      deviation: percentage - targetPercentage,
      color: CATEGORY_COLORS[cat],
    }
  })
}

export interface SubAllocationSummary {
  subcategory: string
  value: number
  percentage: number
  targetPercentage: number
  deviation: number
  color: string
}

export interface SubWeight {
  name: string
  weight: number
}

/** Compute subcategory breakdown within a category */
export function computeSubAllocation(
  investments: Investment[],
  category: AssetCategory,
  subWeights?: SubWeight[]
): SubAllocationSummary[] {
  const catInvestments = investments.filter((inv) => inv.category === category && inv.currentValue > 0)
  const catTotal = catInvestments.reduce((sum, inv) => sum + inv.currentValue, 0)

  // Collect all unique subcategories
  const subNames = new Set<string>(catInvestments.map((inv) => inv.subcategory))
  subWeights?.forEach((sw) => subNames.add(sw.name))

  const weightMap = new Map<string, number>()
  subWeights?.forEach((sw) => weightMap.set(sw.name, sw.weight))

  return Array.from(subNames).sort().map((sub) => {
    const value = catInvestments
      .filter((inv) => inv.subcategory === sub)
      .reduce((sum, inv) => sum + inv.currentValue, 0)
    const percentage = catTotal > 0 ? value / catTotal : 0
    const targetPercentage = weightMap.get(sub) ?? 0
    return {
      subcategory: sub,
      value,
      percentage,
      targetPercentage,
      deviation: percentage - targetPercentage,
      color: SUBCATEGORY_COLORS[sub] || '#6b7280',
    }
  })
}
