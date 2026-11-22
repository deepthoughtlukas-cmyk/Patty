import React, { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Check } from 'lucide-react'
import type { CoreExposure, RegionKey, TargetStage } from '../../utils/core/types'
import { ALL_FACTORS, ALL_REGIONS, countryName, FACTOR_LABELS, REGION_LABELS, regionOf } from '../../utils/core/countries'
import { FACTOR_BUDGET_CAP, REGION_TOLERANCE } from '../../utils/core/targets'

export type ScenarioViewMode = 'now' | 'plan12m' | 'target' | 'sim'

interface CoreExposureChartsProps {
  exposure: CoreExposure
  baseExposure: CoreExposure
  targetExposure: CoreExposure
  targetStage: TargetStage
  scenarioMode: ScenarioViewMode
  onSelectScenario: (mode: 'now' | 'plan12m' | 'target') => void
  hasPlan12m: boolean
  isSimulated: boolean
}

const REGION_COLORS: Record<string, string> = {
  US: '#60a5fa',
  CA: '#38bdf8',
  EU: '#34d399',
  JP: '#f472b6',
  PAC: '#a78bfa',
  EM: '#fb923c',
}

const CURRENCY_COLORS: Record<string, string> = {
  USD: '#60a5fa',
  EUR: '#34d399',
  JPY: '#f472b6',
  GBP: '#818cf8',
  CAD: '#38bdf8',
  AUD: '#a78bfa',
  HKD: '#fbbf24',
  TWD: '#fb923c',
  CNY: '#f87171',
  INR: '#fbbf24',
  KRW: '#c084fc',
  Übrige: '#8b90a0',
}

function fmtEurSigned(v: number): string {
  const abs = Math.abs(Math.round(v)).toLocaleString('de-DE')
  return `${v >= 0 ? '+' : '-'}€ ${abs}`
}

function classifyFactorTilt(score: number): { label: string; tone: 'high' | 'mid' | 'low' | 'neutral' } {
  if (score >= 0.7) return { label: 'Stark übergewichtet', tone: 'high' }
  if (score >= 0.25) return { label: 'Leicht positiv', tone: 'mid' }
  if (score <= -0.25) return { label: 'Untergewichtet', tone: 'low' }
  return { label: 'Neutral', tone: 'neutral' }
}

export const CoreExposureCharts: React.FC<CoreExposureChartsProps> = ({
  exposure,
  targetExposure,
  targetStage,
  scenarioMode,
  onSelectScenario,
  hasPlan12m,
  isSimulated,
}) => {
  const [activeDimTab, setActiveDimTab] = useState<'regions-cap' | 'countries' | 'currencies-factors'>('regions-cap')
  const [countryGroupMode, setCountryGroupMode] = useState<'top' | 'by-region'>('top')

  // 1. Regionen Ist vs. Ziel
  const regionComparison = targetStage.groups.map((group) => {
    const actual = group.regions.reduce((s, r) => s + (exposure.regions[r] || 0), 0)
    const target = group.target
    const diff = actual - target
    const eurGap = (target - actual) * exposure.total
    const inTolerance = Math.abs(diff) <= REGION_TOLERANCE
    return {
      id: group.id,
      label: group.label,
      actual,
      target,
      diff,
      eurGap,
      inTolerance,
      color: REGION_COLORS[group.regions[0]] || '#60a5fa',
    }
  })

  // 2. Market Cap Ist vs. Ziel
  const sizeRows = [
    { key: 'large' as const, label: 'Large Cap', actual: exposure.size.large, target: targetExposure.size.large, color: '#60a5fa' },
    { key: 'mid' as const, label: 'Mid Cap', actual: exposure.size.mid, target: targetExposure.size.mid, color: '#818cf8' },
    { key: 'small' as const, label: 'Small Cap', actual: exposure.size.small, target: targetExposure.size.small, color: '#34d399' },
  ]

  // 3. Länder Ist vs. Ziel
  const allCountryCodes = new Set([
    ...Object.keys(exposure.countries),
    ...Object.keys(targetExposure.countries),
  ])
  const allCountries = Array.from(allCountryCodes)
    .map((code) => {
      const actual = exposure.countries[code] || 0
      const target = targetExposure.countries[code] || 0
      return {
        code,
        name: countryName(code),
        region: regionOf(code),
        actual,
        target,
        diff: actual - target,
      }
    })
    .filter((c) => c.actual > 0.002 || c.target > 0.002)
    .sort((a, b) => Math.max(b.actual, b.target) - Math.max(a.actual, a.target))

  const topCountries = allCountries.slice(0, 10)
  const restCountries = allCountries.slice(10)
  const restCountryTotals =
    restCountries.length > 0
      ? {
          code: 'REST',
          name: `Sonstige (${restCountries.length})`,
          region: 'EM' as RegionKey,
          actual: restCountries.reduce((s, c) => s + c.actual, 0),
          target: restCountries.reduce((s, c) => s + c.target, 0),
          diff: restCountries.reduce((s, c) => s + c.diff, 0),
        }
      : null

  // 4. Währungen Ist vs. Ziel
  const currencyKeys = new Set([
    ...Object.keys(exposure.currencies),
    ...Object.keys(targetExposure.currencies),
  ])
  const currencyList = Array.from(currencyKeys)
    .map((curr) => ({
      name: curr,
      actual: exposure.currencies[curr] || 0,
      target: targetExposure.currencies[curr] || 0,
      color: CURRENCY_COLORS[curr] || '#8b90a0',
    }))
    .filter((c) => c.actual > 0.005 || c.target > 0.005)
    .sort((a, b) => Math.max(b.actual, b.target) - Math.max(a.actual, a.target))

  const scenarioLabel =
    scenarioMode === 'sim'
      ? 'Simulation'
      : scenarioMode === 'plan12m'
      ? 'Nach 12 M Fahrplan'
      : scenarioMode === 'target'
      ? 'Zielzustand'
      : 'Heute'

  return (
    <div className="core-card">
      {/* Karten-Header mit Dimension-Tabs und Szenario-Schalter */}
      <div className="core-card-header">
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Ist vs. Soll ({scenarioLabel})
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Vergleich gegen {targetStage.label.split(':')[0]} (±{(REGION_TOLERANCE * 100).toFixed(0)} %-Punkte Toleranzband)
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="core-segment-tabs" role="tablist" aria-label="Analyse-Dimensionen">
            <button
              type="button"
              role="tab"
              aria-selected={activeDimTab === 'regions-cap'}
              className={`core-segment-tab ${activeDimTab === 'regions-cap' ? 'active' : ''}`}
              onClick={() => setActiveDimTab('regions-cap')}
            >
              Regionen & Cap
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeDimTab === 'countries'}
              className={`core-segment-tab ${activeDimTab === 'countries' ? 'active' : ''}`}
              onClick={() => setActiveDimTab('countries')}
            >
              Länder
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeDimTab === 'currencies-factors'}
              className={`core-segment-tab ${activeDimTab === 'currencies-factors' ? 'active' : ''}`}
              onClick={() => setActiveDimTab('currencies-factors')}
            >
              Währungen & Faktoren
            </button>
          </div>

          <div className="core-scenario-pills" aria-label="Szenario Vorschau">
            <button
              type="button"
              className={`core-scenario-pill ${scenarioMode === 'now' ? 'active' : ''}`}
              onClick={() => onSelectScenario('now')}
            >
              Heute
            </button>
            <button
              type="button"
              className={`core-scenario-pill ${scenarioMode === 'plan12m' ? 'active' : ''}`}
              disabled={!hasPlan12m}
              onClick={() => onSelectScenario('plan12m')}
              title={hasPlan12m ? 'Auswirkung nach 12 Monaten Fahrplan anzeigen' : 'Monatliche Sparrate > 0 € erforderlich'}
            >
              Nach 12 M
            </button>
            <button
              type="button"
              className={`core-scenario-pill ${scenarioMode === 'target' ? 'active' : ''}`}
              onClick={() => onSelectScenario('target')}
            >
              Ziel
            </button>
            {isSimulated && (
              <span className="core-sim-badge">Sim</span>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: Regionen & Market Cap */}
      {activeDimTab === 'regions-cap' && (
        <div className="core-two-col">
          {/* Links: Regionen */}
          <div>
            <div className="core-subpanel-title">Regionen-Verteilung</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {regionComparison.map((r) => {
                const actualPct = r.actual * 100
                const targetPct = r.target * 100
                const diffPct = r.diff * 100
                const bandLeft = Math.max(0, (r.target - REGION_TOLERANCE) * 100)
                const bandRight = Math.min(100, (r.target + REGION_TOLERANCE) * 100)

                return (
                  <div key={r.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.label}</span>
                        {r.inTolerance ? (
                          <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem' }}>
                            <Check size={11} style={{ marginRight: 2 }} /> im Band
                          </span>
                        ) : diffPct > 0 ? (
                          <span style={{ color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem' }}>
                            <ArrowUpRight size={11} style={{ marginRight: 2 }} /> +{diffPct.toFixed(1)} % ÜG
                          </span>
                        ) : (
                          <span style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem' }}>
                            <ArrowDownRight size={11} style={{ marginRight: 2 }} /> {diffPct.toFixed(1)} % UG
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontVariantNumeric: 'tabular-nums' }}>
                        {!r.inTolerance && exposure.total > 0 && (
                          <span style={{ fontSize: '0.72rem', color: r.eurGap > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                            {r.eurGap > 0 ? `Defizit ${fmtEurSigned(r.eurGap)}` : `Überschuss ${fmtEurSigned(r.eurGap)}`}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                          {actualPct.toFixed(1)} %
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                          / {targetPct.toFixed(0)} %
                        </span>
                      </div>
                    </div>

                    <div className="core-bar-track">
                      <div
                        className="core-tolerance-band"
                        style={{ left: `${bandLeft}%`, width: `${Math.max(1, bandRight - bandLeft)}%` }}
                        title={`Toleranzband: ${bandLeft.toFixed(0)}–${bandRight.toFixed(0)} %`}
                      />
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, actualPct)}%`,
                          background: r.color,
                          borderRadius: '7px',
                          transition: 'width 0.3s ease',
                          position: 'relative',
                          zIndex: 1,
                        }}
                      />
                      <div
                        className="core-target-line"
                        style={{ left: `${Math.min(100, targetPct)}%` }}
                        title={`Ziel: ${targetPct.toFixed(1)} %`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Rechts: Market Cap */}
          <div>
            <div className="core-subpanel-title">Market Cap (Large / Mid / Small)</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Ist-Verteilung</div>
                <div className="core-cap-stacked">
                  {sizeRows.map((s) => (
                    <span
                      key={`actual-${s.key}`}
                      style={{ width: `${Math.max(0, s.actual * 100)}%`, background: s.color }}
                      title={`${s.label}: ${(s.actual * 100).toFixed(1)} %`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  Soll ({targetStage.label.split(':')[0]})
                </div>
                <div className="core-cap-stacked" style={{ opacity: 0.72 }}>
                  {sizeRows.map((s) => (
                    <span
                      key={`target-${s.key}`}
                      style={{ width: `${Math.max(0, s.target * 100)}%`, background: s.color }}
                      title={`Soll ${s.label}: ${(s.target * 100).toFixed(1)} %`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sizeRows.map((s) => {
                const actualPct = s.actual * 100
                const targetPct = s.target * 100
                const diffPct = actualPct - targetPct
                const eurGap = (s.target - s.actual) * exposure.total
                return (
                  <div
                    key={s.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color }} />
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontVariantNumeric: 'tabular-nums' }}>
                      {s.key === 'small' && Math.abs(diffPct) > 1.5 && exposure.total > 0 && (
                        <span style={{ fontSize: '0.72rem', color: eurGap > 0 ? 'var(--green)' : 'var(--gold)' }}>
                          {fmtEurSigned(eurGap)}
                        </span>
                      )}
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{actualPct.toFixed(1)} %</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/ {targetPct.toFixed(1)} %</span>
                      <span
                        style={{
                          minWidth: '50px',
                          textAlign: 'right',
                          fontSize: '0.74rem',
                          color: Math.abs(diffPct) <= 2 ? 'var(--green)' : diffPct > 0 ? 'var(--gold)' : 'var(--red)',
                        }}
                      >
                        {diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)} %
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Länder */}
      {activeDimTab === 'countries' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: 8 }}>
            <div className="core-subpanel-title" style={{ marginBottom: 0 }}>
              Länder-Exposure (Ist vs. Soll-Modell)
            </div>
            <div className="core-scenario-pills">
              <button
                type="button"
                className={`core-scenario-pill ${countryGroupMode === 'top' ? 'active' : ''}`}
                onClick={() => setCountryGroupMode('top')}
              >
                Top-Länder
              </button>
              <button
                type="button"
                className={`core-scenario-pill ${countryGroupMode === 'by-region' ? 'active' : ''}`}
                onClick={() => setCountryGroupMode('by-region')}
              >
                Nach Region
              </button>
            </div>
          </div>

          {countryGroupMode === 'top' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...topCountries, ...(restCountryTotals ? [restCountryTotals] : [])].map((c) => {
                const actualPct = c.actual * 100
                const targetPct = c.target * 100
                const diffPct = c.diff * 100
                const isConcentration = c.actual > 0.45 && c.code !== 'REST'

                return (
                  <div className="core-country-row" key={c.code}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 165 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.82rem' }}>{c.name}</span>
                      {c.code !== 'REST' && (
                        <span className="core-region-tag">{c.region}</span>
                      )}
                      {isConcentration && (
                        <span className="core-klumpen-badge">Klumpen</span>
                      )}
                    </div>

                    <div className="core-bar-track" style={{ flex: 1, height: '10px' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, actualPct)}%`,
                          background: REGION_COLORS[c.region] || '#60a5fa',
                          borderRadius: '5px',
                        }}
                      />
                      <div
                        className="core-target-line"
                        style={{ left: `${Math.min(100, targetPct)}%` }}
                        title={`Soll: ${targetPct.toFixed(1)} %`}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 155, justifyContent: 'flex-end', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{actualPct.toFixed(1)} %</span>
                      <span style={{ color: 'var(--text-muted)' }}>/ {targetPct.toFixed(1)} %</span>
                      <span style={{ minWidth: 46, textAlign: 'right', color: Math.abs(diffPct) <= 2 ? 'var(--green)' : diffPct > 0 ? 'var(--gold)' : 'var(--red)' }}>
                        {diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)} %
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {ALL_REGIONS.map((rKey) => {
                const items = allCountries.filter((c) => c.region === rKey)
                if (items.length === 0) return null
                return (
                  <div
                    key={rKey}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: REGION_COLORS[rKey], marginBottom: 8 }}>
                      {REGION_LABELS[rKey]}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {items.slice(0, 6).map((c) => (
                        <div key={c.code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                          <span>
                            <strong>{(c.actual * 100).toFixed(1)} %</strong>
                            <span style={{ color: 'var(--text-muted)', marginLeft: 5 }}>/ {(c.target * 100).toFixed(1)} %</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Währungen & Faktoren */}
      {activeDimTab === 'currencies-factors' && (
        <div className="core-two-col">
          {/* Links: Cashflow-Währungen */}
          <div>
            <div className="core-subpanel-title">Cashflow-Währungen (Ist vs. Soll)</div>
            <div className="core-cap-stacked" style={{ marginBottom: '12px' }}>
              {currencyList.map((c) => (
                <span
                  key={c.name}
                  style={{ width: `${Math.max(0, c.actual * 100)}%`, background: c.color }}
                  title={`${c.name}: ${(c.actual * 100).toFixed(1)} %`}
                />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {currencyList.slice(0, 6).map((c) => (
                <div
                  key={c.name}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color }} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{c.name}</span>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{(c.actual * 100).toFixed(1)} %</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.74rem' }}>
                      / {(c.target * 100).toFixed(1)} %
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rechts: Core-Rollen & Faktor-Ausprägung */}
          <div>
            <div className="core-subpanel-title">Core-Rollen & Faktor-Ausprägung</div>

            {/* Rollen-Verteilung mit 20 %-Cap */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>Markt-Core {(exposure.roleShares.market * 100).toFixed(0)} %</span>
                <span style={{ color: exposure.roleShares.factor > FACTOR_BUDGET_CAP ? 'var(--red)' : 'var(--green)' }}>
                  Faktor {(exposure.roleShares.factor * 100).toFixed(0)} % (Cap 20 %)
                </span>
                <span>Satellit {(exposure.roleShares.cashflow * 100).toFixed(0)} %</span>
              </div>
              <div className="core-bar-track" style={{ height: '10px' }}>
                <div style={{ display: 'flex', height: '100%', width: '100%' }}>
                  <span style={{ width: `${exposure.roleShares.market * 100}%`, background: '#60a5fa' }} />
                  <span style={{ width: `${exposure.roleShares.factor * 100}%`, background: '#f0c040' }} />
                  <span style={{ width: `${exposure.roleShares.cashflow * 100}%`, background: '#a78bfa' }} />
                </div>
              </div>
            </div>

            <div className="core-factor-grid">
              {ALL_FACTORS.map((fKey) => {
                const score = exposure.factors[fKey] || 0
                const info = classifyFactorTilt(score)
                return (
                  <div
                    key={fKey}
                    className={`core-factor-chip tone-${info.tone}`}
                    title={`Z-Score: ${score >= 0 ? '+' : ''}${score.toFixed(2)}`}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{FACTOR_LABELS[fKey]}</span>
                    <span className="core-factor-level">{info.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
