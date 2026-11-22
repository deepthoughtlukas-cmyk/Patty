import React from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck, Target } from 'lucide-react'
import type { CoreExposure, TargetStage } from '../../utils/core/types'
import type { CoreFitSummary } from '../../utils/core/coreExposure'
import { FACTOR_BUDGET_CAP, TARGET_STAGES } from '../../utils/core/targets'

interface CoreKpiHeaderProps {
  exposure: CoreExposure
  baseExposure: CoreExposure
  targetExposure: CoreExposure
  fitSummary: CoreFitSummary
  stocksTotalValue: number
  activeStage: TargetStage
  onSelectStage: (stageId: 'stage2' | 'stage3') => void
  isSimulated: boolean
  onResetSimulation?: () => void
  unmatchedCount: number
  onOpenHoldings: () => void
}

function fmtEur(v: number): string {
  return `€ ${v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)} %`
}

export const CoreKpiHeader: React.FC<CoreKpiHeaderProps> = ({
  exposure,
  baseExposure,
  targetExposure,
  fitSummary,
  stocksTotalValue,
  activeStage,
  onSelectStage,
  isSimulated,
  onResetSimulation,
  unmatchedCount,
  onOpenHoldings,
}) => {
  const coreShareOfStocks = stocksTotalValue > 0 ? exposure.total / stocksTotalValue : 0
  const factorShare = exposure.roleShares.factor
  const isFactorOverBudget = fitSummary.factorOverBudget
  const scoreColor =
    fitSummary.score >= 80 ? 'var(--green)' : fitSummary.score >= 55 ? 'var(--gold)' : 'var(--red)'

  const mainGap = fitSummary.largestOverweight || fitSummary.largestUnderweight
  const gapSummaryText = mainGap
    ? `${mainGap.label} ${mainGap.diff > 0 ? '+' : ''}${(mainGap.diff * 100).toFixed(1)} %`
    : 'Alle Regionen im Zielband'

  const largePct = exposure.size.large * 100
  const midPct = exposure.size.mid * 100
  const smallPct = exposure.size.small * 100
  const smallTargetPct = targetExposure.size.small * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
      {/* Kompakte Steuerleiste */}
      <div className="core-cockpit-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Target size={18} color="var(--gold)" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {activeStage.label}
              </span>
              {isSimulated && (
                <span className="core-sim-badge">
                  Simulation aktiv
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {activeStage.description}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isSimulated && onResetSimulation && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={onResetSimulation}
              style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4 }}
              title="Simulation zurücksetzen"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
          <div className="core-stage-switch">
            {TARGET_STAGES.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`core-stage-btn ${activeStage.id === s.id ? 'active' : ''}`}
                onClick={() => onSelectStage(s.id)}
              >
                {s.label.split(':')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4 kompakte Ampel-KPIs */}
      <div className="core-kpi-grid">
        {/* 1. Core-Fit */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Core-Fit</span>
            <span style={{ fontSize: '0.7rem', color: fitSummary.regionsInBand === fitSummary.totalRegionGroups ? 'var(--green)' : 'var(--text-muted)' }}>
              {fitSummary.regionsInBand}/{fitSummary.totalRegionGroups} Regionen
            </span>
          </div>
          <div className="stat-value" style={{ color: scoreColor }}>
            {fitSummary.score} / 100
          </div>
          <div className="stat-sub">
            {gapSummaryText}
          </div>
        </div>

        {/* 2. Cap-Balance (L / M / S) */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Cap-Balance (L / M / S)</span>
            <span style={{ fontSize: '0.7rem', color: fitSummary.smallCapInBand ? 'var(--green)' : 'var(--gold)' }}>
              SC {smallPct.toFixed(1)}% / {smallTargetPct.toFixed(0)}%
            </span>
          </div>
          <div className="stat-value" style={{ fontSize: '1.15rem' }}>
            {largePct.toFixed(0)} / {midPct.toFixed(0)} / {smallPct.toFixed(0)} %
          </div>
          <div className="core-cap-mini-bar" aria-label="Market Cap Aufteilung">
            <span style={{ width: `${largePct}%`, background: '#60a5fa' }} title={`Large: ${largePct.toFixed(1)} %`} />
            <span style={{ width: `${midPct}%`, background: '#818cf8' }} title={`Mid: ${midPct.toFixed(1)} %`} />
            <span style={{ width: `${smallPct}%`, background: '#34d399' }} title={`Small: ${smallPct.toFixed(1)} %`} />
          </div>
        </div>

        {/* 3. Faktor-Budget & TER */}
        <div
          className="stat-card"
          style={{
            borderColor: isFactorOverBudget ? 'rgba(248, 113, 113, 0.35)' : 'rgba(74, 222, 128, 0.25)',
          }}
        >
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Faktor-Budget (Cap {(FACTOR_BUDGET_CAP * 100).toFixed(0)} %)</span>
            {isFactorOverBudget ? (
              <AlertTriangle size={13} color="var(--red)" />
            ) : (
              <CheckCircle2 size={13} color="var(--green)" />
            )}
          </div>
          <div className="stat-value" style={{ color: isFactorOverBudget ? 'var(--red)' : 'var(--green)' }}>
            {fmtPct(factorShare)}
          </div>
          <div className="stat-sub">
            Ø TER {exposure.ter.toFixed(2)} % · {isFactorOverBudget ? 'Über 20 %-Limit' : 'Im Budget'}
          </div>
        </div>

        {/* 4. Core-Wert & Datenbasis */}
        <div className="stat-card">
          <div className="stat-label">Core-Wert & Basis</div>
          <div className="stat-value">{fmtEur(exposure.total)}</div>
          <div className="stat-sub" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
            <span>
              {fmtPct(coreShareOfStocks)} von Stocks
              {isSimulated && (
                <span style={{ color: 'var(--gold)', marginLeft: 5 }}>
                  ({exposure.total >= baseExposure.total ? '+' : ''}{fmtEur(exposure.total - baseExposure.total)})
                </span>
              )}
            </span>
            {unmatchedCount > 0 ? (
              <button
                type="button"
                className="core-inline-warn-btn"
                onClick={onOpenHoldings}
                title="Unbekannte Core-ETFs anzeigen"
              >
                <AlertTriangle size={11} />
                {unmatchedCount} ohne Profil
              </button>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}>
                <ShieldCheck size={12} />
                {(exposure.coverage * 100).toFixed(0)} % Look-Through
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
