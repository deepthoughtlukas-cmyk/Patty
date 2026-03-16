import type { AssetCategory } from './parser'
import type { SubWeight } from './categorizer'

const STORAGE_KEY = 'stockpicker-target-profiles'
const ACTIVE_KEY = 'stockpicker-active-profile'

export type TargetWeights = Record<AssetCategory, number>

export interface TargetProfile {
  id: string
  name: string
  weights: TargetWeights
  subWeights?: Record<string, SubWeight[]>
}

/** The original Incrementum 60/40 allocation */
export const DEFAULT_PROFILE: TargetProfile = {
  id: 'incrementum-60-40',
  name: 'Incrementum 60/40',
  weights: {
    'Stocks': 0.45,
    'Bonds': 0.15,
    'Safe-Haven Gold': 0.15,
    'Performance Gold': 0.10,
    'Commodities': 0.10,
    'Bitcoin': 0.05,
  },
  subWeights: {
    'Stocks': [
      { name: 'AI', weight: 0.30 },
      { name: 'Defence', weight: 0.25 },
      { name: 'Real Estate', weight: 0.10 },
      { name: 'General', weight: 0.35 },
    ],
    'Commodities': [
      { name: 'Metals', weight: 0.30 },
      { name: 'Energy', weight: 0.30 },
      { name: 'Agribusiness', weight: 0.25 },
      { name: 'Livestock', weight: 0.15 },
    ],
    'Performance Gold': [
      { name: 'Goldminen', weight: 0.50 },
      { name: 'Silber', weight: 0.20 },
      { name: 'Silberminen', weight: 0.20 },
      { name: 'General', weight: 0.10 },
    ],
  },
}

/** Load all saved profiles (always includes the default) */
export function loadProfiles(): TargetProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [DEFAULT_PROFILE]
    const parsed: TargetProfile[] = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [DEFAULT_PROFILE]
    const hasDefault = parsed.some((p) => p.id === DEFAULT_PROFILE.id)
    return hasDefault ? parsed : [DEFAULT_PROFILE, ...parsed]
  } catch {
    return [DEFAULT_PROFILE]
  }
}

function persistProfiles(profiles: TargetProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

/** Save (upsert) a profile */
export function saveProfile(profile: TargetProfile): void {
  const profiles = loadProfiles()
  const idx = profiles.findIndex((p) => p.id === profile.id)
  if (idx >= 0) {
    profiles[idx] = profile
  } else {
    profiles.push(profile)
  }
  persistProfiles(profiles)
}

/** Delete a custom profile (cannot delete the default) */
export function deleteProfile(id: string): boolean {
  if (id === DEFAULT_PROFILE.id) return false
  const profiles = loadProfiles().filter((p) => p.id !== id)
  persistProfiles(profiles)
  return true
}

/** Get the currently active profile ID */
export function getActiveProfileId(): string {
  return localStorage.getItem(ACTIVE_KEY) || DEFAULT_PROFILE.id
}

/** Set the active profile */
export function setActiveProfileId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

/** Get the active profile object */
export function getActiveProfile(): TargetProfile {
  const profiles = loadProfiles()
  const activeId = getActiveProfileId()
  return profiles.find((p) => p.id === activeId) || DEFAULT_PROFILE
}

/** Generate a unique ID for a new profile */
export function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
