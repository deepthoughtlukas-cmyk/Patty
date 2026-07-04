import type { Investment } from './parser'
import { investmentKey } from './userRules'

// ── Types ────────────────────────────────────────────────────────────────

export interface Dimension {
  id: string
  name: string
  tags: string[]
  /** Accent color for charts */
  color: string
  /** If true, auto-tagging is attempted from CSV region field */
  autoTagFromRegion?: boolean
}

export interface DimensionTagEntry {
  dimensionId: string
  assetKey: string
  tag: string
  /** True when set by auto-tagging (can be overridden) */
  auto?: boolean
}

export interface DimensionAllocationItem {
  tag: string
  value: number
  percentage: number
  color: string
  assetCount: number
}

// ── Storage Keys ─────────────────────────────────────────────────────────

const DIMENSIONS_KEY = 'patty-dimensions'
const TAGS_KEY = 'patty-dimension-tags'

// ── Region Mapping ───────────────────────────────────────────────────────

/** Map CSV Region values to geography tags */
const REGION_TO_GEO: Record<string, string> = {
  'vereinigte staaten (usa)': 'Nordamerika',
  'kanada': 'Nordamerika',
  'deutschland': 'Europa',
  'frankreich': 'Europa',
  'niederlande (holland)': 'Europa',
  'italien': 'Europa',
  'spanien': 'Europa',
  'vereinigtes königreich (england)': 'Europa',
  'schweiz': 'Europa',
  'österreich': 'Europa',
  'dänemark': 'Europa',
  'finnland': 'Europa',
  'norwegen': 'Europa',
  'schweden': 'Europa',
  'tschechien (tschechische republik)': 'Europa',
  'griechenland': 'Europa',
  'zypern': 'Europa',
  'japan': 'Asien-Pazifik',
  'singapur': 'Asien-Pazifik',
  'hongkong': 'Asien-Pazifik',
  'korea, republik (süd korea)': 'Asien-Pazifik',
  'australien': 'Asien-Pazifik',
  'china': 'Asien-Pazifik',
  'brasilien': 'Lateinamerika',
  'argentinien': 'Lateinamerika',
  'südafrika': 'Afrika',
  'nigeria': 'Afrika',
  'global': 'Global',
}

/** Map CSV Region values to market type tags */
const REGION_TO_MARKET: Record<string, string> = {
  'vereinigte staaten (usa)': 'Industrieländer',
  'kanada': 'Industrieländer',
  'deutschland': 'Industrieländer',
  'frankreich': 'Industrieländer',
  'niederlande (holland)': 'Industrieländer',
  'italien': 'Industrieländer',
  'spanien': 'Industrieländer',
  'vereinigtes königreich (england)': 'Industrieländer',
  'schweiz': 'Industrieländer',
  'österreich': 'Industrieländer',
  'dänemark': 'Industrieländer',
  'finnland': 'Industrieländer',
  'norwegen': 'Industrieländer',
  'schweden': 'Industrieländer',
  'japan': 'Industrieländer',
  'australien': 'Industrieländer',
  'singapur': 'Industrieländer',
  'hongkong': 'Industrieländer',
  'korea, republik (süd korea)': 'Industrieländer',
  'tschechien (tschechische republik)': 'Industrieländer',
  'griechenland': 'Industrieländer',
  'zypern': 'Industrieländer',
  'china': 'Schwellenländer',
  'brasilien': 'Schwellenländer',
  'argentinien': 'Schwellenländer',
  'südafrika': 'Schwellenländer',
  'nigeria': 'Schwellenländer',
}

// ── Default Dimensions ───────────────────────────────────────────────────

const DEFAULT_GEO_DIMENSION: Dimension = {
  id: 'geo',
  name: 'Geographie',
  tags: ['Nordamerika', 'Europa', 'Asien-Pazifik', 'Lateinamerika', 'Afrika', 'Global'],
  color: '#60a5fa',
  autoTagFromRegion: true,
}

const DEFAULT_MARKET_DIMENSION: Dimension = {
  id: 'market-type',
  name: 'Markttyp',
  tags: ['Industrieländer', 'Schwellenländer'],
  color: '#34d399',
  autoTagFromRegion: true,
}

export const DEFAULT_DIMENSIONS: Dimension[] = [
  DEFAULT_GEO_DIMENSION,
  DEFAULT_MARKET_DIMENSION,
]

// ── Tag Colors ───────────────────────────────────────────────────────────

/** Predefined palette for dimension tags */
const TAG_PALETTE = [
  '#60a5fa', '#818cf8', '#a78bfa', '#c084fc',
  '#f472b6', '#fb923c', '#fbbf24', '#fcd34d',
  '#34d399', '#2dd4bf', '#22d3ee', '#38bdf8',
  '#a3e635', '#4ade80', '#f87171', '#e879f9',
]

/** Get a color for a tag based on its index within a dimension */
export function getTagColor(dimension: Dimension, tag: string): string {
  const idx = dimension.tags.indexOf(tag)
  if (idx >= 0) return TAG_PALETTE[idx % TAG_PALETTE.length]
  return '#8b90a0'
}

// ── CRUD: Dimensions ─────────────────────────────────────────────────────

export function loadDimensions(): Dimension[] {
  try {
    const raw = localStorage.getItem(DIMENSIONS_KEY)
    if (!raw) return [...DEFAULT_DIMENSIONS]
    const parsed: Dimension[] = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_DIMENSIONS]
    return parsed.filter((d): d is Dimension => d && typeof d === 'object' && typeof d.id === 'string' && typeof d.name === 'string')
  } catch {
    return [...DEFAULT_DIMENSIONS]
  }
}

export function saveDimensions(dimensions: Dimension[]): void {
  localStorage.setItem(DIMENSIONS_KEY, JSON.stringify(dimensions))
}

export function saveDimension(dimension: Dimension): void {
  const dims = loadDimensions()
  const idx = dims.findIndex((d) => d.id === dimension.id)
  if (idx >= 0) {
    dims[idx] = dimension
  } else {
    dims.push(dimension)
  }
  saveDimensions(dims)
}

export function deleteDimension(id: string): void {
  const dims = loadDimensions().filter((d) => d.id !== id)
  saveDimensions(dims)
  // Also remove all tags for this dimension
  const tags = loadDimensionTags().filter((t) => t.dimensionId !== id)
  saveDimensionTags(tags)
}

export function generateDimensionId(): string {
  return `dim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── CRUD: Tags ───────────────────────────────────────────────────────────

export function loadDimensionTags(): DimensionTagEntry[] {
  try {
    const raw = localStorage.getItem(TAGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is DimensionTagEntry => t && typeof t === 'object' && typeof t.dimensionId === 'string' && typeof t.assetKey === 'string')
  } catch {
    return []
  }
}

export function saveDimensionTags(tags: DimensionTagEntry[]): void {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags))
}

/** Set a tag for a specific asset in a specific dimension */
export function setDimensionTag(dimensionId: string, assetKey: string, tag: string, auto = false): void {
  const tags = loadDimensionTags()
  const idx = tags.findIndex((t) => t.dimensionId === dimensionId && t.assetKey === assetKey)
  if (idx >= 0) {
    tags[idx] = { dimensionId, assetKey, tag, auto }
  } else {
    tags.push({ dimensionId, assetKey, tag, auto })
  }
  saveDimensionTags(tags)
}

/** Remove a tag for a specific asset in a specific dimension */
export function removeDimensionTag(dimensionId: string, assetKey: string): void {
  const tags = loadDimensionTags().filter(
    (t) => !(t.dimensionId === dimensionId && t.assetKey === assetKey)
  )
  saveDimensionTags(tags)
}

/** Get the tag for a specific asset in a specific dimension */
export function getDimensionTag(dimensionId: string, assetKey: string): DimensionTagEntry | undefined {
  return loadDimensionTags().find(
    (t) => t.dimensionId === dimensionId && t.assetKey === assetKey
  )
}

// ── Auto-Tagging ─────────────────────────────────────────────────────────

/** Auto-tag investments based on their Region field for a given dimension */
export function autoTagInvestments(
  investments: Investment[],
  dimension: Dimension
): DimensionTagEntry[] {
  if (!dimension.autoTagFromRegion) return []

  const existingTags = loadDimensionTags()
  const newTags: DimensionTagEntry[] = []

  // Determine which mapping to use
  const mapping = dimension.id === 'geo' ? REGION_TO_GEO
    : dimension.id === 'market-type' ? REGION_TO_MARKET
    : REGION_TO_GEO // fallback for custom dimensions with autoTagFromRegion

  for (const inv of investments) {
    const key = investmentKey(inv)
    const region = inv.region.toLowerCase().trim()

    // Skip if already has a manual tag (non-auto)
    const existing = existingTags.find(
      (t) => t.dimensionId === dimension.id && t.assetKey === key
    )
    if (existing && !existing.auto) continue

    const tag = mapping[region]
    if (tag && dimension.tags.includes(tag)) {
      newTags.push({ dimensionId: dimension.id, assetKey: key, tag, auto: true })
    }
  }

  return newTags
}

/** Run auto-tagging for all auto-tag dimensions and persist results */
export function runAutoTagging(investments: Investment[]): void {
  const dimensions = loadDimensions()
  const existingTags = loadDimensionTags()

  // Remove old auto-tags, keep manual ones
  const manualTags = existingTags.filter((t) => !t.auto)

  const allAutoTags: DimensionTagEntry[] = []
  for (const dim of dimensions) {
    if (dim.autoTagFromRegion) {
      const auto = autoTagInvestments(investments, dim)
      allAutoTags.push(...auto)
    }
  }

  // Merge: manual tags take precedence
  const manualKeys = new Set(manualTags.map((t) => `${t.dimensionId}::${t.assetKey}`))
  const merged = [
    ...manualTags,
    ...allAutoTags.filter((t) => !manualKeys.has(`${t.dimensionId}::${t.assetKey}`)),
  ]

  saveDimensionTags(merged)
}

// ── Allocation Computation ───────────────────────────────────────────────

/** Compute allocation breakdown for a dimension (Ist-Analyse only) */
export function computeDimensionAllocation(
  investments: Investment[],
  dimension: Dimension
): DimensionAllocationItem[] {
  const tags = loadDimensionTags().filter((t) => t.dimensionId === dimension.id)
  const tagMap = new Map<string, string>()
  for (const t of tags) {
    tagMap.set(t.assetKey, t.tag)
  }

  const activeInvestments = investments.filter((inv) => inv.currentValue > 0)
  const total = activeInvestments.reduce((sum, inv) => sum + inv.currentValue, 0)

  // Build tag buckets
  const buckets = new Map<string, { value: number; count: number }>()

  // Initialize all dimension tags
  for (const tag of dimension.tags) {
    buckets.set(tag, { value: 0, count: 0 })
  }
  // Add "Nicht zugeordnet" bucket
  buckets.set('Nicht zugeordnet', { value: 0, count: 0 })

  for (const inv of activeInvestments) {
    const key = investmentKey(inv)
    const tag = tagMap.get(key) || 'Nicht zugeordnet'
    const bucket = buckets.get(tag) || { value: 0, count: 0 }
    bucket.value += inv.currentValue
    bucket.count++
    buckets.set(tag, bucket)
  }

  const result: DimensionAllocationItem[] = []
  for (const [tag, data] of buckets) {
    if (data.value === 0 && data.count === 0) continue // skip empty tags
    result.push({
      tag,
      value: data.value,
      percentage: total > 0 ? data.value / total : 0,
      color: tag === 'Nicht zugeordnet' ? '#555' : getTagColor(dimension, tag),
      assetCount: data.count,
    })
  }

  // Sort by value descending
  return result.sort((a, b) => b.value - a.value)
}

/** Build a lookup: assetKey → tag for a given dimension */
export function buildDimensionTagMap(dimensionId: string): Map<string, string> {
  const tags = loadDimensionTags().filter((t) => t.dimensionId === dimensionId)
  const map = new Map<string, string>()
  for (const t of tags) {
    map.set(t.assetKey, t.tag)
  }
  return map
}

// ── Export / Import ──────────────────────────────────────────────────────

export interface DimensionExport {
  version: 1
  timestamp: string
  dimension: Dimension
  tagEntries: DimensionTagEntry[]
}

/** Export a single dimension (definition + all tag assignments) as JSON download */
export function exportDimension(dimensionId: string): void {
  const dims = loadDimensions()
  const dim = dims.find((d) => d.id === dimensionId)
  if (!dim) return

  const tags = loadDimensionTags().filter((t) => t.dimensionId === dimensionId)

  const data: DimensionExport = {
    version: 1,
    timestamp: new Date().toISOString(),
    dimension: dim,
    tagEntries: tags,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `patty-dimension-${dim.name.toLowerCase().replace(/\s+/g, '-')}-${data.timestamp.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Import a dimension from a JSON file. Upserts the dimension and merges tag entries.
 *  Returns the imported dimension's ID on success. */
export function importDimension(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const data: DimensionExport = JSON.parse(text)

        if (!data || data.version !== 1 || !data.dimension) {
          reject(new Error('Ungültiges Dimensions-Format'))
          return
        }

        // Upsert the dimension
        saveDimension(data.dimension)

        // Merge tag entries: imported tags override existing for same dimension+asset
        if (data.tagEntries && Array.isArray(data.tagEntries)) {
          const existing = loadDimensionTags()
          const importedKeys = new Set(
            data.tagEntries.map((t) => `${t.dimensionId}::${t.assetKey}`)
          )
          // Keep existing tags that are NOT for this dimension's imported assets
          const kept = existing.filter(
            (t) => !importedKeys.has(`${t.dimensionId}::${t.assetKey}`)
          )
          saveDimensionTags([...kept, ...data.tagEntries])
        }

        resolve(data.dimension.id)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.readAsText(file, 'utf-8')
  })
}
