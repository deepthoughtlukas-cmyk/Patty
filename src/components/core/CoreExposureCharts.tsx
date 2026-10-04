import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts'
import { Check, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import type { CoreExposure, TargetStage } from '../../utils/core/types'
import { FACTOR_LABELS, ALL_FACTORS } from '../../utils/core/countries'
import { REGION_TOLERANCE } from '../../utils/core/targets'

interface CoreExposureChartsProps {
  exposure: CoreExposure
  baseExposure: CoreExposure
  targetStage: TargetStage
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

export const CoreExposureCharts: React.FC<CoreExposureChartsProps> = ({
  exposure,
  baseExposure,
  targetStage,
  isSimulated,
}) => {
  // 1. Regionen-Daten für den Vergleich Ist vs. Ziel
  const regionComparison = targetStage.groups.map((group) => {
    const curVal = group.regions.reduce((s, r) => s + (exposure.regions[r] || 0), 0)
    const baseVal = group.regions.reduce((s, r) => s + (baseExposure.regions[r] || 0), 0)
    const targetVal = group.target
    const diff = curVal - targetVal
    const inTolerance = Math.abs(diff) <= REGION_TOLERANCE

    return {
      id: group.id,
      label: group.label,
      actual: curVal,
      baseActual: baseVal,
      target: targetVal,
      diff,
      inTolerance,
      color: REGION_COLORS[group.regions[0]] || '#60a5fa',
    }
  })

  // 2. Währungen (Top 6 + Übrige)
  const currencyList = Object.entries(exposure.currencies)
    .filter(([_, share]) => share > 0.005)
    .map(([curr, share]) => ({
      name: curr,
      value: share,
      color: CURRENCY_COLORS[curr] || '#8b90a0',
    }))
    .sort((a, b) => b.value - a.value)

  // 3. Size-Verteilung (Large, Mid, Small)
  const sizeData = [
    { name: 'Large Cap', share: exposure.size.large, color: '#60a5fa' },
    { name: 'Mid Cap', share: exposure.size.mid, color: '#818cf8' },
    { name: 'Small Cap', share: exposure.size.small, color: '#34d399' },
  ]

  // 4. Faktoren
  const factorData = ALL_FACTORS.map((fKey) => ({
    name: FACTOR_LABELS[fKey],
    score: exposure.factors[fKey] || 0,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
      {/* 1. Regionen Ist vs. Whitepaper-Ziel */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Regionen-Verteilung: Ist {isSimulated ? '(Simuliert)' : ''} vs. {targetStage.label.split(':')[0]}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Toleranzband: ±{(REGION_TOLERANCE * 100).toFixed(0)} %-Punkte laut Modell
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {regionComparison.map((r) => {
            const actualPct = r.actual * 100
            const targetPct = r.target * 100
            const diffPct = r.diff * 100

            return (
              <div key={r.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.label}</span>
                    {r.inTolerance ? (
                      <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}>
                        <Check size={12} style={{ marginRight: 2 }} /> im Band
                      </span>
                    ) : diffPct > 0 ? (
                      <span style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}>
                        <ArrowUpRight size={12} style={{ marginRight: 2 }} /> +{diffPct.toFixed(1)} % ÜG
                      </span>
                    ) : (
                      <span style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}>
                        <ArrowDownRight size={12} style={{ marginRight: 2 }} /> {diffPct.toFixed(1)} % UG
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {actualPct.toFixed(1)} %
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Ziel: {targetPct.toFixed(0)} %
                    </span>
                  </div>
                </div>

                {/* Doppelter Balken: Actual vs Target */}
                <div
                  style={{
                    position: 'relative',
                    height: '14px',
                    background: 'var(--bg-surface)',
                    borderRadius: '7px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, actualPct)}%`,
                      background: r.color,
                      borderRadius: '7px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                  {/* Markierung des Zielwerts */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${Math.min(100, targetPct)}%`,
                      width: '2px',
                      background: '#fff',
                      boxShadow: '0 0 4px #000',
                      zIndex: 2,
                    }}
                    title={`Ziel: ${targetPct.toFixed(1)} %`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Grid: Währungen, Size & Faktoren */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {/* Währungs Look-Through */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            padding: '18px',
          }}
        >
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Währungs Look-Through
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Reale Cashflow-Währung der Assets (unabhängig von der Handelswährung EUR).
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '130px', height: '130px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={currencyList}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={35}
                    outerRadius={55}
                    paddingAngle={2}
                  >
                    {currencyList.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => [`${((Number(v) || 0) * 100).toFixed(1)} %`, 'Anteil']}
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {currencyList.slice(0, 5).map((c) => (
                <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                    <span style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {(c.value * 100).toFixed(1)} %
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Size-Faktor (Large vs Mid vs Small) */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            padding: '18px',
          }}
        >
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Size-Faktor Verteilung
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Whitepaper Stufe 3 fordert gezielt ~14 % dedizierte Small-Caps.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sizeData.map((s) => (
              <div key={s.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                  <span style={{ fontWeight: 600, color: s.color }}>
                    {(s.share * 100).toFixed(1)} %
                  </span>
                </div>
                <div
                  style={{
                    height: '8px',
                    background: 'var(--bg-surface)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, s.share * 100)}%`,
                      background: s.color,
                      borderRadius: '4px',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Faktor-Scores (-2 bis +2) */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            padding: '18px',
          }}
        >
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Faktor-Tilts (Z-Scores)
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Abweichung zum neutralen Weltaktienmarkt (0 = neutral).
          </div>

          <div style={{ height: '140px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={factorData} layout="vertical" margin={{ top: 0, right: 10, left: 35, bottom: 0 }}>
                <XAxis type="number" domain={[-1.5, 2]} hide />
                <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip
                  formatter={(v: any) => [Number(v).toFixed(2), 'Tilt']}
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {factorData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.score > 0.5 ? 'var(--gold)' : entry.score > 0 ? 'var(--blue)' : '#8b90a0'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
