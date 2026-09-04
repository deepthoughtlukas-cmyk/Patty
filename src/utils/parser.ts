import Papa from 'papaparse'

export type AssetCategory =
  | 'Stocks'
  | 'Bonds'
  | 'Safe-Haven Gold'
  | 'Performance Gold'
  | 'Commodities'
  | 'Bitcoin'
  | 'Altcoins'

export interface RawRow {
  Name: string
  ISIN: string
  WKN: string
  Typ: string
  Anzahl: string
  Kaufpreis: string
  'Aktueller Kurs': string
  'Aktueller Wert': string
  Währung: string
  Wechselkurs: string
  Region: string
  Sektor: string
}

export interface Investment {
  name: string
  customName?: string
  _originalName?: string
  isin: string
  wkn: string
  type: string
  quantity: number
  purchasePrice: number
  currentPrice: number
  currentValue: number
  currency: string
  exchangeRate: number
  region: string
  sector: string
  category: AssetCategory
  subcategory: string
  _originalKey?: string
}

/** Parse a German-formatted number string (e.g. "1.234,56" or "254,519") */
function parseGermanNumber(raw: string): number {
  if (!raw || raw.trim() === '' || raw.trim() === 'N/A') return 0
  // Remove thousands separator (period) and replace decimal comma with period
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

/** Helper to safely look up column values with alternative names and case-insensitivity */
function getField(row: Record<string, string>, ...candidateKeys: string[]): string {
  if (!row) return ''
  // 1. Direct match
  for (const k of candidateKeys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim()
    }
  }
  // 2. Case-insensitive / trimmed match
  const lowerCandidates = candidateKeys.map((k) => k.toLowerCase().trim())
  for (const [key, val] of Object.entries(row)) {
    const cleanKey = key.replace(/^\uFEFF/, '').toLowerCase().trim()
    if (lowerCandidates.includes(cleanKey) && val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim()
    }
  }
  return ''
}

export function parseCSV(text: string): Investment[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header: string) => header.replace(/^\uFEFF/, '').trim(),
  })

  const rawInvestments = result.data
    .filter((row) => {
      const name = getField(row, 'Name', 'Wertpapierbezeichnung', 'Bezeichnung', 'Titel', 'Instrument', 'Produkt')
      return name !== ''
    })
    .map((row) => {
      const name = getField(row, 'Name', 'Wertpapierbezeichnung', 'Bezeichnung', 'Titel', 'Instrument', 'Produkt')
      const isin = getField(row, 'ISIN', 'Isin')
      const wkn = getField(row, 'WKN', 'Wkn')
      const type = getField(row, 'Typ', 'Type', 'Art', 'Asset-Typ', 'Wertpapierart')
      const quantity = parseGermanNumber(getField(row, 'Anzahl', 'Stücke', 'Stück', 'Menge', 'Bestand', 'Shares', 'Quantity'))
      const purchasePrice = parseGermanNumber(getField(row, 'Kaufpreis', 'Einstandspreis', 'Kaufkurs', 'Einstandskurs', 'Purchase Price', 'Cost Price'))
      const currentPrice = parseGermanNumber(getField(row, 'Aktueller Kurs', 'Kurs', 'Letzter Kurs', 'Preis', 'Current Price', 'Price'))
      let currentValue = parseGermanNumber(getField(row, 'Aktueller Wert', 'Gesamtwert', 'Marktwert', 'Kurswert', 'Wert in EUR', 'Wert (EUR)', 'Wert', 'Current Value', 'Market Value'))

      if (currentValue === 0 && quantity > 0 && currentPrice > 0) {
        currentValue = quantity * currentPrice
      }

      const currency = getField(row, 'Währung', 'Waehrung', 'Currency') || 'EUR'
      const exchangeRate = parseGermanNumber(getField(row, 'Wechselkurs', 'Devisenkurs', 'Exchange Rate')) || 1
      const region = getField(row, 'Region', 'Land', 'Country')
      const sector = getField(row, 'Sektor', 'Sector', 'Branche', 'Industry')

      return {
        name,
        _originalName: name,
        isin,
        wkn,
        type,
        quantity,
        purchasePrice,
        currentPrice,
        currentValue,
        currency,
        exchangeRate,
        region,
        sector,
        category: 'Stocks' as AssetCategory,
        subcategory: 'General',
      }
    })

  // Aggregate identical assets
  const aggregated = new Map<string, Investment>()
  
  for (const inv of rawInvestments) {
    // Treat N/A as missing ISIN to avoid grouping completely different assets that share N/A ISIN
    const validIsin = inv.isin && inv.isin.toUpperCase() !== 'N/A' ? inv.isin : null;
    const key = validIsin ? `${validIsin}` : `${inv.name.toLowerCase()}`;

    if (aggregated.has(key)) {
      const existing = aggregated.get(key)!
      const totalQuantity = existing.quantity + inv.quantity
      const totalCost = (existing.purchasePrice * existing.quantity) + (inv.purchasePrice * inv.quantity)
      
      aggregated.set(key, {
        ...existing,
        _originalName: existing._originalName || existing.name,
        quantity: totalQuantity,
        currentValue: existing.currentValue + inv.currentValue,
        // Calculate newly weighted average purchase price
        purchasePrice: totalQuantity > 0 ? totalCost / totalQuantity : existing.purchasePrice,
        // Prefer explicit ISIN over N/A if it appears in later rows
        isin: existing.isin.toUpperCase() === 'N/A' || !existing.isin ? inv.isin : existing.isin,
      })
    } else {
      aggregated.set(key, { ...inv })
    }
  }

  return Array.from(aggregated.values())
}
