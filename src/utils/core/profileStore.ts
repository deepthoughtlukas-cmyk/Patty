import { BUILTIN_PROFILES } from './builtinProfiles'
import type { CoreProfile, CoreRole, ProfileConfidence } from './types'

export const CORE_STORAGE_KEYS = {
  CUSTOM_PROFILES: 'patty-core-custom-profiles',
  ROLES: 'patty-core-roles',
  TARGET: 'patty-core-target',
  REMOTE_URL: 'patty-core-remote-url',
  SPARPLAN_CONFIG: 'patty-core-sparplan-config',
} as const

/**
 * Schnittstelle für Datenquellen von ETF-Exposure-Profilen.
 * Implementierungen: eingebauter Katalog, Anwender-Import (JSON), Remote-JSON (URL).
 */
export interface EtfDataProvider {
  id: string
  name: string
  getProfiles(): Promise<CoreProfile[]>
}

export const builtinProvider: EtfDataProvider = {
  id: 'builtin',
  name: 'Eingebauter Katalog',
  getProfiles: async () => BUILTIN_PROFILES,
}

const CONFIDENCES: ProfileConfidence[] = ['whitepaper', 'estimated', 'custom']

/** Validiert unbekannte JSON-Daten und liefert nur gültige Profile zurück */
export function validateProfiles(raw: unknown): CoreProfile[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { profiles?: unknown }).profiles)
      ? (raw as { profiles: unknown[] }).profiles
      : []
  const result: CoreProfile[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const p = item as Partial<CoreProfile>
    if (typeof p.id !== 'string' || typeof p.name !== 'string') continue
    if (!p.countries || typeof p.countries !== 'object') continue
    const countrySum = Object.values(p.countries).reduce((s, v) => s + (typeof v === 'number' && v > 0 ? v : 0), 0)
    if (countrySum <= 0) continue
    const size = p.size && typeof p.size === 'object' ? p.size : { large: 100, mid: 0, small: 0 }
    result.push({
      id: p.id,
      name: p.name,
      isins: Array.isArray(p.isins) ? p.isins.filter((i): i is string => typeof i === 'string') : [],
      matchers: Array.isArray(p.matchers) ? p.matchers.filter((g): g is string[] => Array.isArray(g)) : [],
      excludes: Array.isArray(p.excludes) ? p.excludes : undefined,
      countries: p.countries as Record<string, number>,
      size: { large: Number(size.large) || 0, mid: Number(size.mid) || 0, small: Number(size.small) || 0 },
      factors: p.factors && typeof p.factors === 'object' ? p.factors : {},
      role:
        p.role === 'factor' || p.role === 'cashflow' || p.role === 'satellite'
          ? p.role
          : 'market',
      hedgedToEur: !!p.hedgedToEur,
      ter: typeof p.ter === 'number' ? p.ter : undefined,
      asOf: typeof p.asOf === 'string' ? p.asOf : '',
      confidence: CONFIDENCES.includes(p.confidence as ProfileConfidence) ? (p.confidence as ProfileConfidence) : 'custom',
      maxCoreWeight:
        typeof p.maxCoreWeight === 'number' && p.maxCoreWeight > 0 && p.maxCoreWeight <= 1
          ? p.maxCoreWeight
          : undefined,
      note: typeof p.note === 'string' ? p.note : undefined,
    })
  }
  return result
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function loadCustomProfiles(): CoreProfile[] {
  return validateProfiles(readJSON<unknown>(CORE_STORAGE_KEYS.CUSTOM_PROFILES, []))
}

export function saveCustomProfiles(profiles: CoreProfile[]): void {
  localStorage.setItem(CORE_STORAGE_KEYS.CUSTOM_PROFILES, JSON.stringify(profiles))
}

/** Fügt Profile hinzu bzw. überschreibt gleiche IDs (Anwender-Daten haben Vorrang vor dem Katalog) */
export function upsertCustomProfiles(incoming: CoreProfile[]): number {
  const current = loadCustomProfiles()
  const map = new Map(current.map((p) => [p.id, p]))
  for (const p of incoming) map.set(p.id, { ...p, confidence: p.confidence === 'whitepaper' ? 'custom' : p.confidence })
  saveCustomProfiles(Array.from(map.values()))
  return incoming.length
}

export function clearCustomProfiles(): void {
  localStorage.removeItem(CORE_STORAGE_KEYS.CUSTOM_PROFILES)
}

/** Katalog + Anwender-Profile; Anwender-Profile überschreiben gleiche IDs */
export function getAllProfiles(): CoreProfile[] {
  const map = new Map(BUILTIN_PROFILES.map((p) => [p.id, p]))
  for (const p of loadCustomProfiles()) map.set(p.id, p)
  return Array.from(map.values())
}

export class RemoteJsonProvider implements EtfDataProvider {
  id = 'remote-json'
  name: string
  constructor(private url: string) {
    this.name = `Remote JSON (${url})`
  }
  async getProfiles(): Promise<CoreProfile[]> {
    const res = await fetch(this.url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const profiles = validateProfiles(await res.json())
    if (profiles.length === 0) throw new Error('Keine gültigen Profile in der Antwort')
    return profiles
  }
}

export function getRemoteUrl(): string {
  return localStorage.getItem(CORE_STORAGE_KEYS.REMOTE_URL) || ''
}

export function setRemoteUrl(url: string): void {
  localStorage.setItem(CORE_STORAGE_KEYS.REMOTE_URL, url)
}

// ── Rollen-Overrides (je Profil-ID) ──────────────────────────────────────

export function loadRoleOverrides(): Record<string, CoreRole> {
  return readJSON<Record<string, CoreRole>>(CORE_STORAGE_KEYS.ROLES, {})
}

export function setRoleOverride(profileId: string, role: CoreRole | null): void {
  const current = loadRoleOverrides()
  if (role === null) delete current[profileId]
  else current[profileId] = role
  localStorage.setItem(CORE_STORAGE_KEYS.ROLES, JSON.stringify(current))
}

// ── Gewähltes Soll-Modell ────────────────────────────────────────────────

export function loadTargetStageId(): 'stage2' | 'stage3' {
  return localStorage.getItem(CORE_STORAGE_KEYS.TARGET) === 'stage2' ? 'stage2' : 'stage3'
}

export function saveTargetStageId(id: 'stage2' | 'stage3'): void {
  localStorage.setItem(CORE_STORAGE_KEYS.TARGET, id)
}

// ── Core Sparplan Konfiguration ─────────────────────────────────────────

export function loadCoreSparplanConfig(): import('./types').CoreSparplanConfig | null {
  return readJSON<import('./types').CoreSparplanConfig | null>(CORE_STORAGE_KEYS.SPARPLAN_CONFIG, null)
}

export function saveCoreSparplanConfig(config: import('./types').CoreSparplanConfig): void {
  localStorage.setItem(CORE_STORAGE_KEYS.SPARPLAN_CONFIG, JSON.stringify(config))
}
