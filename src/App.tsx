import { useState, useCallback, useEffect } from 'react'
import { Beef, Upload } from 'lucide-react'
import { parseCSV, type Investment, type AssetCategory } from './utils/parser'
import { categorizeWithRules } from './utils/categorizer'
import { saveRule, saveCustomName, investmentKey } from './utils/userRules'
import { exportWorkspace, importWorkspace } from './utils/workspace'
import Dashboard from './components/Dashboard'

export default function App() {
  const [investments, setInvestments] = useState<Investment[] | null>(() => {
    try {
      const raw = localStorage.getItem('patty-investments')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [allowAllFiles, setAllowAllFiles] = useState(false)

  useEffect(() => {
    if (investments) {
      localStorage.setItem('patty-investments', JSON.stringify(investments))
    } else {
      localStorage.removeItem('patty-investments')
    }
  }, [investments])

  const handleFile = useCallback((file: File) => {
    setError(null)
    setSuccess(null)

    const lowerName = file.name.toLowerCase()
    const isCsvName = lowerName.endsWith('.csv') || lowerName.endsWith('.txt')
    const isCsvMime = !file.type ||
      file.type === 'text/csv' ||
      file.type === 'text/plain' ||
      file.type === 'application/vnd.ms-excel' ||
      file.type === 'application/csv' ||
      file.type === 'text/comma-separated-values' ||
      file.type === 'text/x-csv' ||
      file.type === 'application/x-csv' ||
      file.type.startsWith('text/') ||
      file.type === 'application/octet-stream'

    if (!isCsvName && !isCsvMime && !allowAllFiles) {
      setError('Bitte wähle eine gültige CSV-Datei aus (.csv).')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        if (!text || text.trim() === '') {
          setError('Die ausgewählte Datei ist leer.')
          return
        }
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          setError('Keine gültigen Positionen in der CSV-Datei gefunden. Bitte überprüfe das Spaltenformat (erwartet u. a. Name, ISIN, Aktueller Wert).')
          return
        }
        const categorized = categorizeWithRules(parsed)
        setInvestments((prev) => {
          if (!prev) return categorized
          const manualAssets = prev.filter((inv) => inv.type === 'Manual')
          return [...categorized, ...manualAssets]
        })
        setSuccess(`${parsed.length} Positionen erfolgreich geladen!`)
      } catch (err) {
        setError(`Fehler beim Einlesen der CSV: ${String(err)}`)
      }
    }
    reader.onerror = () => {
      setError('Fehler beim Lesen der Datei vom Gerät.')
    }
    reader.readAsText(file, 'utf-8')
  }, [allowAllFiles])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleCategoryChange = (key: string, category: AssetCategory, subcategory?: string) => {
    // Find the investment to get its name + ISIN for the rule
    const target = investments?.find((inv) => investmentKey(inv) === key)
    if (target) {
      saveRule({
        isin: target.isin,
        name: target._originalName || target.name,
        customName: target.customName,
        category,
        subcategory,
      })
    }
    setInvestments((prev) =>
      prev
        ? prev.map((inv) =>
            investmentKey(inv) === key
              ? { ...inv, category, ...(subcategory ? { subcategory } : {}) }
              : inv
          )
        : null
    )
  }

  const handleCustomNameChange = (key: string, customName: string | undefined) => {
    const target = investments?.find((inv) => investmentKey(inv) === key)
    if (target) {
      saveCustomName(target, customName)
    }
    setInvestments((prev) =>
      prev
        ? prev.map((inv) =>
            investmentKey(inv) === key
              ? {
                  ...inv,
                  name: customName && customName.trim() !== '' ? customName.trim() : (inv._originalName || inv.name),
                  customName: customName && customName.trim() !== '' ? customName.trim() : undefined,
                }
              : inv
          )
        : null
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <div className="header-icon">
            <Beef size={22} color="#0d0f14" />
          </div>
          <div>
            <h1>Patty</h1>
            <p>Portfolio Allocation Tracker Tool for You</p>
          </div>
        </div>
        {investments && (
          <button
            className="btn btn-ghost"
            onClick={() => setInvestments(null)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.88rem', fontWeight: 500, border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}
            title="Neue CSV-Datei hochladen"
          >
            <Upload size={15} /> Upload new CSV
          </button>
        )}
      </header>

      {!investments ? (
        <div>
          {error && (
            <div style={{
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              color: 'var(--red)',
              fontSize: '0.88rem',
              marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          <label
            className={`upload-zone${dragOver ? ' drag-over' : ''}`}
            htmlFor="portfolio-csv-input"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="upload-icon">
              <Upload size={28} />
            </div>
            <h2>Drop your portfolio CSV here</h2>
            <p style={{ marginBottom: 8 }}>or click to browse</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Supports German-formatted CSV exports (comma decimals, period thousands)
            </p>
            <input
              id="portfolio-csv-input"
              type="file"
              accept={allowAllFiles ? undefined : '.csv,text/csv,text/plain,text/comma-separated-values,application/csv,application/vnd.ms-excel,text/x-csv,application/x-csv,text/*,.txt'}
              onChange={handleInputChange}
            />
          </label>

          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={allowAllFiles}
                onChange={(e) => setAllowAllFiles(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--gold)' }}
              />
              <span>Dateien auf älterem Android ausgegraut? Filter ausschalten (Alle Dateien anzeigen)</span>
            </label>
          </div>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            {success && (
              <div style={{ color: 'var(--green)', marginBottom: 12, fontSize: '0.9rem' }}>
                {success}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={exportWorkspace}>
                Export Workspace
              </button>
              <label className="btn btn-ghost" style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                Import Workspace
                <input
                  type="file"
                  accept=".json,application/json,text/plain"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    try {
                      await importWorkspace(file)
                      // Force reload to apply all local storage values properly
                      window.location.reload()
                    } catch (err) {
                      setError(String(err))
                    }
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      ) : (
        <Dashboard
          investments={investments}
          onCategoryChange={handleCategoryChange}
          onCustomNameChange={handleCustomNameChange}
          onRulesChanged={() => {
            // Re-categorize with updated rules after a rule is deleted/cleared
            setInvestments((prev) => {
              if (!prev) return null
              const reparsed = prev.map((inv) => ({ ...inv, category: 'Stocks' as const }))
              return categorizeWithRules(reparsed)
            })
          }}
          onAddAsset={(asset) => {
            setInvestments((prev) => prev ? [...prev, asset] : [asset])
          }}
          onDeleteAsset={(key) => {
            setInvestments((prev) =>
              prev ? prev.filter((inv) => investmentKey(inv) !== key) : null
            )
          }}
        />
      )}
    </div>
  )
}
