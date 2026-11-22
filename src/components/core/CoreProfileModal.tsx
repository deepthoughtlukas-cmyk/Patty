import React from 'react'
import { X, Globe, Layers, BarChart2 } from 'lucide-react'
import type { CoreProfile } from '../../utils/core/types'
import { countryName, FACTOR_LABELS, ALL_FACTORS } from '../../utils/core/countries'

interface CoreProfileModalProps {
  profile: CoreProfile | null
  onClose: () => void
}

export const CoreProfileModal: React.FC<CoreProfileModalProps> = ({ profile, onClose }) => {
  if (!profile) return null

  const countriesSorted = Object.entries(profile.countries)
    .filter(([_, val]) => val > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '600px', width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {profile.name}
            </div>
            {profile.isins[0] && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                ISIN: {profile.isins.join(', ')}
              </div>
            )}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Metadaten */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            background: 'var(--bg-surface)',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '18px',
            fontSize: '0.82rem',
          }}
        >
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Rolle:</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {profile.role === 'factor'
                ? 'Faktor-ETF (Cap 20 %)'
                : profile.role === 'cashflow'
                  ? 'Dividenden-Satellit'
                  : profile.role === 'satellite'
                    ? `Beimischung / Satellit${typeof profile.maxCoreWeight === 'number' ? ` (Cap ${(profile.maxCoreWeight * 100).toFixed(0)} %)` : ''}`
                    : 'Markt-Core'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>TER:</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {typeof profile.ter === 'number' ? `${profile.ter.toFixed(2)} %` : 'N/A'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Stand (asOf):</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{profile.asOf || 'N/A'}</div>
          </div>
        </div>

        {profile.note && (
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--gold)',
              background: 'rgba(240, 192, 64, 0.08)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
            }}
          >
            Hinweis: {profile.note}
          </div>
        )}

        {/* Länder Look-Through */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Globe size={14} color="var(--blue)" />
            <span>Länder Look-Through</span>
          </div>

          <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {countriesSorted.map(([code, share]) => (
              <div key={code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {countryName(code)} ({code})
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {share.toFixed(1)} %
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Size Split */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers size={14} color="var(--green)" />
            <span>Marktkapitalisierung (Size)</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem' }}>
            <div>Large: <strong>{profile.size.large} %</strong></div>
            <div>Mid: <strong>{profile.size.mid} %</strong></div>
            <div>Small: <strong>{profile.size.small} %</strong></div>
          </div>
        </div>

        {/* Faktoren */}
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart2 size={14} color="var(--gold)" />
            <span>Faktor-Loadings</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {ALL_FACTORS.map((fKey) => {
              const val = profile.factors[fKey]
              if (val === undefined || Math.abs(val) < 0.1) return null
              return (
                <span
                  key={fKey}
                  style={{
                    fontSize: '0.78rem',
                    background: val > 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                    color: val > 0 ? 'var(--green)' : 'var(--red)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  {FACTOR_LABELS[fKey]}: {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                </span>
              )
            })}
            {Object.keys(profile.factors).length === 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Neutraler Marktfaktor</span>
            )}
          </div>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
