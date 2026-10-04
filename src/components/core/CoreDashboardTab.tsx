import React, { useState, useMemo, useCallback } from 'react'
import type { Investment } from '../../utils/parser'
import type { CoreProfile, CoreRole } from '../../utils/core/types'
import {
  buildCorePositions,
  computeCoreExposure,
} from '../../utils/core/coreExposure'
import {
  getAllProfiles,
  loadRoleOverrides,
  setRoleOverride,
  loadTargetStageId,
  saveTargetStageId,
} from '../../utils/core/profileStore'
import { getStage } from '../../utils/core/targets'
import { optimizeCoreOrders } from '../../utils/core/coreOptimizer'
import { CoreKpiHeader } from './CoreKpiHeader'
import { CoreSimulator } from './CoreSimulator'
import { CoreExposureCharts } from './CoreExposureCharts'
import { CoreHoldingsTable } from './CoreHoldingsTable'
import { CoreProfileModal } from './CoreProfileModal'
import { CoreSparplanProjection } from './CoreSparplanProjection'
import { Sliders, Copy, Check, Info, Calendar } from 'lucide-react'

interface CoreDashboardTabProps {
  investments: Investment[]
  suggestedCoreBuy?: number
}

function fmtEur(v: number): string {
  return `€ ${v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export const CoreDashboardTab: React.FC<CoreDashboardTabProps> = ({
  investments,
  suggestedCoreBuy = 0,
}) => {
  // 1. Stage-Auswahl (Stufe 2 vs Stufe 3)
  const [stageId, setStageId] = useState<'stage2' | 'stage3'>(() => loadTargetStageId())
  const activeStage = useMemo(() => getStage(stageId), [stageId])

  const handleSelectStage = useCallback((id: 'stage2' | 'stage3') => {
    setStageId(id)
    saveTargetStageId(id)
  }, [])

  // 2. Rollen-Overrides & Profile
  const [roleOverrides, setRoleOverrides] = useState<Record<string, CoreRole>>(() => loadRoleOverrides())
  const allProfiles = useMemo(() => getAllProfiles(), [])

  const handleRoleChange = useCallback((profileId: string, role: CoreRole) => {
    setRoleOverride(profileId, role)
    setRoleOverrides((prev) => ({ ...prev, [profileId]: role }))
  }, [])

  // 3. Core Positionen
  const positions = useMemo(() => {
    return buildCorePositions(investments, allProfiles, roleOverrides)
  }, [investments, allProfiles, roleOverrides])

  // 4. Simulator-State (Deltas in Euro)
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

  // 5. Basis- und Simuliertes Exposure
  const baseExposure = useMemo(() => computeCoreExposure(positions, {}), [positions])
  const simulatedExposure = useMemo(
    () => computeCoreExposure(positions, simulatedDeltas),
    [positions, simulatedDeltas]
  )

  const isSimulated = useMemo(
    () => Object.values(simulatedDeltas).some((d) => Math.abs(d) > 0.01),
    [simulatedDeltas]
  )

  // Gesamtwert von 'Stocks' für die KPI-Quote
  const stocksTotalValue = useMemo(() => {
    return investments
      .filter((inv) => inv.category === 'Stocks' && inv.currentValue > 0)
      .reduce((s, inv) => s + inv.currentValue, 0)
  }, [investments])

  // 6. Optimierer / Kaufplaner-State
  const [plannerView, setPlannerView] = useState<'sparplan' | 'model'>('sparplan')
  const [optimizerBudget, setOptimizerBudget] = useState<number>(() => Math.max(suggestedCoreBuy, 1000))
  const [optimizerMode, setOptimizerMode] = useState<'buy-only' | 'rebalance'>('buy-only')
  const [copiedOrders, setCopiedOrders] = useState(false)

  const optimizationResult = useMemo(() => {
    return optimizeCoreOrders(positions, activeStage, optimizerBudget, optimizerMode)
  }, [positions, activeStage, optimizerBudget, optimizerMode])

  const handleApplyOptimizerToSimulator = useCallback(() => {
    setSimulatedDeltas(optimizationResult.simulatedDeltas)
  }, [optimizationResult.simulatedDeltas])

  const handleCopyOrderText = useCallback(() => {
    const lines = optimizationResult.orders.map(
      (o) => `${o.action === 'BUY' ? 'KAUFEN' : 'VERKAUFEN'} ${fmtEur(o.amount)} -> ${o.name} (${o.isin})`
    )
    navigator.clipboard.writeText(lines.join('\n'))
    setCopiedOrders(true)
    setTimeout(() => setCopiedOrders(false), 2000)
  }, [optimizationResult.orders])

  // 7. Detail-Inspektor Modal
  const [inspectProfile, setInspectProfile] = useState<CoreProfile | null>(null)

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

  return (
    <div className="animate-in">
      {/* 1. KPI-Leiste */}
      <CoreKpiHeader
        exposure={simulatedExposure}
        baseExposure={baseExposure}
        stocksTotalValue={stocksTotalValue}
        activeStage={activeStage}
        onSelectStage={handleSelectStage}
        isSimulated={isSimulated}
      />

      {/* 2. Interaktiver What-If Simulator */}
      <CoreSimulator
        positions={positions}
        simulatedDeltas={simulatedDeltas}
        onDeltaChange={handleDeltaChange}
        onReset={handleResetSimulation}
        onApplyPlan={() => {
          // Toast oder visuelle Bestätigung
          alert('Simulierter Plan aktiv! Die Exposures spiegeln nun deine Schieberegler wider.')
        }}
      />

      {/* 3. Exposure Charts (Regionen, Währungen, Size & Faktoren) */}
      <CoreExposureCharts
        exposure={simulatedExposure}
        baseExposure={baseExposure}
        targetStage={activeStage}
        isSimulated={isSimulated}
      />

      {/* 4. Core Sparplan-Rechner & Kaufplaner */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          padding: '20px',
          marginBottom: '24px',
        }}
      >
        {/* Navigation Tabs zwischen Sparplan (vorhandene ETFs) und Modell-Rebalancing */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '18px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '12px',
            flexWrap: 'wrap',
          }}
        >
          <button
            className={`btn btn-sm ${plannerView === 'sparplan' ? '' : 'btn-ghost'}`}
            style={{
              background: plannerView === 'sparplan' ? 'var(--gold)' : 'transparent',
              color: plannerView === 'sparplan' ? '#000' : 'var(--text-secondary)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onClick={() => setPlannerView('sparplan')}
          >
            <Calendar size={14} />
            <span>Monatlicher Sparplan & Projektion (Vorhandene ETFs)</span>
          </button>
          <button
            className={`btn btn-sm ${plannerView === 'model' ? '' : 'btn-ghost'}`}
            style={{
              background: plannerView === 'model' ? 'var(--gold)' : 'transparent',
              color: plannerView === 'model' ? '#000' : 'var(--text-secondary)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onClick={() => setPlannerView('model')}
          >
            <Sliders size={14} />
            <span>Einmalkauf / Rebalancing (Whitepaper Modell)</span>
          </button>
        </div>

        {plannerView === 'sparplan' ? (
          <CoreSparplanProjection
            positions={positions}
            targetStage={activeStage}
            initialMonthlyBudget={suggestedCoreBuy > 0 ? suggestedCoreBuy : 1000}
            onApplyToSimulator={(deltas) => setSimulatedDeltas(deltas)}
          />
        ) : (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Core-Kaufplaner & Rebalancing-Generator (Modell-ETFs)
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Berechnet gezielte Zukäufe oder Umschichtungen anhand der Musterportfolios, um das {activeStage.label.split(':')[0]} zu erreichen.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Budget:</span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={optimizerBudget}
                    onChange={(e) => setOptimizerBudget(Math.max(0, parseFloat(e.target.value) || 0))}
                    style={{
                      width: '90px',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>€</span>
                </div>

                <select
                  value={optimizerMode}
                  onChange={(e) => setOptimizerMode(e.target.value as 'buy-only' | 'rebalance')}
                  style={{
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="buy-only">Nur Zukauf (Sparplan / Steuerneutral)</option>
                  <option value="rebalance">Voll-Rebalancing (Kauf & Verkauf)</option>
                </select>
              </div>
            </div>

            {suggestedCoreBuy > 0 && optimizerBudget !== suggestedCoreBuy && (
              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--gold)',
                  background: 'rgba(240, 192, 64, 0.08)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Info size={13} />
                  <span>Core-First Signal empfiehlt aktuell einen Zukauf von <strong>{fmtEur(suggestedCoreBuy)}</strong> in den Core.</span>
                </div>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: '0.72rem', color: 'var(--gold)' }}
                  onClick={() => setOptimizerBudget(suggestedCoreBuy)}
                >
                  Betrag übernehmen
                </button>
              </div>
            )}

            {optimizationResult.orders.length > 0 ? (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  {optimizationResult.orders.map((o) => (
                    <div
                      key={o.profileId}
                      style={{
                        background: 'var(--bg-surface)',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                          {o.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {o.isin} · {o.reason}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: o.action === 'BUY' ? 'var(--green)' : 'var(--red)',
                          }}
                        >
                          {o.action === 'BUY' ? '+ ' : '- '}{fmtEur(o.amount)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          Zielquote: {(o.targetShare * 100).toFixed(0)} %
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Budget verwendet: <strong>{fmtEur(optimizationResult.budgetUsed)}</strong>
                    {optimizationResult.remainingBudget > 0 && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                        ({fmtEur(optimizationResult.remainingBudget)} Rest)
                      </span>
                    )}
                  </span>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={handleCopyOrderText}
                    >
                      {copiedOrders ? <Check size={12} color="var(--green)" /> : <Copy size={12} />}
                      <span>{copiedOrders ? 'Kopiert!' : 'Orderliste kopieren'}</span>
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{
                        background: 'var(--gold)',
                        color: '#000',
                        fontWeight: 600,
                      }}
                      onClick={handleApplyOptimizerToSimulator}
                      title="Übernimmt diese Zukäufe in die Schieberegler des Simulators"
                    >
                      In Simulator übertragen
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                Kein Zukaufbedarf ermittelt oder Budget zu gering.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Holdings-Tabelle mit Rollen-Override und Profil-Inspektor */}
      <CoreHoldingsTable
        positions={positions}
        totalValue={baseExposure.total}
        onRoleChange={handleRoleChange}
        onInspectProfile={setInspectProfile}
      />

      {/* 6. Profil-Inspektor Modal */}
      <CoreProfileModal
        profile={inspectProfile}
        onClose={() => setInspectProfile(null)}
      />
    </div>
  )
}
