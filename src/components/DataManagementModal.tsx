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
  onExportWorkspace: () => void
  onImportWorkspace: (file: File) => Promise<void>
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
      showMsg(`Fehler: ${String(err)}`)
    } finally {
      e.target.value = ''
    }
  }

  const sections = [
    {
      id: 'workspace',
      title: 'Gesamter Workspace (Backup)',
      desc: 'Komplette Sicherung und Wiederherstellung des aktuellen Arbeitsbereichs inklusive aller Bestände, Regeln, Profile und Einstellungen.',
      icon: <Database size={22} color="var(--gold)" />,
      onExport: () => {
        onExportWorkspace()
        showMsg('Workspace Backup als JSON exportiert')
      },
      onImport: (e: React.ChangeEvent<HTMLInputElement>) => handleFileChange(e, onImportWorkspace, 'Workspace erfolgreich wiederhergestellt')
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
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', border: '1px solid var(--border)' }}
                >
                  <Upload size={14} /> Import
                  <input 
                    type="file" 
                    accept=".json" 
                    style={{ display: 'none' }} 
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
      </div>
    </div>,
    document.body
  )
}
