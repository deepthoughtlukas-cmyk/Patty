const STORAGE_KEY = 'patty-depositories'
const LIST_STORAGE_KEY = 'patty-depository-list'

export type DepositoryMap = Record<string, string>

export const PREDEFINED_DEPOSITORIES = [
  'Flatex',
  'Bitpanda',
  '21 Bitcoin',
  'Gold Avenue',
  'Trade Republic',
  'Scalable Capital',
  'Comdirect',
  'ING',
  'Consorsbank',
  'Coinbase',
  'Kraken',
  'Binance',
  'Hardware Wallet',
]

export function loadDepositories(): DepositoryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function loadDepositoryList(): string[] {
  try {
    const raw = localStorage.getItem(LIST_STORAGE_KEY)
    if (!raw) return [...PREDEFINED_DEPOSITORIES]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(d => typeof d === 'string' && d.trim() !== '') : [...PREDEFINED_DEPOSITORIES]
  } catch {
    return [...PREDEFINED_DEPOSITORIES]
  }
}

export function saveDepositoryList(list: string[]): void {
  localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(list))
}

export function saveDepositories(depositories: DepositoryMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(depositories))
}

export function getDepository(assetKey: string): string {
  const map = loadDepositories()
  return map[assetKey] || ''
}

export function setDepository(assetKey: string, depositoryName: string): void {
  const map = loadDepositories()
  if (depositoryName) {
    map[assetKey] = depositoryName
  } else {
    delete map[assetKey]
  }
  saveDepositories(map)
}

export function bulkSetDepository(assetKeys: string[], depositoryName: string): void {
  const map = loadDepositories()
  for (const key of assetKeys) {
    if (depositoryName) {
      map[key] = depositoryName
    } else {
      delete map[key]
    }
  }
  saveDepositories(map)
}

export function clearDepositories(): void {
  localStorage.removeItem(STORAGE_KEY)
}
