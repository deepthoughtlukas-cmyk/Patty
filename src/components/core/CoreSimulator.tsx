import React, { useState } from 'react'
import { RotateCcw, ArrowRightLeft, Plus, Minus, Check } from 'lucide-react'
import type { CorePosition } from '../../utils/core/types'

interface CoreSimulatorProps {
  positions: CorePosition[]
  simulatedDeltas: Record<string, number>
  onDeltaChange: (key: string, delta: number) => void
  onReset: () => void
  onApplyPlan: () => void
}

function fmtEur(v: number): string {
  return `€ ${v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export const CoreSimulator: React.FC<CoreSimulatorProps> = ({
  positions,
  simulatedDeltas,
  onDeltaChange,
  onReset,
  onApplyPlan,
}) => {
  const [mode, setMode] = useState<'neutral' | 'inflow'>('neutral')

  // Im neutralen Modus: Summe aller Verkäufe (negative Deltas) als Rebalancing-Budget
  const totalSells = Object.values(simulatedDeltas)
    .filter((d) => d < 0)
    .reduce((s, d) => s + Math.abs(d), 0)
  const totalBuys = Object.values(simulatedDeltas)
    .filter((d) => d > 0)
    .reduce((s, d) => s + d, 0)
  const availablePool = Math.max(0, totalSells - totalBuys)

  const hasAnyDelta = Object.values(simulatedDeltas).some((d) => Math.abs(d) > 0.01)

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        padding: '20px',
        marginBottom: '24px',
      }}
    >
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
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Interaktiver What-If Simulator
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Simuliere Zukäufe oder Umschichtungen über Schieberegler und sieh live die Auswirkung auf Länder, Währungen & Faktoren.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px',
              border: '1px solid var(--border)',
            }}
          >
            <button
              className={`btn btn-sm ${mode === 'neutral' ? '' : 'btn-ghost'}`}
              style={{
                fontSize: '0.78rem',
                background: mode === 'neutral' ? 'var(--bg-card-hover)' : 'transparent',
                color: mode === 'neutral' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={() => setMode('neutral')}
              title="Verkäufe wandern in ein Umschichtungs-Budget für andere ETFs"
            >
              <ArrowRightLeft size={12} style={{ marginRight: 4 }} />
              Cash-Neutral
            </button>
            <button
              className={`btn btn-sm ${mode === 'inflow' ? '' : 'btn-ghost'}`}
              style={{
                fontSize: '0.78rem',
                background: mode === 'inflow' ? 'var(--bg-card-hover)' : 'transparent',
                color: mode === 'inflow' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={() => setMode('inflow')}
              title="Simuliert die Zufuhr von frischem Sparplan- oder Anlage-Cash"
            >
              <Plus size={12} style={{ marginRight: 4 }} />
              Frisches Kapital
            </button>
          </div>

          {hasAnyDelta && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={onReset}
              style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
              title="Alle Schieberegler auf den tatsächlichen Depotbestand zurücksetzen"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
        </div>
      </div>

      {mode === 'neutral' && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.85rem',
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>
            Verfügbares Rebalancing-Budget (aus Verkäufen):
          </span>
          <span
            style={{
              fontWeight: 700,
              color: availablePool > 0 ? 'var(--gold)' : totalBuys > totalSells ? 'var(--red)' : 'var(--green)',
            }}
          >
            {fmtEur(availablePool)}
            {totalBuys > totalSells && (
              <span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 6, color: 'var(--red)' }}>
                (-{fmtEur(totalBuys - totalSells)} mehr gekauft als verkauft)
              </span>
            )}
          </span>
        </div>
      )}

      {/* Slider-Liste für jede Core-Position */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {positions.map((pos) => {
          const delta = simulatedDeltas[pos.key] || 0
          const effectiveVal = Math.max(0, pos.value + delta)
          const pctChange = pos.value > 0 ? (delta / pos.value) * 100 : 0

          return (
            <div
              key={pos.key}
              style={{
                background: 'var(--bg-surface)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: Math.abs(delta) > 0.01 ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: 8 }}>
                    {pos.name}
                  </span>
                  {pos.role === 'factor' && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(240, 192, 64, 0.15)',
                        color: 'var(--gold)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}
                    >
                      Faktor-ETF
                    </span>
                  )}
                  {pos.role === 'cashflow' && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(167, 139, 250, 0.15)',
                        color: 'var(--purple)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      Dividenden-Satellit
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Ist: {fmtEur(pos.value)}</span>
                  <span style={{ color: 'var(--text-muted)' }}>➔</span>
                  <span style={{ fontWeight: 700, color: Math.abs(delta) > 0.01 ? 'var(--gold)' : 'var(--text-primary)' }}>
                    {fmtEur(effectiveVal)}
                  </span>
                  {Math.abs(delta) > 0.01 && (
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: delta > 0 ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      ({delta > 0 ? '+' : ''}{fmtEur(delta)} / {delta > 0 ? '+' : ''}{pctChange.toFixed(0)} %)
                    </span>
                  )}
                </div>
              </div>

              {/* Slider und Schnelltasten */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="range"
                  className="weight-slider"
                  min={-pos.value}
                  max={Math.max(pos.value * 2, 5000)}
                  step={50}
                  value={delta}
                  onChange={(e) => onDeltaChange(pos.key, parseFloat(e.target.value) || 0)}
                  style={{ flex: 1 }}
                />

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                    onClick={() => onDeltaChange(pos.key, -pos.value)}
                    title="Vollständig verkaufen"
                  >
                    Verkauf
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                    onClick={() => onDeltaChange(pos.key, delta - 500)}
                  >
                    <Minus size={10} /> 500
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                    onClick={() => onDeltaChange(pos.key, delta + 500)}
                  >
                    <Plus size={10} /> 500
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                    onClick={() => onDeltaChange(pos.key, delta + 1000)}
                  >
                    <Plus size={10} /> 1k
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {hasAnyDelta && (
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            className="btn btn-sm"
            style={{
              background: 'var(--gold)',
              color: '#000',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onClick={onApplyPlan}
          >
            <Check size={14} />
            Als Rebalancing-Plan übernehmen
          </button>
        </div>
      )}
    </div>
  )
}
