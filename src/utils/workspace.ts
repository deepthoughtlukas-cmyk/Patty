import type { Investment } from './parser'
import type { UserRule } from './userRules'
import type { TargetProfile } from './targetProfiles'
import type { BrokerOverride } from './brokerAvailability'
import type { Dimension, DimensionTagEntry } from './dimensions'

export interface WorkspaceExport {
  version: 1
  timestamp: string
  investments: Investment[] | null
  rules: UserRule[]
  profiles: TargetProfile[]
  activeProfileId: string
  brokerOverrides: BrokerOverride[]
  dimensions?: Dimension[]
  dimensionTags?: DimensionTagEntry[]
}

const KEYS = {
  INVESTMENTS: 'patty-investments',
  RULES: 'patty-user-rules',
  PROFILES: 'patty-target-profiles',
  ACTIVE_PROFILE: 'patty-active-profile',
  BROKER_OVERRIDES: 'patty-broker-overrides',
  DIMENSIONS: 'patty-dimensions',
  DIMENSION_TAGS: 'patty-dimension-tags',
}

function getJSON<T>(key: string, parseFallback: any = null): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : parseFallback
  } catch {
    return parseFallback
  }
}

export function exportWorkspace(): void {
  const data: WorkspaceExport = {
    version: 1,
    timestamp: new Date().toISOString(),
    investments: getJSON<Investment[]>(KEYS.INVESTMENTS),
    rules: getJSON<UserRule[]>(KEYS.RULES, []),
    profiles: getJSON<TargetProfile[]>(KEYS.PROFILES, []),
    activeProfileId: localStorage.getItem(KEYS.ACTIVE_PROFILE) || '',
    brokerOverrides: getJSON<BrokerOverride[]>(KEYS.BROKER_OVERRIDES, []),
    dimensions: getJSON<Dimension[]>(KEYS.DIMENSIONS, []),
    dimensionTags: getJSON<DimensionTagEntry[]>(KEYS.DIMENSION_TAGS, []),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `patty-workspace-${data.timestamp.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importWorkspace(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const data = JSON.parse(text) as WorkspaceExport

        if (!data || data.version !== 1) {
          reject(new Error('Invalid workspace file version'))
          return
        }

        // Apply to localStorage
        if (data.investments) {
          localStorage.setItem(KEYS.INVESTMENTS, JSON.stringify(data.investments))
        } else {
          localStorage.removeItem(KEYS.INVESTMENTS)
        }

        if (data.rules) {
          localStorage.setItem(KEYS.RULES, JSON.stringify(data.rules))
        }

        if (data.profiles) {
          localStorage.setItem(KEYS.PROFILES, JSON.stringify(data.profiles))
        }

        if (data.activeProfileId) {
          localStorage.setItem(KEYS.ACTIVE_PROFILE, data.activeProfileId)
        }

        if (data.brokerOverrides) {
          localStorage.setItem(KEYS.BROKER_OVERRIDES, JSON.stringify(data.brokerOverrides))
        }

        if (data.dimensions) {
          localStorage.setItem(KEYS.DIMENSIONS, JSON.stringify(data.dimensions))
        }

        if (data.dimensionTags) {
          localStorage.setItem(KEYS.DIMENSION_TAGS, JSON.stringify(data.dimensionTags))
        }

        resolve()
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file, 'utf-8')
  })
}
