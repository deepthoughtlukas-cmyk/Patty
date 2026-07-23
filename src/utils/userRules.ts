import type { AssetCategory, Investment } from './parser'
import { loadDepositories, saveDepositories, loadDepositoryList, saveDepositoryList } from './depositories'
import { loadSplits, saveSplits, type AssetSplitConfig } from './assetSplits'

const STORAGE_KEY = 'patty-user-rules'

export interface UserRule {
  isin: string
  name: string
  customName?: string
  category: AssetCategory
  subcategory?: string
}

/** Load all saved user rules from localStorage */
export function loadRules(): UserRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is UserRule => r && typeof r === 'object' && typeof r.name === 'string')
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

/** Derive a unique key for an investment: real ISIN if available, otherwise original name or name */
export function investmentKey(inv: { isin: string; name: string; _originalName?: string; _originalKey?: string }): string {
  if (inv._originalKey) return inv._originalKey
  return validIsin(inv.isin) || inv._originalName || inv.name
}

/** Save (upsert) a single rule — keyed by valid ISIN, falls back to name */
export function saveRule(rule: UserRule): void {
  const rules = loadRules()
  const key = validIsin(rule.isin) || rule.name
  const idx = rules.findIndex((r) => (validIsin(r.isin) || r.name) === key)
  if (idx >= 0) {
    const existing = rules[idx]
    const updated: UserRule = { ...existing }
    if (rule.isin !== undefined) updated.isin = rule.isin
    if (rule.name !== undefined) updated.name = rule.name
    if (rule.category !== undefined) updated.category = rule.category
    if (rule.subcategory !== undefined) {
      updated.subcategory = rule.subcategory
    } else if (rule.category !== undefined && rule.category !== existing.category) {
      delete updated.subcategory
    }
    if (rule.customName !== undefined) {
      if (rule.customName.trim() === '') {
        delete updated.customName
      } else {
        updated.customName = rule.customName.trim()
      }
    }
    rules[idx] = updated
  } else {
    const newRule: UserRule = {
      isin: rule.isin,
      name: rule.name,
      category: rule.category
    }
    if (rule.subcategory) newRule.subcategory = rule.subcategory
    if (rule.customName && rule.customName.trim() !== '') {
      newRule.customName = rule.customName.trim()
    }
    rules.push(newRule)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}

/** Save or clear a custom name for an investment while preserving categories */
export function saveCustomName(inv: { isin: string; name: string; _originalName?: string; category: AssetCategory; subcategory?: string }, customName?: string): void {
  const rules = loadRules()
  const vi = validIsin(inv.isin)
  const lookupName = inv._originalName || inv.name
  const key = vi || lookupName
  const idx = rules.findIndex((r) => (validIsin(r.isin) || r.name) === key)

  const trimmed = customName ? customName.trim() : ''
  if (idx >= 0) {
    if (trimmed === '' || trimmed === lookupName) {
      delete rules[idx].customName
    } else {
      rules[idx].customName = trimmed
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } else if (trimmed !== '' && trimmed !== lookupName) {
    rules.push({
      isin: inv.isin,
      name: lookupName,
      customName: trimmed,
      category: inv.category,
      subcategory: inv.subcategory
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  }
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
  if (rules.length === 0) {
    return investments.map((inv) => ({
      ...inv,
      _originalName: inv._originalName || inv.name,
    }))
  }

  const byIsin = new Map<string, UserRule>()
  const byName = new Map<string, UserRule>()
  for (const r of rules) {
    const vi = validIsin(r.isin)
    if (vi) byIsin.set(vi, r)
    else byName.set(r.name, r)
  }

  return investments.map((inv) => {
    const originalName = inv._originalName || inv.name
    const vi = validIsin(inv.isin)
    const rule = (vi ? byIsin.get(vi) : undefined) ?? byName.get(originalName) ?? byName.get(inv.name)
    if (!rule) {
      return {
        ...inv,
        _originalName: originalName,
        name: originalName,
        customName: undefined,
      }
    }
    const updated: Investment = {
      ...inv,
      _originalName: originalName,
      category: rule.category || inv.category,
    }
    if (rule.subcategory) updated.subcategory = rule.subcategory
    if (rule.customName && rule.customName.trim() !== '' && rule.customName.trim() !== originalName) {
      updated.name = rule.customName.trim()
      updated.customName = rule.customName.trim()
    } else {
      updated.name = originalName
      delete updated.customName
    }
    return updated
  })
}

/** Check whether a specific investment has a user-override rule */
export function hasUserRule(inv: Investment): boolean {
  const rules = loadRules()
  const key = investmentKey(inv)
  return rules.some((r) => (validIsin(r.isin) || r.name) === key)
}

/** Export all rules and depositories as a JSON file download */
export function exportRulesToJSON(): void {
  const rules = loadRules()
  const depositories = loadDepositories()
  const depositoryList = loadDepositoryList()
  const splits = loadSplits()
  const exportData = {
    rules,
    depositories,
    depositoryList,
    splits
  }
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `patty-rules-${new Date().toISOString().slice(0, 10)}.json`
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
        const imported = JSON.parse(text)
        
        let rulesArray: UserRule[] = []
        if (Array.isArray(imported)) {
          // Legacy format: just an array of rules
          rulesArray = imported
        } else if (imported && typeof imported === 'object' && imported.rules) {
          // New format: { rules: [], depositories: {}, depositoryList: [] }
          rulesArray = imported.rules
          if (imported.depositories) {
            const currentDeps = loadDepositories()
            saveDepositories({ ...currentDeps, ...imported.depositories })
          }
          if (imported.depositoryList) {
            const currentList = new Set(loadDepositoryList())
            imported.depositoryList.forEach((d: string) => currentList.add(d))
            saveDepositoryList(Array.from(currentList))
          }
          if (imported.splits) {
            // Merge or overwrite? Let's overwrite for simplicity or merge by assetKey
            const existingSplits = new Map(loadSplits().map(s => [s.assetKey, s]))
            imported.splits.forEach((s: AssetSplitConfig) => existingSplits.set(s.assetKey, s))
            saveSplits(Array.from(existingSplits.values()))
          }
        } else {
          reject(new Error('Invalid format: expected an array of rules or a combined export object'))
          return
        }

        let count = 0
        for (const rule of rulesArray) {
          if ((rule.category || rule.customName) && (rule.isin || rule.name)) {
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
