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

  useEffect(() => {
    if (investments) {
      localStorage.setItem('patty-investments', JSON.stringify(investments))
    } else {
      localStorage.removeItem('patty-investments')
    }
  }, [investments])

  const handleFile = useCallback((file: File) => {
    setError(null)
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const parsed = parseCSV(text)
        const categorized = categorizeWithRules(parsed)
        setInvestments(categorized)
      } catch (err) {
        setError(`Failed to parse CSV: ${String(err)}`)
      }
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
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

          <div
            className={`upload-zone${dragOver ? ' drag-over' : ''}`}
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
              type="file"
              accept=".csv"
              onChange={handleInputChange}
            />
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
              <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                Import Workspace
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
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
