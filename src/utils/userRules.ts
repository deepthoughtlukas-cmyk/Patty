import type { AssetCategory, Investment } from './parser'

const STORAGE_KEY = 'stockpicker-user-rules'

export interface UserRule {
  isin: string
  name: string
  category: AssetCategory
  subcategory?: string
}

/** Load all saved user rules from localStorage */
export function loadRules(): UserRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Returns the ISIN if it's a real one, or empty string for N/A / missing */
export function validIsin(isin: string | undefined | null): string {
  if (!isin) return ''
  const trimmed = isin.trim()
  if (trimmed === '' || trimmed.toUpperCase() === 'N/A') return ''
  return trimmed
}

/** Derive a unique key for an investment: real ISIN if available, otherwise name */
export function investmentKey(inv: { isin: string; name: string }): string {
  return validIsin(inv.isin) || inv.name
}

/** Save (upsert) a single rule — keyed by valid ISIN, falls back to name */
export function saveRule(rule: UserRule): void {
  const rules = loadRules()
  const key = validIsin(rule.isin) || rule.name
  const idx = rules.findIndex((r) => (validIsin(r.isin) || r.name) === key)
  if (idx >= 0) {
    rules[idx] = rule
  } else {
    rules.push(rule)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}

/** Delete a rule by its key (valid ISIN or name) */
export function deleteRule(key: string): void {
  const rules = loadRules().filter((r) => (validIsin(r.isin) || r.name) !== key)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}

/** Clear all user rules */
export function clearRules(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Apply saved user rules to investments (valid ISIN match, fallback name match) */
export function applyRules(investments: Investment[]): Investment[] {
  const rules = loadRules()
  if (rules.length === 0) return investments

  const byIsin = new Map<string, UserRule>()
  const byName = new Map<string, UserRule>()
  for (const r of rules) {
    const vi = validIsin(r.isin)
    if (vi) byIsin.set(vi, r)
    else byName.set(r.name, r)
  }

  return investments.map((inv) => {
    const vi = validIsin(inv.isin)
    const rule = (vi ? byIsin.get(vi) : undefined) ?? byName.get(inv.name)
    if (!rule) return inv
    const updated = { ...inv, category: rule.category }
    if (rule.subcategory) updated.subcategory = rule.subcategory
    return updated
  })
}

/** Check whether a specific investment has a user-override rule */
export function hasUserRule(inv: Investment): boolean {
  const rules = loadRules()
  const key = investmentKey(inv)
  return rules.some((r) => (validIsin(r.isin) || r.name) === key)
}

/** Export all rules as a JSON file download */
export function exportRulesToJSON(): void {
  const rules = loadRules()
  const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stockpicker-rules-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Import rules from a JSON file (merges with existing, upserts by key) */
export function importRulesFromFile(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const imported: UserRule[] = JSON.parse(text)
        if (!Array.isArray(imported)) {
          reject(new Error('Invalid format: expected an array of rules'))
          return
        }
        let count = 0
        for (const rule of imported) {
          if (rule.category && (rule.isin || rule.name)) {
            saveRule(rule)
            count++
          }
        }
        resolve(count)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file, 'utf-8')
  })
}
