import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { 
  Database, 
  Download, 
  Upload, 
  X, 
  Layers, 
  Settings, 
  BarChart3, 
  TrendingUp, 
  Check,
  Lock,
  ShieldCheck,
  Boxes,
  Sparkles
} from 'lucide-react'

export interface DataManagementModalProps {
  isOpen: boolean
  onClose: () => void
  onExportWorkspace: (pin?: string) => void
  onImportWorkspace: (file: File, pin?: string) => Promise<void>
  onExportProfiles: () => void
  onImportProfiles: (file: File) => void
  onExportDimension: () => void
  onImportDimension: (file: File) => void
  onExportRules: () => void
  onImportRules: (file: File) => void
  onExportOverrides: () => void
  onImportOverrides: (file: File) => void
}

export default function DataManagementModal({
  isOpen,
  onClose,
  onExportWorkspace,
  onImportWorkspace,
  onExportProfiles,
  onImportProfiles,
  onExportDimension,
  onImportDimension,
  onExportRules,
  onImportRules,
  onExportOverrides,
  onImportOverrides
}: DataManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'workspace' | 'modules'>('workspace')
  const [modalMsg, setModalMsg] = useState<string | null>(null)
  const [pinPrompt, setPinPrompt] = useState<{ type: 'export' | 'import', file?: File } | null>(null)
  const [pin, setPin] = useState('')

  if (!isOpen) return null

  const showMsg = (msg: string) => {
    setModalMsg(msg)
    setTimeout(() => setModalMsg(null), 3500)
  }

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>, 
    handler: (file: File) => Promise<void> | void, 
    successMsg: string
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await handler(file)
      showMsg(successMsg)
    } catch (err) {
      if (String(err).includes('PIN_REQUIRED')) {
        setPinPrompt({ type: 'import', file })
      } else {
        showMsg(`Fehler: ${String(err)}`)
      }
    } finally {
      e.target.value = ''
    }
  }

  const handleImportWithPin = async (file: File, pinValue: string) => {
    try {
      await onImportWorkspace(file, pinValue)
      showMsg('Workspace erfolgreich entschlüsselt und wiederhergestellt')
    } catch (err) {
      showMsg(`Fehler: ${String(err)}`)
    }
  }

  const modularSections = [
    {
      id: 'profiles',
      title: 'Rebalancing-Profile',
      desc: 'Benutzerdefinierte Ziel-Allokationen und Subkategorie-Gewichtungen für dein Portfolio-Rebalancing.',
      icon: <BarChart3 size={20} color="#3b82f6" />,
      onExport: () => {
        onExportProfiles()
        showMsg('Rebalancing-Profile exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => 
        handleFileChange(e, onImportProfiles, 'Rebalancing-Profile importiert')
    },
    {
      id: 'dimensions',
      title: 'Analysedimensionen',
      desc: 'Eigene Dimensionen, Regionen und Markt-Tagging-Regeln für die Cross-Dimension Analyse.',
      icon: <Layers size={20} color="#10b981" />,
      onExport: () => {
        onExportDimension()
        showMsg('Analysedimension exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => 
        handleFileChange(e, onImportDimension, 'Analysedimension importiert')
    },
    {
      id: 'rules',
      title: 'Benutzerregeln (User Rules)',
      desc: 'Individuelle ISIN-Mappings, benutzerdefinierte Namensregeln und Kategorisierungs-Overrides.',
      icon: <Settings size={20} color="#a855f7" />,
      onExport: () => {
        onExportRules()
        showMsg('Benutzerregeln exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => 
        handleFileChange(e, onImportRules, 'Benutzerregeln importiert')
    },
    {
      id: 'overrides',
      title: 'Broker-Overrides',
      desc: 'Manuell gesetzte Verfügbarkeiten und individuelle Handelsplätze für deine Assets.',
      icon: <TrendingUp size={20} color="#f97316" />,
      onExport: () => {
        onExportOverrides()
        showMsg('Broker-Overrides exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => 
        handleFileChange(e, onImportOverrides, 'Broker-Overrides importiert')
    }
  ]

  return createPortal(
    <div 
      className="data-modal-backdrop" 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div 
        className="data-modal-dialog" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="data-modal-header">
          <div className="data-modal-header-left">
            <div className="data-modal-header-icon">
              <Database size={20} color="var(--gold)" />
            </div>
            <div>
              <h3 className="data-modal-title">
                Daten Ex- & Import Center
              </h3>
              <p className="data-modal-subtitle">
                Sichere, exportiere und importiere deine JSON-Konfigurationen und Daten.
              </p>
            </div>
          </div>
          <button 
            className="btn btn-sm btn-ghost" 
            onClick={onClose}
            style={{ padding: '6px', borderRadius: '6px' }}
            title="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="data-modal-tabs">
          <button 
            type="button"
            className={`data-modal-tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveTab('workspace')}
          >
            <Database size={15} />
            <span>Workspace Backup</span>
          </button>
          <button 
            type="button"
            className={`data-modal-tab-btn ${activeTab === 'modules' ? 'active' : ''}`}
            onClick={() => setActiveTab('modules')}
          >
            <Boxes size={15} />
            <span>Einzelne Module</span>
            <span className="data-modal-tab-badge">4</span>
          </button>
        </div>

        {/* Success / Status Notification */}
        {modalMsg && (
          <div style={{ padding: '12px 24px 0' }}>
            <div className="data-modal-toast">
              <Check size={16} />
              <span>{modalMsg}</span>
            </div>
          </div>
        )}

        {/* Modal Content Body */}
        <div className="data-modal-body">
          {activeTab === 'workspace' ? (
            /* Workspace Backup Tab */
            <div className="data-modal-hero-card">
              <div className="data-modal-hero-header">
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(240, 192, 64, 0.12)',
                  border: '1px solid rgba(240, 192, 64, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Database size={22} color="var(--gold)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Gesamter Workspace
                    </span>
                    <span className="data-modal-hero-badge">
                      <Sparkles size={11} /> Empfohlen
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Komplette Sicherung und Wiederherstellung des aktuellen Arbeitsbereichs inklusive aller Depots, Regeln, Profile und Einstellungen.
                  </p>
                  <div className="data-modal-hero-pills">
                    <span className="data-modal-hero-pill">
                      <Check size={12} color="var(--green)" /> Bestände & Depots
                    </span>
                    <span className="data-modal-hero-pill">
                      <Check size={12} color="var(--green)" /> Ziel-Allokationen
                    </span>
                    <span className="data-modal-hero-pill">
                      <Check size={12} color="var(--green)" /> Dimensionen & Tags
                    </span>
                    <span className="data-modal-hero-pill">
                      <Check size={12} color="var(--green)" /> Regeln & Overrides
                    </span>
                  </div>
                </div>
              </div>

              <div className="data-modal-hero-actions">
                {/* Export Card */}
                <div className="data-modal-hero-action-card">
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Workspace sichern
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      Erstellt eine vollständige Sicherungsdatei (.json). Optional mit PIN-Schutz.
                    </div>
                  </div>
                  <button 
                    className="btn btn-gold" 
                    onClick={() => setPinPrompt({ type: 'export' })}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px', 
                      width: '100%',
                      padding: '10px 14px',
                      fontWeight: 700,
                      fontSize: '0.88rem'
                    }}
                  >
                    <Download size={16} /> Backup exportieren
                  </button>
                </div>

                {/* Import Card */}
                <div className="data-modal-hero-action-card">
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Workspace laden
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      Stellt den gesamten Zustand aus einer gesicherten JSON-Datei wieder her.
                    </div>
                  </div>
                  <label 
                    className="btn btn-ghost" 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px', 
                      width: '100%',
                      padding: '10px 14px',
                      cursor: 'pointer', 
                      position: 'relative', 
                      overflow: 'hidden',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      background: 'rgba(16, 185, 129, 0.08)',
                      color: '#6ee7b7',
                      fontWeight: 700,
                      fontSize: '0.88rem'
                    }}
                  >
                    <Upload size={16} /> Backup importieren
                    <input 
                      type="file" 
                      accept=".json,application/json,text/plain" 
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} 
                      onChange={(e) => handleFileChange(e, (file) => onImportWorkspace(file), 'Workspace erfolgreich wiederhergestellt')} 
                    />
                  </label>
                </div>
              </div>

              <div className="data-modal-info-box">
                <ShieldCheck size={18} color="var(--gold)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Lokale Datensicherheit:</strong> Alle Exporte bleiben ausschließlich auf deinem Gerät. Du kannst Backups optional mit einem 6-stelligen PIN verschlüsseln, um deine Finanzdaten zu schützen.
                </span>
              </div>
            </div>
          ) : (
            /* Modular Settings Tab */
            <>
              <div className="data-modal-info-box" style={{ marginBottom: '4px' }}>
                <Layers size={18} color="var(--gold)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  Hier kannst du gezielt einzelne Konfigurationen exportieren oder importieren, ohne deinen gesamten Workspace zu überschreiben.
                </span>
              </div>

              {modularSections.map((sec) => (
                <div key={sec.id} className="data-modal-card">
                  <div className="data-modal-card-left">
                    <div className="data-modal-card-icon">
                      {sec.icon}
                    </div>
                    <div className="data-modal-card-info">
                      <div className="data-modal-card-title">
                        {sec.title}
                      </div>
                      <div className="data-modal-card-desc">
                        {sec.desc}
                      </div>
                    </div>
                  </div>

                  <div className="data-modal-card-actions">
                    <button 
                      className="data-modal-btn-export" 
                      onClick={sec.onExport}
                      title={`${sec.title} als JSON herunterladen`}
                    >
                      <Download size={14} /> Export
                    </button>
                    <label 
                      className="data-modal-btn-import" 
                      title={`${sec.title} aus JSON-Datei laden`}
                    >
                      <Upload size={14} /> Import
                      <input 
                        type="file" 
                        accept=".json,application/json,text/plain" 
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} 
                        onChange={sec.onImport} 
                      />
                    </label>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="data-modal-footer">
          <button className="btn btn-sm btn-ghost" onClick={onClose} style={{ padding: '6px 18px' }}>
            Schließen
          </button>
        </div>

        {/* PIN Overlay */}
        {pinPrompt && (
          <div 
            className="data-modal-backdrop"
            style={{
              position: 'absolute',
              background: 'rgba(10, 12, 18, 0.94)',
              zIndex: 10
            }}
          >
            <div className="pin-prompt-box">
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(240, 192, 64, 0.12)',
                border: '1px solid rgba(240, 192, 64, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px'
              }}>
                <Lock size={20} color="var(--gold)" />
              </div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                {pinPrompt.type === 'export' ? 'Workspace verschlüsseln' : 'Workspace entschlüsseln'}
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.4 }}>
                {pinPrompt.type === 'export' 
                  ? 'Vergebe einen 6-stelligen PIN (optional). Ohne Eingabe wird die Datei unverschlüsselt exportiert.' 
                  : 'Diese Datei ist verschlüsselt. Bitte gib den 6-stelligen PIN ein, um sie wiederherzustellen.'}
              </p>
              
              <input 
                type="password" 
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
                style={{
                  width: '100%', 
                  padding: '12px', 
                  textAlign: 'center', 
                  letterSpacing: '10px',
                  fontSize: '1.4rem', 
                  marginBottom: '20px', 
                  borderRadius: '8px',
                  border: '2px solid var(--border)', 
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)', 
                  outline: 'none', 
                  transition: 'border-color 0.2s',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--gold)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                placeholder="••••••"
              />
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button 
                  className="btn btn-ghost" 
                  onClick={() => { setPinPrompt(null); setPin(''); }}
                  style={{ minHeight: '38px', borderRadius: '8px' }}
                >
                  Abbrechen
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ 
                    minHeight: '38px', 
                    borderRadius: '8px',
                    background: (pinPrompt.type === 'export' && pin.length < 6 && pin.length > 0) || (pinPrompt.type === 'import' && pin.length !== 6) ? 'var(--bg-input)' : 'var(--gold)', 
                    color: (pinPrompt.type === 'export' && pin.length < 6 && pin.length > 0) || (pinPrompt.type === 'import' && pin.length !== 6) ? 'var(--text-secondary)' : '#000',
                    fontWeight: 600
                  }}
                  disabled={pinPrompt.type === 'export' ? (pin.length > 0 && pin.length < 6) : pin.length !== 6}
                  onClick={() => {
                    if (pinPrompt.type === 'export') {
                      onExportWorkspace(pin.length === 6 ? pin : undefined)
                      showMsg(pin.length === 6 ? 'Workspace verschlüsselt exportiert' : 'Workspace unverschlüsselt exportiert')
                    } else if (pinPrompt.file) {
                      handleImportWithPin(pinPrompt.file, pin)
                    }
                    setPinPrompt(null)
                    setPin('')
                  }}
                >
                  {pinPrompt.type === 'export' ? (pin.length === 6 ? 'Verschlüsseln' : 'Unverschlüsselt') : 'Entschlüsseln'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
