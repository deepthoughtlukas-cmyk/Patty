import Papa from 'papaparse'

export type AssetCategory =
  | 'Stocks'
  | 'Bonds'
  | 'Safe-Haven Gold'
  | 'Performance Gold'
  | 'Commodities'
  | 'Bitcoin'

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
}

/** Parse a German-formatted number string (e.g. "1.234,56" or "254,519") */
function parseGermanNumber(raw: string): number {
  if (!raw || raw.trim() === '' || raw.trim() === 'N/A') return 0
  // Remove thousands separator (period) and replace decimal comma with period
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

export function parseCSV(text: string): Investment[] {
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
  })

  const rawInvestments = result.data
    .filter((row) => row.Name && row.Name.trim() !== '')
    .map((row) => ({
      name: row.Name.trim(),
      isin: row.ISIN?.trim() ?? '',
      wkn: row.WKN?.trim() ?? '',
      type: row.Typ?.trim() ?? '',
      quantity: parseGermanNumber(row.Anzahl),
      purchasePrice: parseGermanNumber(row.Kaufpreis),
      currentPrice: parseGermanNumber(row['Aktueller Kurs']),
      currentValue: parseGermanNumber(row['Aktueller Wert']),
      currency: row.Währung?.trim() ?? 'EUR',
      exchangeRate: parseGermanNumber(row.Wechselkurs) || 1,
      region: row.Region?.trim() ?? '',
      sector: row.Sektor?.trim() ?? '',
      category: 'Stocks' as AssetCategory,
      subcategory: 'General',
    }))

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
