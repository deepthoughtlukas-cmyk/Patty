import type { TargetStage } from './types'

/** Toleranzband (Prozentpunkte) für die Ampel je Regionen-Gruppe – Annahme, nicht im Whitepaper definiert */
export const REGION_TOLERANCE = 0.03
/** Faktor-Budget laut Whitepaper Seite 11: "maximal etwa 20 Prozent des Cores" */
export const FACTOR_BUDGET_CAP = 0.2

/**
 * Soll-Modelle aus dem Leitfaden "Core-Satellite-Strategie".
 * Stufe 1 (Ein-ETF-Lösung) wird bewusst nicht abgebildet.
 */
export const TARGET_STAGES: TargetStage[] = [
  {
    id: 'stage2',
    label: 'Stufe 2: Standard-Baukasten',
    description: '40 % USA | 40 % Welt ex USA | 20 % Schwellenländer',
    groups: [
      { id: 'us', label: 'USA', regions: ['US'], target: 0.4 },
      { id: 'dm-ex-us', label: 'Welt ex USA', regions: ['CA', 'EU', 'JP', 'PAC'], target: 0.4 },
      { id: 'em', label: 'Schwellenländer', regions: ['EM'], target: 0.2 },
    ],
    model: [
      { profileId: 'wp-xtrackers-msci-usa', weight: 0.4 },
      { profileId: 'wp-xtrackers-world-ex-usa', weight: 0.4 },
      { profileId: 'wp-amundi-prime-em', weight: 0.2 },
    ],
  },
  {
    id: 'stage3',
    label: 'Stufe 3: Regionaler Baukasten',
    description: '46 % Nordamerika | 23 % Europa | 9 % Japan | 22 % Pazifik & Schwellenländer (inkl. Small Caps)',
    groups: [
      { id: 'us', label: 'USA', regions: ['US'], target: 0.42 },
      { id: 'ca', label: 'Kanada', regions: ['CA'], target: 0.04 },
      { id: 'eu', label: 'Europa', regions: ['EU'], target: 0.23 },
      { id: 'jp', label: 'Japan', regions: ['JP'], target: 0.09 },
      { id: 'pac', label: 'Pazifik ex Japan', regions: ['PAC'], target: 0.06 },
      { id: 'em', label: 'Schwellenländer', regions: ['EM'], target: 0.16 },
    ],
    model: [
      { profileId: 'wp-spdr-sp500', weight: 0.36 },
      { profileId: 'wp-xtrackers-russell-2000', weight: 0.06 },
      { profileId: 'wp-ubs-msci-canada', weight: 0.04 },
      { profileId: 'wp-ubs-msci-europe', weight: 0.17 },
      { profileId: 'wp-vanguard-dev-europe-small-cap', weight: 0.06 },
      { profileId: 'wp-amundi-msci-japan', weight: 0.07 },
      { profileId: 'wp-ishares-japan-small-cap', weight: 0.02 },
      { profileId: 'wp-ubs-msci-pacific-ex-japan', weight: 0.06 },
      { profileId: 'wp-ishares-core-em-imi', weight: 0.16 },
    ],
  },
]

export function getStage(id: 'stage2' | 'stage3'): TargetStage {
  return TARGET_STAGES.find((s) => s.id === id) ?? TARGET_STAGES[1]
}
