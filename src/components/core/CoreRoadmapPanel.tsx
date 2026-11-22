import React, { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Sliders,
  Sparkles,
} from 'lucide-react'
import type { CoreExposure, CorePosition, TargetStage } from '../../utils/core/types'
import {
  optimizeCoreOrders,
  type CoreGapDiagnostic,
  type CoreRoadmap,
  type SparplanItem,
} from '../../utils/core/coreOptimizer'

interface CoreRoadmapPanelProps {
  positions: CorePosition[]
  baseExposure: CoreExposure
  targetStage: TargetStage
  targetExposure: CoreExposure
  suggestedCoreBuy: number
  monthlyBudget: number
  onMonthlyBudgetChange: (val: number) => void
  includeCandidates: boolean
  onIncludeCandidatesChange: (val: boolean) => void
  maxPositions: number
  onMaxPositionsChange: (val: number) => void
  projectionHorizon: number
  onProjectionHorizonChange: (val: number) => void
  roadmap: CoreRoadmap
  diagnostics: CoreGapDiagnostic[]
  onApplyToSimulator: (deltas: Record<string, number>) => void
  onOpenHoldings: () => void
}

function fmtEur(v: number): string {
  return `€ ${Math.round(v).toLocaleString('de-DE')}`
}

export const CoreRoadmapPanel: React.FC<CoreRoadmapPanelProps> = ({
  positions,
  targetStage,
  suggestedCoreBuy,
  monthlyBudget,
  onMonthlyBudgetChange,
  includeCandidates,
  onIncludeCandidatesChange,
  maxPositions,
  onMaxPositionsChange,
  projectionHorizon,
  onProjectionHorizonChange,
  roadmap,
  diagnostics,
  onApplyToSimulator,
  onOpenHoldings,
}) => {
  const [plannerMode, setPlannerMode] = useState<'monthly' | 'oneoff'>('monthly')
  const [budgetText, setBudgetText] = useState<string>(String(monthlyBudget))
  const [oneOffBudget, setOneOffBudget] = useState<number>(() => Math.max(suggestedCoreBuy, 1000))
  const [oneOffMode, setOneOffMode] = useState<'buy-only' | 'rebalance'>('buy-only')
  const [showTimeline, setShowTimeline] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const oneOffResult = useMemo(() => {
    return optimizeCoreOrders(positions, targetStage, oneOffBudget, oneOffMode)
  }, [positions, targetStage, oneOffBudget, oneOffMode])

  const chartData = useMemo(() => {
    return roadmap.timeline.map((p) => ({
      month: `M ${p.month}`,
      US: Number((p.usShare * 100).toFixed(1)),
      Europa: Number((p.euShare * 100).toFixed(1)),
      EM: Number((p.emShare * 100).toFixed(1)),
      SmallCap: Number((p.smallCapShare * 100).toFixed(1)),
    }))
  }, [roadmap.timeline])

  const handleCopySparplan = (id: string, items: SparplanItem[]) => {
    const text = items
      .map((s) => `Sparplan: ${fmtEur(s.amount)}/Monat -> ${s.name}${s.isin ? ` (${s.isin})` : ''}`)
      .join('\n')
    navigator.clipboard?.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCopyOneOff = () => {
    const text = oneOffResult.orders
      .map((o) => `${o.action === 'BUY' ? 'KAUFEN' : 'VERKAUFEN'} ${fmtEur(o.amount)} -> ${o.name} (${o.isin})`)
      .join('\n')
    navigator.clipboard?.writeText(text)
    setCopiedId('oneoff')
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="core-card">
      {/* Header & Modus-Steuerung */}
      <div className="core-roadmap-controls">
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Fahrplan zur optimalen Gewichtung
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Konkreter Umsetzungsplan für {targetStage.label.split(':')[0]} nach Regionen, Cap und Faktor-Cap.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="core-segment-tabs">
            <button
              type="button"
              className={`core-segment-tab ${plannerMode === 'monthly' ? 'active' : ''}`}
              onClick={() => setPlannerMode('monthly')}
            >
              <Calendar size={12} style={{ marginRight: 5 }} />
              Monatlicher Fahrplan
            </button>
            <button
              type="button"
              className={`core-segment-tab ${plannerMode === 'oneoff' ? 'active' : ''}`}
              onClick={() => setPlannerMode('oneoff')}
            >
              <Sliders size={12} style={{ marginRight: 5 }} />
              Einmalkauf / Umschichtung
            </button>
          </div>
        </div>
      </div>

      {/* Parameter-Zeile */}
      <div className="core-param-bar">
        {plannerMode === 'monthly' ? (
          <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span>Sparrate:</span>
              <input
                type="number"
                aria-label="Monatliche Sparrate"
                min={0}
                step={50}
                value={budgetText}
                onChange={(e) => {
                  const val = e.target.value
                  setBudgetText(val)
                  const num = parseFloat(val)
                  if (!isNaN(num) && num >= 0) onMonthlyBudgetChange(num)
                  else if (val === '') onMonthlyBudgetChange(0)
                }}
                onBlur={() => {
                  const num = parseFloat(budgetText)
                  if (isNaN(num) || num < 0) {
                    setBudgetText('0')
                    onMonthlyBudgetChange(0)
                  } else {
                    setBudgetText(String(num))
                    onMonthlyBudgetChange(num)
                  }
                }}
                className="core-budget-input"
              />
              <span>€/Monat</span>
            </label>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span>Max. ETFs:</span>
              <select
                aria-label="Maximale ETFs"
                value={maxPositions}
                onChange={(e) => onMaxPositionsChange(Number(e.target.value))}
                className="cat-select"
                style={{ minWidth: 'auto', padding: '4px 22px 4px 8px' }}
              >
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>

            <div className="core-scenario-pills">
              <button
                type="button"
                className={`core-scenario-pill ${!includeCandidates ? 'active' : ''}`}
                onClick={() => onIncludeCandidatesChange(false)}
              >
                Nur Bestand
              </button>
              <button
                type="button"
                className={`core-scenario-pill ${includeCandidates ? 'active' : ''}`}
                onClick={() => onIncludeCandidatesChange(true)}
              >
                inkl. Ziel-ETFs
              </button>
            </div>

            {suggestedCoreBuy > 0 && monthlyBudget !== suggestedCoreBuy && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '0.74rem', color: 'var(--gold)', padding: '4px 10px' }}
                onClick={() => {
                  onMonthlyBudgetChange(suggestedCoreBuy)
                  setBudgetText(String(suggestedCoreBuy))
                }}
              >
                <Sparkles size={12} />
                Core-Signal: {fmtEur(suggestedCoreBuy)}
              </button>
            )}
          </>
        ) : (
          <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span>Budget:</span>
              <input
                type="number"
                aria-label="Einmalkauf Budget"
                min={0}
                step={50}
                value={oneOffBudget}
                onChange={(e) => setOneOffBudget(Math.max(0, parseFloat(e.target.value) || 0))}
                className="core-budget-input"
              />
              <span>€</span>
            </label>

            <select
              aria-label="Rebalancing Modus"
              value={oneOffMode}
              onChange={(e) => setOneOffMode(e.target.value as 'buy-only' | 'rebalance')}
              className="cat-select"
            >
              <option value="buy-only">Nur Zukauf (Steuerneutral)</option>
              <option value="rebalance">Kauf & Verkauf (Voll-Rebalancing)</option>
            </select>

            {suggestedCoreBuy > 0 && oneOffBudget !== suggestedCoreBuy && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '0.74rem', color: 'var(--gold)', padding: '4px 10px' }}
                onClick={() => setOneOffBudget(suggestedCoreBuy)}
              >
                <Sparkles size={12} />
                Core-Signal: {fmtEur(suggestedCoreBuy)}
              </button>
            )}
          </>
        )}
      </div>

      {/* Lücken-Diagnose */}
      {diagnostics.length > 0 && (
        <div className="core-diagnostic-list">
          {diagnostics.map((d) => (
            <div key={d.id} className={`core-diagnostic-item ${d.severity}`}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1 }}>
                {d.severity === 'warning' ? (
                  <AlertTriangle size={15} color="var(--gold)" style={{ marginTop: 2, flexShrink: 0 }} />
                ) : (
                  <Info size={15} color="var(--blue)" style={{ marginTop: 2, flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{d.title}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{d.detail}</div>
                </div>
              </div>
              {d.actionType === 'open-holdings' && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={onOpenHoldings}>
                  Holdings öffnen
                </button>
              )}
              {d.actionType === 'enable-candidates' && !includeCandidates && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ color: 'var(--gold)' }}
                  onClick={() => onIncludeCandidatesChange(true)}
                >
                  Ziel-ETFs einbeziehen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MONATLICHER FAHRPLAN */}
      {plannerMode === 'monthly' && (
        <div>
          {/* 3 Meilensteine */}
          <div className="core-milestones-strip">
            <div className="core-milestone-box">
              <span className="core-milestone-label">Regionen im Band</span>
              <strong style={{ color: roadmap.monthsToRegionTarget !== null ? 'var(--green)' : 'var(--gold)' }}>
                {roadmap.monthsToRegionTarget === 0
                  ? 'Bereits erreicht'
                  : roadmap.monthsToRegionTarget !== null
                  ? `Monat ${roadmap.monthsToRegionTarget}`
                  : `> ${projectionHorizon} Monate`}
              </strong>
            </div>

            <div className="core-milestone-box">
              <span className="core-milestone-label">Small-Cap-Ziel</span>
              <strong style={{ color: roadmap.monthsToSizeTarget !== null ? 'var(--green)' : 'var(--gold)' }}>
                {targetStage.id === 'stage2'
                  ? 'Nicht relevant (Stufe 2)'
                  : roadmap.monthsToSizeTarget === 0
                  ? 'Bereits erreicht'
                  : roadmap.monthsToSizeTarget !== null
                  ? `Monat ${roadmap.monthsToSizeTarget}`
                  : `> ${projectionHorizon} Monate`}
              </strong>
            </div>

            <div className="core-milestone-box">
              <span className="core-milestone-label">Investition bis Gesamtziel</span>
              <strong>
                {roadmap.monthsToAllTargets === 0
                  ? '€ 0 (Im Ziel)'
                  : roadmap.monthsToAllTargets !== null
                  ? fmtEur(roadmap.monthsToAllTargets * monthlyBudget)
                  : `> ${fmtEur(projectionHorizon * monthlyBudget)}`}
              </strong>
            </div>
          </div>

          {/* Etappen-Karten */}
          {roadmap.phases.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
              {roadmap.phases.map((phase) => {
                const rangeLabel =
                  phase.startMonth === phase.endMonth
                    ? `Monat ${phase.startMonth}`
                    : `Monat ${phase.startMonth}–${phase.endMonth}`
                const copyKey = `phase-${phase.phaseNumber}`

                return (
                  <div className="core-phase-card" key={phase.phaseNumber}>
                    <div className="core-phase-header">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="core-phase-badge">{rangeLabel}</span>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {phase.title}
                          </span>
                          {phase.milestoneReached && (
                            <span className="core-milestone-tag">{phase.milestoneReached}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 3 }}>
                          {phase.focusSummary}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleCopySparplan(copyKey, phase.allocations)}
                        >
                          {copiedId === copyKey ? <Check size={12} color="var(--green)" /> : <Copy size={12} />}
                          {copiedId === copyKey ? 'Kopiert!' : 'Sparplan kopieren'}
                        </button>
                        {phase.phaseNumber === 1 && (
                          <button
                            type="button"
                            className="btn btn-sm btn-gold"
                            onClick={() => onApplyToSimulator(roadmap.deltas12m)}
                          >
                            12 M in Simulator laden
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {phase.allocations.map((item) => (
                        <div className="core-alloc-row" key={item.key}>
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                                {item.name}
                              </span>
                              {item.isCandidate && (
                                <span className="core-new-badge">Neu</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {item.isin ? `${item.isin} · ` : ''}{item.reason}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: '0.88rem' }}>
                              {fmtEur(item.amount)} / M
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {(item.shareOfBudget * 100).toFixed(0)} %
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(74, 222, 128, 0.08)',
                border: '1px solid rgba(74, 222, 128, 0.25)',
                color: 'var(--green)',
                fontSize: '0.84rem',
                marginBottom: '14px',
              }}
            >
              Alle Zielquoten sind bereits erreicht — führe den Sparplan proportional zur Zielgewichtung fort oder erhöhe die Sparrate.
            </div>
          )}

          {/* Einklappbare Zeitverlaufs-Kurve */}
          <div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setShowTimeline((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {showTimeline ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {showTimeline ? 'Verlauf über Zeit ausblenden' : 'Verlauf über Zeit anzeigen'}
            </button>

            {showTimeline && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
                  {[24, 36, 60].map((h) => (
                    <button
                      type="button"
                      key={h}
                      className={`core-scenario-pill ${projectionHorizon === h ? 'active' : ''}`}
                      onClick={() => onProjectionHorizonChange(h)}
                    >
                      {h} M
                    </button>
                  ))}
                </div>
                <div style={{ height: '240px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <YAxis unit=" %" domain={[0, 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: any, name: string) => [`${v} %`, name]}
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="US" name="USA Quote" stroke="#60a5fa" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="EM" name="Schwellenländer" stroke="#fb923c" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Europa" name="Europa" stroke="#34d399" strokeWidth={2} dot={false} />
                      {targetStage.id === 'stage3' && (
                        <Line
                          type="monotone"
                          dataKey="SmallCap"
                          name="Small-Cap Quote"
                          stroke="#fcd34d"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                      )}
                      <ReferenceLine y={targetStage.id === 'stage2' ? 40 : 42} stroke="#60a5fa" strokeDasharray="3 3" />
                      <ReferenceLine y={targetStage.id === 'stage2' ? 20 : 16} stroke="#fb923c" strokeDasharray="3 3" />
                      {targetStage.id === 'stage3' && (
                        <ReferenceLine y={14} stroke="#fcd34d" strokeDasharray="3 3" />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EINMALKAUF / UMSCHICHTUNG */}
      {plannerMode === 'oneoff' && (
        <div>
          {oneOffResult.orders.length > 0 ? (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {oneOffResult.orders.map((o) => (
                  <div className="core-alloc-row" key={o.profileId}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.86rem' }}>{o.name}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {o.isin} · {o.reason}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: o.action === 'BUY' ? 'var(--green)' : 'var(--red)' }}>
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
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Budget verwendet: <strong>{fmtEur(oneOffResult.budgetUsed)}</strong>
                  {oneOffResult.remainingBudget > 0 && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                      ({fmtEur(oneOffResult.remainingBudget)} Rest)
                    </span>
                  )}
                </span>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={handleCopyOneOff}>
                    {copiedId === 'oneoff' ? <Check size={12} color="var(--green)" /> : <Copy size={12} />}
                    {copiedId === 'oneoff' ? 'Kopiert!' : 'Orderliste kopieren'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-gold"
                    onClick={() => onApplyToSimulator(oneOffResult.simulatedDeltas)}
                  >
                    In Simulator laden
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
  )
}
