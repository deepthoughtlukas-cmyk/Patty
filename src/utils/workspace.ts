import type { Investment } from './parser'
import type { UserRule } from './userRules'
import type { TargetProfile } from './targetProfiles'
import type { BrokerOverride } from './brokerAvailability'
import type { Dimension, DimensionTagEntry } from './dimensions'
import type { DepositoryMap } from './depositories'
import type { AssetSplitConfig } from './assetSplits'

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
  depositories?: DepositoryMap
  depositoryList?: string[]
  splits?: AssetSplitConfig[]
  excludedAssetKeys?: string[]
  excludedCategories?: string[]
  collapsedStates?: Record<string, boolean>
}

const KEYS = {
  INVESTMENTS: 'patty-investments',
  RULES: 'patty-user-rules',
  PROFILES: 'patty-target-profiles',
  ACTIVE_PROFILE: 'patty-active-profile',
  BROKER_OVERRIDES: 'patty-broker-overrides',
  DIMENSIONS: 'patty-dimensions',
  DIMENSION_TAGS: 'patty-dimension-tags',
  DEPOSITORIES: 'patty-depositories',
  DEPOSITORY_LIST: 'patty-depository-list',
  ASSET_SPLITS: 'patty-asset-splits',
  EXCLUDED_ASSET_KEYS: 'patty-dim-excluded-assets',
  EXCLUDED_CATEGORIES: 'patty-dim-excluded-categories',
  COLLAPSED_STATES: 'patty-collapsed-states',
}

function getJSON<T>(key: string, parseFallback: any = null): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : parseFallback
  } catch {
    return parseFallback
  }
}

import CryptoJS from 'crypto-js'

export function exportWorkspace(pin?: string): void {
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
    depositories: getJSON<DepositoryMap>(KEYS.DEPOSITORIES, {}),
    depositoryList: getJSON<string[]>(KEYS.DEPOSITORY_LIST, []),
    splits: getJSON<AssetSplitConfig[]>(KEYS.ASSET_SPLITS, []),
    excludedAssetKeys: getJSON<string[]>(KEYS.EXCLUDED_ASSET_KEYS, []),
    excludedCategories: getJSON<string[]>(KEYS.EXCLUDED_CATEGORIES, []),
    collapsedStates: getJSON<Record<string, boolean>>(KEYS.COLLAPSED_STATES, {}),
  }

  let content = JSON.stringify(data, null, 2)
  if (pin && pin.length === 6) {
    content = CryptoJS.AES.encrypt(content, pin).toString()
  }

  const blob = new Blob([content], { type: pin ? 'text/plain' : 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `patty-workspace-${data.timestamp.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importWorkspace(file: File, pin?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        let data: WorkspaceExport

        try {
          // Attempt to parse as plain JSON first (backwards compatibility)
          data = JSON.parse(text) as WorkspaceExport
        } catch (jsonErr) {
          // If JSON parsing fails, assume it's encrypted
          if (!pin || pin.length !== 6) {
            reject(new Error('PIN_REQUIRED'))
            return
          }
          try {
            const bytes = CryptoJS.AES.decrypt(text, pin)
            const decryptedData = bytes.toString(CryptoJS.enc.Utf8)
            if (!decryptedData) throw new Error('Invalid PIN')
            data = JSON.parse(decryptedData) as WorkspaceExport
          } catch (decErr) {
            reject(new Error('Falscher PIN oder ungültige/beschädigte Datei'))
            return
          }
        }

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

        if (data.depositories) {
          localStorage.setItem(KEYS.DEPOSITORIES, JSON.stringify(data.depositories))
        }

        if (data.depositoryList) {
          localStorage.setItem(KEYS.DEPOSITORY_LIST, JSON.stringify(data.depositoryList))
        }

        if (data.splits) {
          localStorage.setItem(KEYS.ASSET_SPLITS, JSON.stringify(data.splits))
        }

        if (data.excludedAssetKeys) {
          localStorage.setItem(KEYS.EXCLUDED_ASSET_KEYS, JSON.stringify(data.excludedAssetKeys))
        }

        if (data.excludedCategories) {
          localStorage.setItem(KEYS.EXCLUDED_CATEGORIES, JSON.stringify(data.excludedCategories))
        }

        if (data.collapsedStates) {
          localStorage.setItem(KEYS.COLLAPSED_STATES, JSON.stringify(data.collapsedStates))
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
