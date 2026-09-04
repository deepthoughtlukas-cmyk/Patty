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
  Check
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
  const [modalMsg, setModalMsg] = useState<string | null>(null)
  const [pinPrompt, setPinPrompt] = useState<{ type: 'export' | 'import', file?: File } | null>(null)
  const [pin, setPin] = useState('')

  if (!isOpen) return null

  const showMsg = (msg: string) => {
    setModalMsg(msg)
    setTimeout(() => setModalMsg(null), 3500)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, handler: (file: File) => Promise<void> | void, successMsg: string) => {
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

  const sections = [
    {
      id: 'workspace',
      title: 'Gesamter Workspace (Backup)',
      desc: 'Komplette Sicherung und Wiederherstellung des aktuellen Arbeitsbereichs inklusive aller Bestände, Regeln, Profile und Einstellungen.',
      icon: <Database size={22} color="var(--gold)" />,
      onExport: () => {
        setPinPrompt({ type: 'export' })
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => handleFileChange(e, (file) => onImportWorkspace(file), 'Workspace erfolgreich wiederhergestellt')
    },
    {
      id: 'profiles',
      title: 'Rebalancing-Profile',
      desc: 'Benutzerdefinierte Ziel-Allokationen und Subkategorie-Gewichtungen für dein Portfolio-Rebalancing.',
      icon: <BarChart3 size={22} color="#3b82f6" />,
      onExport: () => {
        onExportProfiles()
        showMsg('Rebalancing-Profile exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => handleFileChange(e, onImportProfiles, 'Rebalancing-Profile importiert')
    },
    {
      id: 'dimensions',
      title: 'Analysedimensionen',
      desc: 'Eigene Dimensionen, Regionen und Markt-Tagging-Regeln für die Cross-Dimension Analyse.',
      icon: <Layers size={22} color="#10b981" />,
      onExport: () => {
        onExportDimension()
        showMsg('Analysedimension exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => handleFileChange(e, onImportDimension, 'Analysedimension importiert')
    },
    {
      id: 'rules',
      title: 'Benutzerregeln (User Rules)',
      desc: 'Individuelle ISIN-Mappings, benutzerdefinierte Namensregeln und Kategorisierungs-Overrides.',
      icon: <Settings size={22} color="#a855f7" />,
      onExport: () => {
        onExportRules()
        showMsg('Benutzerregeln exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => handleFileChange(e, onImportRules, 'Benutzerregeln importiert')
    },
    {
      id: 'overrides',
      title: 'Broker-Overrides',
      desc: 'Manuell gesetzte Verfügbarkeiten und individuelle Handelsplätze für deine Assets.',
      icon: <TrendingUp size={22} color="#f97316" />,
      onExport: () => {
        onExportOverrides()
        showMsg('Broker-Overrides exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => handleFileChange(e, onImportOverrides, 'Broker-Overrides importiert')
    }
  ]

  return createPortal(
    <div 
      className="modal-backdrop" 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 12, 18, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card, #161b26)',
          border: '1px solid var(--border, #2a324a)',
          borderRadius: 'var(--radius-lg, 12px)',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ 
          padding: '20px 24px', 
          borderBottom: '1px solid var(--border, #2a324a)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: 'var(--bg-base, #0f131d)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(240, 192, 64, 0.1)',
              border: '1px solid rgba(240, 192, 64, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Database size={20} color="var(--gold)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Daten Ex- & Import Center
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
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

        {/* Success / Status Banner */}
        {modalMsg && (
          <div style={{
            margin: '16px 24px 0 24px',
            padding: '10px 16px',
            background: 'rgba(46, 117, 89, 0.2)',
            border: '1px solid rgba(39, 174, 96, 0.4)',
            borderRadius: 'var(--radius-md, 8px)',
            color: '#2ecc71',
            fontSize: '0.88rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease'
          }}>
            <Check size={16} />
            <span>{modalMsg}</span>
          </div>
        )}

        {/* List of Data Sections */}
        <div style={{ 
          padding: '20px 24px', 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '16px' 
        }}>
          {sections.map((sec) => (
            <div 
              key={sec.id}
              style={{
                background: 'var(--bg-input, #111520)',
                border: '1px solid var(--border, #2a324a)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                transition: 'border-color 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 }}>
                <div style={{ 
                  marginTop: '2px', 
                  padding: '8px', 
                  background: 'rgba(255,255,255,0.03)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  {sec.icon}
                </div>
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {sec.title}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {sec.desc}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button 
                  className="btn btn-sm btn-ghost" 
                  onClick={sec.onExport}
                  title={`${sec.title} als JSON herunterladen`}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--border)' }}
                >
                  <Download size={14} /> Export
                </button>
                <label 
                  className="btn btn-sm btn-ghost" 
                  title={`${sec.title} aus JSON-Datei laden`}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}
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
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '14px 24px', 
          borderTop: '1px solid var(--border, #2a324a)', 
          background: 'var(--bg-base, #0f131d)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button className="btn btn-sm btn-ghost" onClick={onClose} style={{ padding: '6px 16px' }}>
            Schließen
          </button>
        </div>

        {/* PIN Overlay */}
        {pinPrompt && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(10, 12, 18, 0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10
          }}>
            <div style={{
              background: 'var(--bg-card, #161b26)', padding: '32px', borderRadius: '12px',
              border: '1px solid var(--border, #2a324a)', width: '380px', textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                {pinPrompt.type === 'export' ? 'Workspace verschlüsseln' : 'Workspace entschlüsseln'}
              </h4>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.4 }}>
                {pinPrompt.type === 'export' 
                  ? 'Vergebe einen 6-stelligen PIN (optional). Ohne Eingabe wird die Datei unverschlüsselt exportiert.' 
                  : 'Diese Datei ist verschlüsselt. Bitte gib den 6-stelligen PIN ein, um sie wiederherzustellen.'}
              </p>
              
              <input 
                type="password" 
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
                style={{
                  width: '100%', padding: '14px', textAlign: 'center', letterSpacing: '12px',
                  fontSize: '1.5rem', marginBottom: '24px', borderRadius: '8px',
                  border: '2px solid var(--border)', background: 'var(--bg-input)',
                  color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--gold)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                placeholder="••••••"
              />
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button 
                  className="btn btn-ghost" 
                  onClick={() => { setPinPrompt(null); setPin(''); }}
                  style={{ flex: 1 }}
                >
                  Abbrechen
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1, background: (pinPrompt.type === 'export' && pin.length < 6 && pin.length > 0) || (pinPrompt.type === 'import' && pin.length !== 6) ? 'var(--bg-input)' : 'var(--gold)', color: (pinPrompt.type === 'export' && pin.length < 6 && pin.length > 0) || (pinPrompt.type === 'import' && pin.length !== 6) ? 'var(--text-secondary)' : '#000' }}
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
