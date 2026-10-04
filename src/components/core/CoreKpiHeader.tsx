import React from 'react'
import { AlertTriangle, CheckCircle2, Sliders, ShieldCheck } from 'lucide-react'
import type { CoreExposure, TargetStage } from '../../utils/core/types'
import { FACTOR_BUDGET_CAP, TARGET_STAGES } from '../../utils/core/targets'

interface CoreKpiHeaderProps {
  exposure: CoreExposure
  baseExposure: CoreExposure
  stocksTotalValue: number
  activeStage: TargetStage
  onSelectStage: (stageId: 'stage2' | 'stage3') => void
  isSimulated: boolean
}

function fmtEur(v: number): string {
  return `€ ${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)} %`
}

export const CoreKpiHeader: React.FC<CoreKpiHeaderProps> = ({
  exposure,
  baseExposure,
  stocksTotalValue,
  activeStage,
  onSelectStage,
  isSimulated,
}) => {
  const coreShareOfStocks = stocksTotalValue > 0 ? exposure.total / stocksTotalValue : 0
  const factorShare = exposure.roleShares.factor
  const isFactorOverBudget = factorShare > FACTOR_BUDGET_CAP
  const factorDiffToCap = factorShare - FACTOR_BUDGET_CAP

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
      {/* Oberste Leiste: Strategie-Umschalter & Simulations-Indikator */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--bg-card)',
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Sliders size={18} color="var(--gold)" />
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ziel-Strategie (Whitepaper)
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {activeStage.label}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {TARGET_STAGES.map((s) => (
            <button
              key={s.id}
              className={`btn btn-sm ${activeStage.id === s.id ? '' : 'btn-ghost'}`}
              style={{
                background: activeStage.id === s.id ? 'var(--gold)' : undefined,
                color: activeStage.id === s.id ? '#000' : 'var(--text-secondary)',
                fontWeight: activeStage.id === s.id ? 700 : 500,
                border: activeStage.id === s.id ? 'none' : '1px solid var(--border)',
              }}
              onClick={() => onSelectStage(s.id)}
            >
              {s.label.split(':')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {/* Core Gesamtwert */}
        <div className="stat-card">
          <div className="stat-label">Core Gesamtwert</div>
          <div className="stat-value">{fmtEur(exposure.total)}</div>
          <div className="stat-sub">
            {fmtPct(coreShareOfStocks)} der Aktienquote
            {isSimulated && (
              <span style={{ color: 'var(--gold)', marginLeft: 6 }}>
                ({exposure.total >= baseExposure.total ? '+' : ''}{fmtEur(exposure.total - baseExposure.total)})
              </span>
            )}
          </div>
        </div>

        {/* Faktor-Budget (20 % Cap) */}
        <div
          className="stat-card"
          style={{
            borderColor: isFactorOverBudget ? 'rgba(248, 113, 113, 0.4)' : 'rgba(74, 222, 128, 0.3)',
            background: isFactorOverBudget ? 'rgba(248, 113, 113, 0.05)' : undefined,
          }}
        >
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Faktor-Budget (Max. 20 %)</span>
            {isFactorOverBudget ? (
              <AlertTriangle size={14} color="var(--red)" />
            ) : (
              <CheckCircle2 size={14} color="var(--green)" />
            )}
          </div>
          <div
            className="stat-value"
            style={{ color: isFactorOverBudget ? 'var(--red)' : 'var(--green)' }}
          >
            {fmtPct(factorShare)}
          </div>
          <div className="stat-sub">
            {isFactorOverBudget ? (
              <span style={{ color: 'var(--red)' }}>
                +{fmtPct(factorDiffToCap)} über 20 %-Cap
              </span>
            ) : (
              <span style={{ color: 'var(--green)' }}>Im Rahmen des Whitepapers (≤ 20 %)</span>
            )}
          </div>
        </div>

        {/* Small-Cap Quote (Size-Faktor) */}
        <div className="stat-card">
          <div className="stat-label">Small-Cap Quote</div>
          <div className="stat-value">{fmtPct(exposure.size.small)}</div>
          <div className="stat-sub">
            Ziel (Stufe 3): ~14 %
            <span style={{ marginLeft: 6, color: exposure.size.small >= 0.12 ? 'var(--green)' : 'var(--text-muted)' }}>
              ({(exposure.size.small * 100).toFixed(1)} / 14,0 %)
            </span>
          </div>
        </div>

        {/* Abdeckungsgrad */}
        <div className="stat-card">
          <div className="stat-label">Profil-Abdeckung</div>
          <div className="stat-value" style={{ color: exposure.coverage >= 0.9 ? 'var(--green)' : 'var(--gold)' }}>
            {fmtPct(exposure.coverage)}
          </div>
          <div className="stat-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={12} color="var(--text-muted)" />
            <span>{fmtEur(exposure.covered)} mit Look-Through</span>
          </div>
        </div>
      </div>
    </div>
  )
}
