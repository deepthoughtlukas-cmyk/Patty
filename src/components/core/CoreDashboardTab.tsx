import React, { useState, useMemo, useCallback, useEffect } from 'react'
import type { Investment } from '../../utils/parser'
import type { CoreProfile, CoreRole } from '../../utils/core/types'
import {
  buildCorePositions,
  computeCoreExposure,
  computeStageTargetExposure,
  computeCoreFitSummary,
} from '../../utils/core/coreExposure'
import {
  getAllProfiles,
  loadRoleOverrides,
  setRoleOverride,
  loadTargetStageId,
  saveTargetStageId,
  loadCoreSparplanConfig,
  saveCoreSparplanConfig,
} from '../../utils/core/profileStore'
import { getStage } from '../../utils/core/targets'
import { buildPhasedRoadmap, diagnoseCoreGaps } from '../../utils/core/coreOptimizer'
import { CoreKpiHeader } from './CoreKpiHeader'
import { CoreSimulator } from './CoreSimulator'
import { CoreExposureCharts, type ScenarioViewMode } from './CoreExposureCharts'
import { CoreHoldingsTable } from './CoreHoldingsTable'
import { CoreProfileModal } from './CoreProfileModal'
import { CoreRoadmapPanel } from './CoreRoadmapPanel'
import { ChevronDown, ChevronRight, Layers, Sliders } from 'lucide-react'

interface CoreDashboardTabProps {
  investments: Investment[]
  suggestedCoreBuy?: number
}

export const CoreDashboardTab: React.FC<CoreDashboardTabProps> = ({
  investments,
  suggestedCoreBuy = 0,
}) => {
  const [stageId, setStageId] = useState<'stage2' | 'stage3'>(() => loadTargetStageId())
  const activeStage = useMemo(() => getStage(stageId), [stageId])

  const handleSelectStage = useCallback((id: 'stage2' | 'stage3') => {
    setStageId(id)
    saveTargetStageId(id)
  }, [])

  const [roleOverrides, setRoleOverrides] = useState<Record<string, CoreRole>>(() => loadRoleOverrides())
  const allProfiles = useMemo(() => getAllProfiles(), [])

  const handleRoleChange = useCallback((profileId: string, role: CoreRole) => {
    setRoleOverride(profileId, role)
    setRoleOverrides((prev) => ({ ...prev, [profileId]: role }))
  }, [])

  const positions = useMemo(() => {
    return buildCorePositions(investments, allProfiles, roleOverrides)
  }, [investments, allProfiles, roleOverrides])

  const unmatchedCount = useMemo(
    () => positions.filter((p) => !p.profile && p.value > 0).length,
    [positions]
  )

  const [simulatedDeltas, setSimulatedDeltas] = useState<Record<string, number>>({})

  const handleDeltaChange = useCallback((key: string, delta: number) => {
    setSimulatedDeltas((prev) => ({
      ...prev,
      [key]: delta,
    }))
  }, [])

  const handleResetSimulation = useCallback(() => {
    setSimulatedDeltas({})
  }, [])

  const baseExposure = useMemo(() => computeCoreExposure(positions, {}), [positions])
  const simulatedExposure = useMemo(
    () => computeCoreExposure(positions, simulatedDeltas),
    [positions, simulatedDeltas]
  )
  const targetExposure = useMemo(
    () => computeStageTargetExposure(activeStage, allProfiles),
    [activeStage, allProfiles]
  )

  const isSimulated = useMemo(
    () => Object.values(simulatedDeltas).some((d) => Math.abs(d) > 0.01),
    [simulatedDeltas]
  )

  const stocksTotalValue = useMemo(() => {
    return investments
      .filter((inv) => inv.category === 'Stocks' && inv.currentValue > 0)
      .reduce((s, inv) => s + inv.currentValue, 0)
  }, [investments])

  // Fahrplan-Konfiguration
  const savedConfig = useMemo(() => loadCoreSparplanConfig(), [])
  const [monthlyBudget, setMonthlyBudget] = useState<number>(() =>
    savedConfig?.monthlyBudget && savedConfig.monthlyBudget > 0
      ? savedConfig.monthlyBudget
      : Math.max(50, suggestedCoreBuy > 0 ? suggestedCoreBuy : 1000)
  )
  const [maxPositions, setMaxPositions] = useState<number>(() => savedConfig?.maxPositions ?? 4)
  const [projectionHorizon, setProjectionHorizon] = useState<number>(
    () => savedConfig?.projectionHorizon ?? 36
  )
  const [includeCandidates, setIncludeCandidates] = useState<boolean>(
    () => Boolean(savedConfig?.includeCandidates)
  )

  useEffect(() => {
    saveCoreSparplanConfig({
      monthlyBudget,
      maxPositions,
      projectionHorizon,
      includeCandidates,
    })
  }, [monthlyBudget, maxPositions, projectionHorizon, includeCandidates])

  const roadmap = useMemo(
    () =>
      buildPhasedRoadmap(positions, activeStage, monthlyBudget, {
        maxPositions,
        maxMonths: projectionHorizon,
        includeModelCandidates: includeCandidates,
      }),
    [positions, activeStage, monthlyBudget, maxPositions, projectionHorizon, includeCandidates]
  )

  const diagnostics = useMemo(
    () => diagnoseCoreGaps(positions, baseExposure, activeStage, targetExposure),
    [positions, baseExposure, activeStage, targetExposure]
  )

  // Szenario-Vorschau (Heute | Nach 12 M | Ziel | Simulation)
  const [scenarioChoice, setScenarioChoice] = useState<'now' | 'plan12m' | 'target'>('now')
  const scenarioMode: ScenarioViewMode = isSimulated ? 'sim' : scenarioChoice

  const handleSelectScenario = useCallback((mode: 'now' | 'plan12m' | 'target') => {
    setSimulatedDeltas({})
    setScenarioChoice(mode)
  }, [])

  const displayExposure = useMemo(() => {
    if (scenarioMode === 'sim') return simulatedExposure
    if (scenarioMode === 'plan12m') return roadmap.exposureAfter12m
    if (scenarioMode === 'target') return targetExposure
    return baseExposure
  }, [scenarioMode, simulatedExposure, roadmap.exposureAfter12m, targetExposure, baseExposure])

  const fitSummary = useMemo(
    () => computeCoreFitSummary(displayExposure, activeStage, targetExposure),
    [displayExposure, activeStage, targetExposure]
  )

  // Experten-Drawer State
  const [showSimulator, setShowSimulator] = useState(false)
  const [showHoldings, setShowHoldings] = useState(() => unmatchedCount > 0)
  const [inspectProfile, setInspectProfile] = useState<CoreProfile | null>(null)

  const handleApplyToSimulator = useCallback((deltas: Record<string, number>) => {
    setSimulatedDeltas(deltas)
    setShowSimulator(true)
  }, [])

  const handleOpenHoldings = useCallback(() => {
    setShowHoldings(true)
  }, [])

  if (positions.length === 0) {
    return (
      <div
        className="card empty-state"
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        <Sliders size={36} color="var(--text-muted)" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Keine Core-Positionen gefunden
        </div>
        <div style={{ color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto', fontSize: '0.88rem' }}>
          Weise in der Holdings-Tabelle mindestens einem ETF in der Kategorie <strong>Stocks</strong> die Subkategorie <strong>Core</strong> zu, um die Look-Through Analyse und den Simulator zu aktivieren.
        </div>
      </div>
    )
  }

  const matchedCount = positions.length - unmatchedCount

  return (
    <div className="animate-in">
      {/* Ebene 1: Gesundheitscheck */}
      <CoreKpiHeader
        exposure={displayExposure}
        baseExposure={baseExposure}
        targetExposure={targetExposure}
        fitSummary={fitSummary}
        stocksTotalValue={stocksTotalValue}
        activeStage={activeStage}
        onSelectStage={handleSelectStage}
        isSimulated={isSimulated}
        onResetSimulation={handleResetSimulation}
        unmatchedCount={unmatchedCount}
        onOpenHoldings={handleOpenHoldings}
      />

      {/* Ebene 2: Einheitliche Ist-vs.-Soll Diagnose */}
      <CoreExposureCharts
        exposure={displayExposure}
        baseExposure={baseExposure}
        targetExposure={targetExposure}
        targetStage={activeStage}
        scenarioMode={scenarioMode}
        onSelectScenario={handleSelectScenario}
        hasPlan12m={monthlyBudget > 0}
        isSimulated={isSimulated}
      />

      {/* Ebene 3: Geführter Fahrplan */}
      <CoreRoadmapPanel
        positions={positions}
        baseExposure={baseExposure}
        targetStage={activeStage}
        targetExposure={targetExposure}
        suggestedCoreBuy={suggestedCoreBuy}
        monthlyBudget={monthlyBudget}
        onMonthlyBudgetChange={setMonthlyBudget}
        includeCandidates={includeCandidates}
        onIncludeCandidatesChange={setIncludeCandidates}
        maxPositions={maxPositions}
        onMaxPositionsChange={setMaxPositions}
        projectionHorizon={projectionHorizon}
        onProjectionHorizonChange={setProjectionHorizon}
        roadmap={roadmap}
        diagnostics={diagnostics}
        onApplyToSimulator={handleApplyToSimulator}
        onOpenHoldings={handleOpenHoldings}
      />

      {/* Experten-Bereich 1: What-If Simulator (standardmäßig eingeklappt) */}
      <div className="core-drawer">
        <button
          type="button"
          className="core-drawer-trigger"
          aria-expanded={showSimulator}
          onClick={() => setShowSimulator((v) => !v)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {showSimulator ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Sliders size={14} color="var(--gold)" />
            <span>Manuell simulieren (What-If)</span>
          </span>
          <span className="core-drawer-meta">
            {isSimulated ? 'Simulation aktiv' : 'Schieberegler je ETF'}
          </span>
        </button>

        {showSimulator && (
          <div className="core-drawer-body">
            <CoreSimulator
              positions={positions}
              simulatedDeltas={simulatedDeltas}
              onDeltaChange={handleDeltaChange}
              onReset={handleResetSimulation}
            />
          </div>
        )}
      </div>

      {/* Experten-Bereich 2: Core-ETFs & Profil-Zuordnung */}
      <div className="core-drawer">
        <button
          type="button"
          className="core-drawer-trigger"
          aria-expanded={showHoldings}
          onClick={() => setShowHoldings((v) => !v)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {showHoldings ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Layers size={14} color="var(--blue)" />
            <span>Core-ETFs & Profil-Zuordnung</span>
          </span>
          <span className="core-drawer-meta" style={unmatchedCount > 0 ? { color: 'var(--gold)' } : undefined}>
            {positions.length} ETFs · {matchedCount}/{positions.length} Profile · Ø TER {baseExposure.ter.toFixed(2)} %
          </span>
        </button>

        {showHoldings && (
          <div className="core-drawer-body">
            <CoreHoldingsTable
              positions={positions}
              totalValue={baseExposure.total}
              onRoleChange={handleRoleChange}
              onInspectProfile={setInspectProfile}
            />
          </div>
        )}
      </div>

      <CoreProfileModal
        profile={inspectProfile}
        onClose={() => setInspectProfile(null)}
      />
    </div>
  )
}
