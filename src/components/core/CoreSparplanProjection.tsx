import React, { useState, useMemo, useCallback, useEffect } from 'react'
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
  Calendar,
  CheckCircle2,
  Clock,
  Sliders,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'
import type { CorePosition, TargetStage } from '../../utils/core/types'
import {
  optimizeExistingCoreSparplan,
  projectSparplanTimeline,
  type SparplanItem,
} from '../../utils/core/coreOptimizer'
import {
  loadCoreSparplanConfig,
  saveCoreSparplanConfig,
} from '../../utils/core/profileStore'

interface CoreSparplanProjectionProps {
  positions: CorePosition[]
  targetStage: TargetStage
  initialMonthlyBudget?: number
  onApplyToSimulator?: (deltas: Record<string, number>) => void
}

function fmtEur(v: number): string {
  return `€ ${v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)} %`
}

export const CoreSparplanProjection: React.FC<CoreSparplanProjectionProps> = ({
  positions,
  targetStage,
  initialMonthlyBudget = 1000,
  onApplyToSimulator,
}) => {
  // Gespeicherte Konfiguration laden
  const savedConfig = useMemo(() => loadCoreSparplanConfig(), [])

  // 1. Sparrate State
  const initialBudget =
    savedConfig?.monthlyBudget && savedConfig.monthlyBudget > 0
      ? savedConfig.monthlyBudget
      : Math.max(50, initialMonthlyBudget)

  const [monthlyBudget, setMonthlyBudget] = useState<number>(initialBudget)
  const [budgetInput, setBudgetInput] = useState<string>(String(initialBudget))
  const [maxPositions, setMaxPositions] = useState<number>(() => savedConfig?.maxPositions ?? 4)
  const [copied, setCopied] = useState(false)
  const [projectionHorizon, setProjectionHorizon] = useState<number>(() => savedConfig?.projectionHorizon ?? 36)

  // 2. Verfügbare vorhandene Core-ETFs
  const availablePositions = useMemo(
    () => positions.filter((p) => p.profile !== null && p.value > 0),
    [positions]
  )

  // 3. Ausgewählte Positionen (Key-Set)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    if (savedConfig?.selectedKeys && savedConfig.selectedKeys.length > 0) {
      const valid = savedConfig.selectedKeys.filter((k) => positions.some((p) => p.key === k))
      if (valid.length > 0) return new Set(valid)
    }
    // Initial: Top 4 automatisch wählen
    const auto = optimizeExistingCoreSparplan(availablePositions, targetStage, initialBudget, { maxPositions: 4 })
    return new Set(auto.map((a) => a.key))
  })

  // Manuelle Beträge je Position (falls vom Nutzer überschrieben)
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>(() => {
    return savedConfig?.customAmounts ?? {}
  })

  // Automatische Persistenz aller manuell angepassten Werte
  useEffect(() => {
    saveCoreSparplanConfig({
      monthlyBudget,
      selectedKeys: Array.from(selectedKeys),
      customAmounts,
      projectionHorizon,
      maxPositions,
    })
  }, [monthlyBudget, selectedKeys, customAmounts, projectionHorizon, maxPositions])

  // Automatische Neuberechnung der Verteilung
  const handleAutoOptimize = useCallback(() => {
    const auto = optimizeExistingCoreSparplan(availablePositions, targetStage, monthlyBudget, {
      maxPositions,
    })
    const newKeys = new Set(auto.map((a) => a.key))
    setSelectedKeys(newKeys)

    const amounts: Record<string, number> = {}
    for (const item of auto) {
      amounts[item.key] = item.amount
    }
    setCustomAmounts(amounts)
  }, [availablePositions, targetStage, monthlyBudget, maxPositions])

  // Toggle für ETF-Auswahl (maximal 4 Positionen erlaubt)
  const handleToggleKey = useCallback(
    (key: string) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          if (next.size >= maxPositions) {
            alert(`Es können maximal ${maxPositions} Positionen pro Monat als Sparplan modelliert werden.`)
            return prev
          }
          next.add(key)
        }
        return next
      })
    },
    [maxPositions]
  )

  // 4. Aktive Sparplan-Items zusammenstellen
  const sparplanItems: SparplanItem[] = useMemo(() => {
    if (availablePositions.length === 0 || monthlyBudget <= 0) return []

    const keysArray = Array.from(selectedKeys)
    // Wenn der Nutzer schon individuelle Beträge eingestellt hat, diese nutzen
    const hasCustom = keysArray.some((k) => customAmounts[k] !== undefined)

    if (hasCustom) {
      return keysArray
        .map((key) => {
          const pos = availablePositions.find((p) => p.key === key)
          if (!pos || !pos.profile) return null
          const amt = customAmounts[key] ?? Math.round(monthlyBudget / Math.max(1, keysArray.length))
          return {
            key,
            profileId: pos.profile.id,
            name: pos.name,
            isin: pos.profile.isins[0] || '',
            amount: amt,
            shareOfBudget: monthlyBudget > 0 ? amt / monthlyBudget : 0,
            reason: 'Ausgewählter Sparplan-Baustein',
            enabled: true,
          }
        })
        .filter((item): item is SparplanItem => item !== null)
    }

    // Sonst automatisch über Defizite berechnen
    return optimizeExistingCoreSparplan(availablePositions, targetStage, monthlyBudget, {
      maxPositions,
      selectedKeys: keysArray,
    })
  }, [availablePositions, targetStage, monthlyBudget, selectedKeys, customAmounts, maxPositions])

  const totalAllocated = sparplanItems.reduce((s, i) => s + i.amount, 0)

  // Betrag für einzelnen Sparplan anpassen
  const handleAmountChange = useCallback((key: string, val: number) => {
    setCustomAmounts((prev) => ({
      ...prev,
      [key]: Math.max(0, val),
    }))
  }, [])

  // 5. Zeitreihen-Projektion berechnen
  const projection = useMemo(() => {
    return projectSparplanTimeline(availablePositions, sparplanItems, targetStage, projectionHorizon)
  }, [availablePositions, sparplanItems, targetStage, projectionHorizon])

  // Diagramm-Daten formatieren
  const chartData = useMemo(() => {
    return projection.timeline.map((p) => ({
      month: `M ${p.month}`,
      Monat: p.month,
      US: Number((p.usShare * 100).toFixed(1)),
      Europa: Number((p.euShare * 100).toFixed(1)),
      EM: Number((p.emShare * 100).toFixed(1)),
      SmallCap: Number((p.smallCapShare * 100).toFixed(1)),
      Wert: Math.round(p.totalValue),
    }))
  }, [projection.timeline])

  // Copy Orderliste
  const handleCopy = () => {
    const text = sparplanItems
      .map((s) => `Sparplan: ${fmtEur(s.amount)}/Monat -> ${s.name} (${s.isin})`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Übernahme in den What-If Simulator (z. B. auf 12 Monate projiziert)
  const handleApplyToSimulator = (monthsCount = 12) => {
    if (!onApplyToSimulator) return
    const deltas: Record<string, number> = {}
    for (const item of sparplanItems) {
      deltas[item.key] = item.amount * monthsCount
    }
    onApplyToSimulator(deltas)
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        padding: '24px',
        marginBottom: '24px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={20} color="var(--gold)" />
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Core Sparplan-Modellierung & Ziel-Projektion
            </span>
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Wähle bis zu 4 deiner vorhandenen ETFs als monatlichen Sparplan aus und sieh in der Projektion, nach wie vielen Monaten du dein Regionen- und Size-Ziel erreichst.
          </div>
        </div>

        {/* Sparrate & Obergrenze */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Monatliche Sparrate:</span>
            <input
              type="number"
              min={0}
              step={25}
              value={budgetInput}
              onChange={(e) => {
                const val = e.target.value
                setBudgetInput(val)
                const num = parseFloat(val)
                if (!isNaN(num) && num >= 0) {
                  setMonthlyBudget(num)
                } else if (val === '') {
                  setMonthlyBudget(0)
                }
              }}
              onBlur={() => {
                const num = parseFloat(budgetInput)
                if (isNaN(num) || num < 0) {
                  setBudgetInput('0')
                  setMonthlyBudget(0)
                } else {
                  setBudgetInput(String(num))
                  setMonthlyBudget(num)
                }
              }}
              style={{
                width: '100px',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 8px',
                fontSize: '0.9rem',
                fontWeight: 700,
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>€</span>
          </div>

          <button
            className="btn btn-sm btn-ghost"
            style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => {
              handleAutoOptimize()
              setBudgetInput(String(monthlyBudget))
            }}
            title="Wählt automatisch die bis zu 4 wirksamsten Positionen und verteilt das Budget optimal"
          >
            <Sparkles size={13} />
            Auto-Optimieren
          </button>
        </div>
      </div>

      {/* 1. Meilenstein-Cards: Nach wie vielen Monaten ist das Ziel erreicht? */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Regionen-Ziel */}
        <div
          className="stat-card"
          style={{
            borderColor: projection.monthsToRegionTarget !== null ? 'rgba(74, 222, 128, 0.4)' : 'rgba(240, 192, 64, 0.3)',
            background: 'var(--bg-surface)',
          }}
        >
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} color="var(--blue)" />
            <span>Regionen-Ziel</span>
          </div>
          <div
            className="stat-value"
            style={{ color: projection.monthsToRegionTarget !== null ? 'var(--green)' : 'var(--gold)' }}
          >
            {projection.monthsToRegionTarget === 0
              ? 'Bereits im Band'
              : projection.monthsToRegionTarget !== null
              ? `In ${projection.monthsToRegionTarget} Monaten`
              : `> ${projectionHorizon} Monate`}
          </div>
          <div className="stat-sub">
            {projection.monthsToRegionTarget !== null && projection.monthsToRegionTarget > 0 ? (
              <span>(~{(projection.monthsToRegionTarget / 12).toFixed(1)} Jahre mit {fmtEur(monthlyBudget)}/Monat)</span>
            ) : (
              <span>Toleranzband: ±3 %-Punkte laut {targetStage.label.split(':')[0]}</span>
            )}
          </div>
        </div>

        {/* Size-Faktor (Small Caps) Ziel */}
        <div
          className="stat-card"
          style={{
            borderColor: projection.monthsToSizeTarget !== null ? 'rgba(74, 222, 128, 0.4)' : 'rgba(240, 192, 64, 0.3)',
            background: 'var(--bg-surface)',
          }}
        >
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={14} color="var(--green)" />
            <span>Size-Faktor Ziel (Small Caps)</span>
          </div>
          <div
            className="stat-value"
            style={{ color: projection.monthsToSizeTarget !== null ? 'var(--green)' : 'var(--gold)' }}
          >
            {targetStage.id === 'stage2'
              ? 'Kein SC-Ziel (Stufe 2)'
              : projection.monthsToSizeTarget === 0
              ? 'Bereits im Band'
              : projection.monthsToSizeTarget !== null
              ? `In ${projection.monthsToSizeTarget} Monaten`
              : `> ${projectionHorizon} Monate`}
          </div>
          <div className="stat-sub">
            {targetStage.id === 'stage3' ? (
              <span>Ziel: ~14 % dedizierte Small-Cap Quote</span>
            ) : (
              <span>Stufe 2 Standard fokussiert Large/Mid</span>
            )}
          </div>
        </div>

        {/* Gesamtziel (Beide Ziele erreicht) */}
        <div
          className="stat-card"
          style={{
            borderColor: projection.monthsToAllTargets !== null ? 'rgba(74, 222, 128, 0.6)' : 'rgba(255, 255, 255, 0.1)',
            background: projection.monthsToAllTargets !== null ? 'rgba(74, 222, 128, 0.05)' : 'var(--bg-surface)',
          }}
        >
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} color="var(--gold)" />
            <span>Gesamtziel (Regionen & Size)</span>
          </div>
          <div
            className="stat-value"
            style={{ color: projection.monthsToAllTargets !== null ? 'var(--green)' : 'var(--text-primary)' }}
          >
            {projection.monthsToAllTargets === 0
              ? 'Vollständig erreicht'
              : projection.monthsToAllTargets !== null
              ? `In ${projection.monthsToAllTargets} Monaten`
              : `> ${projectionHorizon} Monate`}
          </div>
          <div className="stat-sub">
            {projection.monthsToAllTargets !== null ? (
              <span style={{ color: 'var(--green)' }}>
                Investition bis Ziel: {fmtEur(projection.monthsToAllTargets * monthlyBudget)}
              </span>
            ) : (
              <span>Erhöhe Sparrate oder passe Sparplan-ETFs an</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Auswahl der vorhandenen ETFs (Bis zu 4 Positionen) */}
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Sparplan-Zusammenstellung (Vorhandene Core-ETFs)
          </div>
          <div style={{ fontSize: '0.8rem', color: selectedKeys.size <= maxPositions ? 'var(--text-muted)' : 'var(--red)' }}>
            Ausgewählt: <strong style={{ color: 'var(--gold)' }}>{selectedKeys.size}</strong> von max. {maxPositions} Positionen
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
          {availablePositions.map((pos) => {
            const isChecked = selectedKeys.has(pos.key)
            const sparplanItem = sparplanItems.find((s) => s.key === pos.key)
            const itemAmount = sparplanItem ? sparplanItem.amount : 0

            return (
              <div
                key={pos.key}
                style={{
                  background: isChecked ? 'rgba(240, 192, 64, 0.05)' : 'var(--bg-card)',
                  border: isChecked ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleKey(pos.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                        {pos.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Ist: {fmtEur(pos.value)} · {pos.profile?.isins[0] || 'ETF'}
                      </div>
                    </div>
                  </label>

                  {isChecked && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        min={0}
                        step={25}
                        value={itemAmount}
                        onChange={(e) => {
                          const val = e.target.value
                          const num = val === '' ? 0 : parseFloat(val)
                          handleAmountChange(pos.key, isNaN(num) ? 0 : Math.max(0, num))
                        }}
                        style={{
                          width: '75px',
                          background: 'var(--bg-surface)',
                          color: 'var(--gold)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '3px 6px',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>€</span>
                    </div>
                  )}
                </div>

                {isChecked && sparplanItem?.reason && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', paddingLeft: '22px' }}>
                    💡 {sparplanItem.reason}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Budget-Zusammenfassung & Aktionen */}
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '0.84rem',
          }}
        >
          <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>
              Verteilt: <strong>{fmtEur(totalAllocated)}</strong> von <strong>{fmtEur(monthlyBudget)}</strong> / Monat
            </span>
            {Math.abs(monthlyBudget - totalAllocated) > 1 && (
              <>
                <span style={{ color: 'var(--gold)' }}>
                  (Differenz: {fmtEur(monthlyBudget - totalAllocated)})
                </span>
                {totalAllocated > 0 && (
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: '0.74rem', color: 'var(--gold)', padding: '2px 8px' }}
                    onClick={() => {
                      setMonthlyBudget(totalAllocated)
                      setBudgetInput(String(totalAllocated))
                    }}
                    title="Passt die monatliche Sparrate an die Summe der konfigurierten Beträge an"
                  >
                    Sparrate auf {fmtEur(totalAllocated)} anpassen
                  </button>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={handleCopy}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {copied ? <Check size={12} color="var(--green)" /> : <Copy size={12} />}
              <span>{copied ? 'Kopiert!' : 'Sparplan kopieren'}</span>
            </button>
            {onApplyToSimulator && (
              <button
                className="btn btn-sm"
                style={{ background: 'var(--gold)', color: '#000', fontWeight: 600 }}
                onClick={() => handleApplyToSimulator(12)}
                title="Überträgt 12 Monate dieses Sparplans in die Schieberegler des Simulators"
              >
                12-Monate in Simulator übertragen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Recharts Projektions-Chart: Zeitverlauf der Exposures */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Entwicklung über Zeit (Monat 0 bis {projectionHorizon})
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Verfolge, wie der US-Klumpen durch monatliche Sparraten verdünnt wird und Schwellenländer sowie Small Caps ihre Zielquote erreichen.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Zeithorizont:</span>
            {[24, 36, 60].map((h) => (
              <button
                key={h}
                className={`btn btn-sm ${projectionHorizon === h ? '' : 'btn-ghost'}`}
                style={{
                  fontSize: '0.74rem',
                  padding: '2px 8px',
                  background: projectionHorizon === h ? 'var(--gold)' : undefined,
                  color: projectionHorizon === h ? '#000' : 'var(--text-secondary)',
                }}
                onClick={() => setProjectionHorizon(h)}
              >
                {h} M (~{(h / 12).toFixed(0)} J)
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: '260px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis
                unit=" %"
                domain={[0, 'auto']}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              />
              <Tooltip
                formatter={(v: any, name: string) => [`${v} %`, name]}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />

              {/* Linien für zentrale Bausteine */}
              <Line
                type="monotone"
                dataKey="US"
                name="USA Quote"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="EM"
                name="Schwellenländer"
                stroke="#fb923c"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Europa"
                name="Europa"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
              />
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

              {/* Referenzlinien für Ziele */}
              <ReferenceLine
                y={targetStage.id === 'stage2' ? 40 : 42}
                stroke="#60a5fa"
                strokeDasharray="3 3"
                label={{ value: 'US-Ziel', fill: '#60a5fa', fontSize: 10, position: 'right' }}
              />
              <ReferenceLine
                y={targetStage.id === 'stage2' ? 20 : 16}
                stroke="#fb923c"
                strokeDasharray="3 3"
                label={{ value: 'EM-Ziel', fill: '#fb923c', fontSize: 10, position: 'right' }}
              />
              {targetStage.id === 'stage3' && (
                <ReferenceLine
                  y={14}
                  stroke="#fcd34d"
                  strokeDasharray="3 3"
                  label={{ value: 'SC-Ziel (14 %)', fill: '#fcd34d', fontSize: 10, position: 'right' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
