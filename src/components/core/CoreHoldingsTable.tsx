import React from 'react'
import { Eye, HelpCircle } from 'lucide-react'
import type { CorePosition, CoreProfile, CoreRole } from '../../utils/core/types'

interface CoreHoldingsTableProps {
  positions: CorePosition[]
  totalValue: number
  onRoleChange: (profileId: string, role: CoreRole) => void
  onInspectProfile: (profile: CoreProfile) => void
}

function fmtEur(v: number): string {
  return `€ ${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const CoreHoldingsTable: React.FC<CoreHoldingsTableProps> = ({
  positions,
  totalValue,
  onRoleChange,
  onInspectProfile,
}) => {
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
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Core-Holdings & Profil-Zuordnung
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Übersicht der Core-ETFs mit zugeordnetem Look-Through Profil und Einstufung laut Leitfaden.
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="holdings-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Instrument</th>
              <th style={{ textAlign: 'right' }}>Wert</th>
              <th style={{ textAlign: 'right' }}>Anteil</th>
              <th>Zugeordnetes Profil</th>
              <th>Rolle laut Leitfaden</th>
              <th style={{ textAlign: 'right' }}>TER</th>
              <th style={{ textAlign: 'center' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const share = totalValue > 0 ? (pos.value / totalValue) * 100 : 0
              const p = pos.profile

              return (
                <tr key={pos.key}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pos.name}</div>
                    {p && p.isins[0] && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.isins[0]}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(pos.value)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {share.toFixed(1)} %
                  </td>
                  <td>
                    {p ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{p.name}</span>
                        {p.confidence === 'whitepaper' && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              background: 'rgba(74, 222, 128, 0.15)',
                              color: 'var(--green)',
                              padding: '1px 5px',
                              borderRadius: '4px',
                            }}
                            title="Exakter Baustein aus dem Whitepaper-Baukasten"
                          >
                            Whitepaper
                          </span>
                        )}
                        {p.confidence === 'estimated' && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              background: 'rgba(240, 192, 64, 0.15)',
                              color: 'var(--gold)',
                              padding: '1px 5px',
                              borderRadius: '4px',
                            }}
                            title="Depot-Position des Anwenders (Profil geschätzt)"
                          >
                            Depot
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--red)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <HelpCircle size={12} /> Nicht zugeordnet
                      </span>
                    )}
                  </td>
                  <td>
                    {p ? (
                      <select
                        value={pos.role}
                        onChange={(e) => onRoleChange(p.id, e.target.value as CoreRole)}
                        style={{
                          background: 'var(--bg-surface)',
                          color: pos.role === 'factor' ? 'var(--gold)' : pos.role === 'cashflow' ? 'var(--purple)' : 'var(--text-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.78rem',
                          padding: '3px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="market">Markt-/Regionen-Core</option>
                        <option value="factor">Faktor-Budget (Cap 20 %)</option>
                        <option value="cashflow">Dividenden-Satellit</option>
                      </select>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {p && typeof p.ter === 'number' ? `${p.ter.toFixed(2)} %` : '-'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {p && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => onInspectProfile(p)}
                        style={{ padding: '3px 8px' }}
                        title="Profil & Länder-Breakdown ansehen"
                      >
                        <Eye size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
