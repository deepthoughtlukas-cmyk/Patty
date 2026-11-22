import { BUILTIN_PROFILES } from '../../utils/core/builtinProfiles'
import { getAllProfiles } from '../../utils/core/profileStore'
import { FACTOR_BUDGET_CAP, REGION_TOLERANCE } from '../../utils/core/targets'
import type { CoreExposure, CorePosition, CoreProfile, RegionKey, TargetStage } from '../../utils/core/types'
import { getProfileRegionShares } from './scoring'

export interface CoreGapDiagnostic {
  id: string
  severity: 'warning' | 'info'
  title: string
  detail: string
  actionType?: 'open-holdings' | 'enable-candidates'
  suggestedProfileName?: string
  suggestedIsin?: string
}

/**
 * Erkennt strukturelle Engpässe im Core-Depot (fehlende Profile, Faktor-Budget > 20 %, fehlende Regionen/Small-Caps).
 */
export function diagnoseCoreGaps(
  positions: CorePosition[],
  exposure: CoreExposure,
  targetStage: TargetStage,
  targetExposure: CoreExposure
): CoreGapDiagnostic[] {
  const diagnostics: CoreGapDiagnostic[] = []
  const allProfiles = getAllProfiles()
  const profileMap = new Map(allProfiles.map((p) => [p.id, p]))
  const builtinMap = new Map(BUILTIN_PROFILES.map((p) => [p.id, p]))

  // 1. Nicht zugeordnete Core-ETFs
  const unmatched = positions.filter((p) => !p.profile && p.value > 0)
  if (unmatched.length > 0) {
    const names = unmatched.map((u) => u.name).slice(0, 2).join(', ')
    const suffix = unmatched.length > 2 ? ` (+${unmatched.length - 2} weitere)` : ''
    diagnostics.push({
      id: 'unmatched-profiles',
      severity: 'warning',
      title: `${unmatched.length} Core-${unmatched.length === 1 ? 'ETF' : 'ETFs'} ohne Look-Through Profil`,
      detail: `${names}${suffix} fließt aktuell nicht in Länder-, Cap- und Regionen-Quoten ein.`,
      actionType: 'open-holdings',
    })
  }

  // 2. Faktor-Budget > 20 %
  if (exposure.roleShares.factor > FACTOR_BUDGET_CAP) {
    const pct = (exposure.roleShares.factor * 100).toFixed(1)
    diagnostics.push({
      id: 'factor-budget-over',
      severity: 'warning',
      title: `Faktor-Budget bei ${pct} % (über 20 %-Cap)`,
      detail:
        'Neue Sparraten bevorzugt in meinungsfreie Markt-Core-ETFs lenken, um den Faktor-Anteil unter 20 % zu drücken.',
    })
  }

  const coveredPositions = positions.filter((p) => p.profile !== null && p.value > 0)

  // 3. Fehlender regionaler Zugang über bestehende ETFs
  const missingRegionGroups: Array<{
    label: string
    deficit: number
    regions: RegionKey[]
    modelProf: CoreProfile | null
  }> = []

  for (const group of targetStage.groups) {
    const curShare = group.regions.reduce((s, r) => s + (exposure.regions[r] || 0), 0)
    const deficit = group.target - curShare
    if (deficit <= REGION_TOLERANCE) continue

    const hasAccess = coveredPositions.some((pos) => {
      const rShares = getProfileRegionShares(pos.profile!)
      const groupShare = group.regions.reduce((s, r) => s + (rShares[r] || 0), 0)
      return groupShare >= 0.2
    })

    if (!hasAccess) {
      let bestModelProf: CoreProfile | null = null
      let bestGroupShare = 0
      for (const m of targetStage.model) {
        const prof = profileMap.get(m.profileId) ?? builtinMap.get(m.profileId) ?? null
        if (!prof) continue
        const rShares = getProfileRegionShares(prof)
        const groupShare = group.regions.reduce((s, r) => s + (rShares[r] || 0), 0)
        if (groupShare > bestGroupShare) {
          bestGroupShare = groupShare
          bestModelProf = prof
        }
      }
      missingRegionGroups.push({
        label: `${group.label} (Ziel ${(group.target * 100).toFixed(0)} %)`,
        deficit,
        regions: group.regions,
        modelProf: bestModelProf,
      })
    }
  }

  if (missingRegionGroups.length > 0) {
    missingRegionGroups.sort((a, b) => b.deficit - a.deficit)
    const primary = missingRegionGroups[0]
    const allLabels = missingRegionGroups.slice(0, 3).map((g) => g.label).join(', ')
    const suggestionText = primary.modelProf
      ? ` Ergänzbar z. B. mit ${primary.modelProf.name} (${primary.modelProf.isins[0] || ''}).`
      : ''
    diagnostics.push({
      id: 'missing-region-access',
      severity: 'info',
      title: 'Fehlender Regionen-Zugang im Bestand',
      detail: `Für ${allLabels} existiert aktuell kein dedizierter ETF im Depot.${suggestionText}`,
      actionType: 'enable-candidates',
      suggestedProfileName: primary.modelProf?.name,
      suggestedIsin: primary.modelProf?.isins[0],
    })
  }

  // 4. Fehlendes Small-Cap-Exposure in Stufe 3
  if (targetStage.id === 'stage3' && exposure.size.small < targetExposure.size.small - 0.02) {
    const hasSmallCapFund = coveredPositions.some((pos) => (pos.profile!.size.small || 0) >= 30)
    if (!hasSmallCapFund) {
      const scProf =
        profileMap.get('wp-xtrackers-russell-2000') ??
        builtinMap.get('wp-xtrackers-russell-2000') ??
        profileMap.get('wp-vanguard-dev-europe-small-cap') ??
        builtinMap.get('wp-vanguard-dev-europe-small-cap') ??
        null
      diagnostics.push({
        id: 'missing-smallcap-access',
        severity: 'info',
        title: 'Kein dedizierter Small-Cap-ETF vorhanden',
        detail: `Stufe 3 zielt auf ${(targetExposure.size.small * 100).toFixed(0)} % Small Caps ab${scProf ? ` (z. B. über ${scProf.name})` : ''}.`,
        actionType: 'enable-candidates',
        suggestedProfileName: scProf?.name,
        suggestedIsin: scProf?.isins[0],
      })
    }
  }

  return diagnostics.slice(0, 3)
}
