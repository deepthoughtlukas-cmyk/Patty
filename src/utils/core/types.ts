import type { Investment } from '../parser'

/** Grobe Regionen-Buckets, auf denen die Whitepaper-Soll-Quoten definiert sind */
export type RegionKey = 'US' | 'CA' | 'EU' | 'JP' | 'PAC' | 'EM'

export type FactorKey = 'quality' | 'value' | 'momentum' | 'lowVol' | 'dividend' | 'size'

/**
 * Rolle eines Core-Bausteins laut Whitepaper:
 * - market: meinungsfreier Core (Markt-/Regionen-/Size-Baustein)
 * - factor: "Core mit Meinung" -> zählt gegen das 20 %-Faktor-Budget (Seite 11)
 * - cashflow: Dividenden-Strategie, laut Whitepaper (Ziel II, Seite 14) eher ein Satellit
 */
export type CoreRole = 'market' | 'factor' | 'cashflow'

export type ProfileConfidence = 'whitepaper' | 'estimated' | 'custom'

export interface SizeSplit {
  large: number
  mid: number
  small: number
}

export interface CoreProfile {
  id: string
  name: string
  isins: string[]
  /** OR-Liste von AND-Gruppen: Name muss alle Tokens einer Gruppe enthalten */
  matchers: string[][]
  /** Tokens, die einen Treffer ausschließen */
  excludes?: string[]
  /** Look-Through Länder in Prozent (werden beim Laden auf 100 % normiert) */
  countries: Record<string, number>
  size: SizeSplit
  /** Faktor-Tilts: -2 (stark negativ) bis +2 (stark positiv) relativ zum Gesamtmarkt */
  factors: Partial<Record<FactorKey, number>>
  role: CoreRole
  /** Wenn true: gesamte Währungsexposure = EUR */
  hedgedToEur?: boolean
  ter?: number
  asOf: string
  confidence: ProfileConfidence
  note?: string
}

export interface CorePosition {
  key: string
  name: string
  value: number
  profile: CoreProfile | null
  /** Rolle nach Override durch den Anwender */
  role: CoreRole
  /** True für simulierte, nicht gehaltene Bausteine */
  isCandidate?: boolean
}

export interface CoreExposure {
  total: number
  covered: number
  coverage: number
  countries: Record<string, number>
  regions: Record<RegionKey, number>
  currencies: Record<string, number>
  size: SizeSplit
  factors: Record<FactorKey, number>
  /** Anteil je Rolle bezogen auf den Gesamtwert (inkl. nicht abgedeckter Positionen) */
  roleShares: Record<CoreRole, number>
  ter: number
}

export interface TargetGroup {
  id: string
  label: string
  regions: RegionKey[]
  target: number
}

export interface TargetStage {
  id: 'stage2' | 'stage3'
  label: string
  description: string
  groups: TargetGroup[]
  model: Array<{ profileId: string; weight: number }>
}

export interface CoreSparplanConfig {
  monthlyBudget: number
  selectedKeys?: string[]
  customAmounts?: Record<string, number>
  projectionHorizon?: number
  maxPositions?: number
  includeCandidates?: boolean
}

export type { Investment }
