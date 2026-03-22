import { useState, useCallback, useRef } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, UserCheck, Trash2, XCircle, Download, Upload, Plus } from 'lucide-react'
import type { Investment, AssetCategory } from '../utils/parser'
import {
  computeAllocation,
  computeSubAllocation,
  ALL_CATEGORIES,
  CATEGORY_COLORS,
  SUBCATEGORY_COLORS,
  DEFAULT_SUBCATEGORIES,
} from '../utils/categorizer'
import type { SubWeight } from '../utils/categorizer'
import { loadRules, deleteRule, clearRules, exportRulesToJSON, importRulesFromFile, type UserRule } from '../utils/userRules'
import {
  loadProfiles,
  saveProfile,
  deleteProfile as deleteProfileFn,
  getActiveProfileId,
  setActiveProfileId,
  getActiveProfile,
  generateProfileId,
  type TargetProfile,
  type TargetWeights,
} from '../utils/targetProfiles'

interface DashboardProps {
  investments: Investment[]
  onCategoryChange: (key: string, category: AssetCategory, subcategory?: string) => void
  onReset: () => void
  onRulesChanged?: () => void
  onAddAsset?: (asset: Investment) => void
}

function fmt(value: number, digits = 2): string {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtEur(value: number): string {
  return `€ ${fmt(value)}`
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)} %`
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string; targetPct: number } }> }) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-accent)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
      fontSize: '0.82rem',
      color: 'var(--text-primary)',
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{name}</div>
      <div style={{ color: 'var(--text-secondary)' }}>Actual: <strong style={{ color: p.color }}>{(value * 100).toFixed(1)} %</strong></div>
      <div style={{ color: 'var(--text-secondary)' }}>Target: <strong>{(p.targetPct * 100).toFixed(1)} %</strong></div>
    </div>
  )
}

export default function Dashboard({ investments, onCategoryChange, onReset, onRulesChanged, onAddAsset }: DashboardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [rules, setRules] = useState<UserRule[]>(() => loadRules())
  const [rulesOpen, setRulesOpen] = useState(false)
  const [addAssetOpen, setAddAssetOpen] = useState(false)
  const [newAsset, setNewAsset] = useState({ name: '', isin: '', currentValue: '', category: 'Stocks' as AssetCategory, subcategory: 'General' })
  const [importMsg, setImportMsg] = useState<string | null>(null)

  // Target profile state
  const [profiles, setProfiles] = useState<TargetProfile[]>(() => loadProfiles())
  const [activeProfileId, setActiveProfileIdState] = useState<string>(() => getActiveProfileId())
  const [editingWeights, setEditingWeights] = useState(false)
  const [draftWeights, setDraftWeights] = useState<TargetWeights>(() => getActiveProfile().weights)
  const [draftSubWeights, setDraftSubWeights] = useState<Record<string, SubWeight[]>>(() => getActiveProfile().subWeights || {})
  const [newProfileName, setNewProfileName] = useState('')
  const [showNewProfile, setShowNewProfile] = useState(false)
  const [newSubName, setNewSubName] = useState<Record<string, string>>({})
  const profileInputRef = useRef<HTMLInputElement>(null)

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0]
  const activeWeights = activeProfile.weights
  const activeSubWeights = activeProfile.subWeights || {}

  const refreshRules = useCallback(() => {
    setRules(loadRules())
  }, [])

  const handleDeleteRule = (key: string) => {
    deleteRule(key)
    refreshRules()
    onRulesChanged?.()
  }

  const handleClearRules = () => {
    clearRules()
    refreshRules()
    onRulesChanged?.()
  }

  const handleImportRules = async (file: File) => {
    try {
      const count = await importRulesFromFile(file)
      refreshRules()
      onRulesChanged?.()
      setImportMsg(`${count} rules imported successfully`)
      setTimeout(() => setImportMsg(null), 3000)
    } catch (err) {
      setImportMsg(`Import failed: ${String(err)}`)
      setTimeout(() => setImportMsg(null), 4000)
    }
  }

  const handleAddAsset = () => {
    const value = parseFloat(newAsset.currentValue.replace(/\./g, '').replace(',', '.'))
    if (!newAsset.name.trim() || isNaN(value) || value <= 0) return
    const asset: Investment = {
      name: newAsset.name.trim(),
      isin: newAsset.isin.trim(),
      wkn: '',
      type: 'Manual',
      quantity: 1,
      purchasePrice: value,
      currentPrice: value,
      currentValue: value,
      currency: 'EUR',
      exchangeRate: 1,
      region: '',
      sector: '',
      category: newAsset.category,
      subcategory: newAsset.subcategory || 'General',
    }
    onAddAsset?.(asset)
    setNewAsset({ name: '', isin: '', currentValue: '', category: 'Stocks', subcategory: 'General' })
    setAddAssetOpen(false)
  }

  // Check if an investment has a user-override
  const ruleKeys = new Set(rules.map((r) => r.isin || r.name))

  // Profile handlers
  const switchProfile = (id: string) => {
    setActiveProfileIdState(id)
    setActiveProfileId(id)
    const prof = profiles.find((p) => p.id === id) || profiles[0]
    setDraftWeights(prof.weights)
    setDraftSubWeights(prof.subWeights || {})
    setEditingWeights(false)
  }

  const handleSaveWeights = () => {
    const updated = { ...activeProfile, weights: draftWeights, subWeights: draftSubWeights }
    saveProfile(updated)
    setProfiles(loadProfiles())
    setEditingWeights(false)
  }

  const handleCreateProfile = () => {
    if (!newProfileName.trim()) return
    const newProf: TargetProfile = {
      id: generateProfileId(),
      name: newProfileName.trim(),
      weights: { ...activeWeights },
      subWeights: JSON.parse(JSON.stringify(activeSubWeights)),
    }
    saveProfile(newProf)
    setProfiles(loadProfiles())
    setActiveProfileIdState(newProf.id)
    setActiveProfileId(newProf.id)
    setDraftWeights(newProf.weights)
    setDraftSubWeights(newProf.subWeights || {})
    setNewProfileName('')
    setShowNewProfile(false)
  }

  const handleDeleteProfile = () => {
    if (deleteProfileFn(activeProfileId)) {
      setProfiles(loadProfiles())
      const fallback = loadProfiles()[0]
      switchProfile(fallback.id)
    }
  }

  const handleExportProfiles = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profiles, null, 2))
    const downloadAnchorNode = document.createElement('a')
    downloadAnchorNode.setAttribute("href", dataStr)
    downloadAnchorNode.setAttribute("download", "stockpicker_profiles.json")
    document.body.appendChild(downloadAnchorNode)
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }

  const handleImportProfiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed)) {
          localStorage.setItem('stockpicker-target-profiles', JSON.stringify(parsed))
          const loaded = loadProfiles()
          setProfiles(loaded)
          if (!loaded.find((p) => p.id === activeProfileId)) {
            switchProfile(loaded[0].id)
          }
        }
      } catch (err) {
        console.error("Failed to parse profiles file:", err)
      }
    }
    reader.readAsText(file)
    if (e.target) e.target.value = ''
  }

  const updateDraftSubWeight = (cat: string, subName: string, weight: number) => {
    const current = draftSubWeights[cat] || []
    const idx = current.findIndex((sw) => sw.name === subName)
    const updated = [...current]
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], weight }
    } else {
      updated.push({ name: subName, weight })
    }
    setDraftSubWeights({ ...draftSubWeights, [cat]: updated })
  }

  const addDraftSubcategory = (cat: string) => {
    const name = (newSubName[cat] || '').trim()
    if (!name) return
    const current = draftSubWeights[cat] || []
    if (current.some((sw) => sw.name === name)) return // already exists
    setDraftSubWeights({ ...draftSubWeights, [cat]: [...current, { name, weight: 0 }] })
    setNewSubName({ ...newSubName, [cat]: '' })
  }

  const removeDraftSubcategory = (cat: string, subName: string) => {
    const current = draftSubWeights[cat] || []
    setDraftSubWeights({ ...draftSubWeights, [cat]: current.filter((sw) => sw.name !== subName) })
  }

  const activeInvestments = investments.filter((inv) => inv.currentValue > 0)
  const totalValue = activeInvestments.reduce((s, inv) => s + inv.currentValue, 0)
  const totalCost = activeInvestments.reduce((s, inv) => s + inv.purchasePrice * inv.quantity, 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = totalCost > 0 ? totalGain / totalCost : 0

  const allocation = computeAllocation(activeInvestments, activeWeights)

  const actualChartData = allocation.map((a) => ({
    name: a.category,
    value: a.percentage,
    targetPct: a.targetPercentage,
    color: a.color,
  }))

  const targetChartData = ALL_CATEGORIES.map((cat) => ({
    name: cat,
    value: activeWeights[cat],
    targetPct: activeWeights[cat],
    color: CATEGORY_COLORS[cat],
  }))

  const grouped = ALL_CATEGORIES.reduce<Record<AssetCategory, Investment[]>>(
    (acc, cat) => {
      acc[cat] = activeInvestments.filter((inv) => inv.category === cat)
      return acc
    },
    {} as Record<AssetCategory, Investment[]>
  )

  const toggleCollapse = (cat: string) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))

  // Get subcategory options for a given category
  const getSubcategories = (cat: AssetCategory): string[] => {
    const defaults = DEFAULT_SUBCATEGORIES[cat] || ['General']
    const fromInvestments = new Set(activeInvestments.filter((inv) => inv.category === cat).map((inv) => inv.subcategory))
    const fromProfile = (activeSubWeights[cat] || []).map((sw) => sw.name)
    return Array.from(new Set([...defaults, ...fromInvestments, ...fromProfile])).sort()
  }

  return (
    <div className="animate-in">
      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value">{fmtEur(totalValue)}</div>
          <div className="stat-sub">{activeInvestments.length} positions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Cost</div>
          <div className="stat-value">{fmtEur(totalCost)}</div>
          <div className="stat-sub">Purchase price</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Gain / Loss</div>
          <div className="stat-value" style={{ color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalGain >= 0 ? '+' : ''}{fmtEur(totalGain)}
          </div>
          <div className="stat-sub" style={{ color: totalGainPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalGainPct >= 0 ? '+' : ''}{(totalGainPct * 100).toFixed(2)} %
          </div>
        </div>
        {allocation.slice(0, 3).map((a) => (
          <div className="stat-card" key={a.category}>
            <div className="stat-label" style={{ color: a.color }}>{a.category}</div>
            <div className="stat-value">{fmtPct(a.percentage)}</div>
            <div className="stat-sub">Target {fmtPct(a.targetPercentage)}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="dashboard-grid">
        {/* Actual Allocation */}
        <div className="card">
          <div className="card-title">Current Allocation</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={actualChartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {actualChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="legend">
            {allocation.map((a) => (
              <div className="legend-item" key={a.category}>
                <span className="legend-dot" style={{ background: a.color }} />
                <span className="legend-name">{a.category}</span>
                <span className="legend-pct">{fmtPct(a.percentage)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Target Allocation */}
        <div className="card">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span>Target Allocation</span>
            <div className="profile-selector">
              <select
                className="cat-select"
                value={activeProfileId}
                onChange={(e) => switchProfile(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {!editingWeights ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={targetChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {targetChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend">
                {ALL_CATEGORIES.map((cat) => (
                  <div className="legend-item" key={cat}>
                    <span className="legend-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                    <span className="legend-name">{cat}</span>
                    <span className="legend-pct">{fmtPct(activeWeights[cat])}</span>
                  </div>
                ))}
              </div>
              <div className="profile-actions">
                {activeProfile.id !== 'incrementum-60-40' && (
                  <button className="btn btn-sm btn-ghost" onClick={() => { setDraftWeights({ ...activeWeights }); setDraftSubWeights(JSON.parse(JSON.stringify(activeSubWeights))); setEditingWeights(true) }}>
                    Edit Weights
                  </button>
                )}
                <button className="btn btn-sm btn-ghost" onClick={() => setShowNewProfile(!showNewProfile)}>
                  <Plus size={12} /> New Profile
                </button>
                {activeProfile.id !== 'incrementum-60-40' && (
                  <button className="btn btn-sm btn-ghost btn-danger-ghost" onClick={handleDeleteProfile}>
                    <Trash2 size={12} /> Delete
                  </button>
                )}
                <div style={{ flex: 1, minWidth: '10px' }} />
                <button className="btn btn-sm btn-ghost" onClick={handleExportProfiles} title="Export Profiles">
                  <Download size={12} />
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => profileInputRef.current?.click()} title="Import Profiles">
                  <Upload size={12} />
                </button>
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  ref={profileInputRef}
                  onChange={handleImportProfiles}
                />
              </div>
              {showNewProfile && (
                <div className="new-profile-row">
                  <input
                    type="text"
                    className="new-profile-input"
                    placeholder="Profile name..."
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateProfile()}
                  />
                  <button className="btn btn-sm btn-gold" onClick={handleCreateProfile} disabled={!newProfileName.trim()}>
                    Create
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="weight-editor">
              <div className="weight-editor-section-title">Main Category Weights</div>
              {ALL_CATEGORIES.map((cat) => {
                const pct = Math.round(draftWeights[cat] * 100)
                return (
                  <div className="weight-row" key={cat}>
                    <span className="weight-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                    <span className="weight-name">{cat}</span>
                    <button 
                      className="slider-btn" 
                      onClick={() => setDraftWeights({ ...draftWeights, [cat]: Math.max(0, draftWeights[cat] - 0.01) })}
                    >−</button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={pct}
                      className="weight-slider"
                      style={{ accentColor: CATEGORY_COLORS[cat] }}
                      onChange={(e) => setDraftWeights({ ...draftWeights, [cat]: parseInt(e.target.value) / 100 })}
                    />
                    <button 
                      className="slider-btn" 
                      onClick={() => setDraftWeights({ ...draftWeights, [cat]: Math.min(1, draftWeights[cat] + 0.01) })}
                    >+</button>
                    <span className="weight-pct">{pct} %</span>
                  </div>
                )
              })}
              <div className="weight-total" style={{ color: Math.abs(Object.values(draftWeights).reduce((s, v) => s + v, 0) - 1) < 0.001 ? 'var(--green)' : 'var(--red)' }}>
                Total: {Math.round(Object.values(draftWeights).reduce((s, v) => s + v, 0) * 100)} %
              </div>

              {/* Subcategory weights */}
              {ALL_CATEGORIES.map((cat) => {
                const catSubWeights = draftSubWeights[cat] || []
                // Show defaults and any subcategories explicitly targeted in this profile
                const allSubNames = new Set([
                  ...(DEFAULT_SUBCATEGORIES[cat] || []),
                  ...catSubWeights.map((sw) => sw.name),
                ])
                const subs = Array.from(allSubNames).sort()
                const subWeightMap = new Map(catSubWeights.map((sw) => [sw.name, sw.weight]))
                const subTotal = subs.reduce((s, sub) => s + (subWeightMap.get(sub) ?? 0), 0)
                const hasSubs = subs.length > 1 || catSubWeights.length > 0

                return (
                  <div key={cat} className="sub-weight-section">
                    <div className="weight-editor-section-title" style={{ color: CATEGORY_COLORS[cat] }}>
                      {cat} Subcategories
                    </div>
                    {hasSubs && subs.map((sub) => {
                      const val = Math.round((subWeightMap.get(sub) ?? 0) * 100)
                      const isDefault = (DEFAULT_SUBCATEGORIES[cat] || []).includes(sub)
                      return (
                        <div className="weight-row sub-weight-row" key={sub}>
                          <span className="weight-dot" style={{ background: SUBCATEGORY_COLORS[sub] || '#6b7280' }} />
                          <span className="weight-name">{sub}</span>
                          <button 
                            className="slider-btn" 
                            onClick={() => updateDraftSubWeight(cat, sub, Math.max(0, (subWeightMap.get(sub) ?? 0) - 0.01))}
                          >−</button>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={val}
                            className="weight-slider"
                            style={{ accentColor: SUBCATEGORY_COLORS[sub] || '#6b7280' }}
                            onChange={(e) => updateDraftSubWeight(cat, sub, parseInt(e.target.value) / 100)}
                          />
                          <button 
                            className="slider-btn" 
                            onClick={() => updateDraftSubWeight(cat, sub, Math.min(1, (subWeightMap.get(sub) ?? 0) + 0.01))}
                          >+</button>
                          <span className="weight-pct">{val} %</span>
                          {!isDefault && (
                            <button
                              className="btn-icon-sm"
                              title={`Remove ${sub}`}
                              onClick={() => removeDraftSubcategory(cat, sub)}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {hasSubs && (
                      <div className="weight-total sub-weight-total" style={{ color: Math.abs(subTotal - 1) < 0.001 ? 'var(--green)' : 'var(--red)' }}>
                        Sub-Total: {Math.round(subTotal * 100)} %
                      </div>
                    )}
                    <div className="new-sub-row">
                      <input
                        type="text"
                        className="new-profile-input"
                        placeholder="New subcategory..."
                        value={newSubName[cat] || ''}
                        onChange={(e) => setNewSubName({ ...newSubName, [cat]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && addDraftSubcategory(cat)}
                      />
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => addDraftSubcategory(cat)}
                        disabled={!(newSubName[cat] || '').trim()}
                      >
                        <Plus size={11} /> Add
                      </button>
                    </div>
                  </div>
                )
              })}

              <div className="profile-actions">
                <button className="btn btn-sm btn-gold" onClick={handleSaveWeights}>
                  Save
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditingWeights(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Allocation Bars */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Allocation vs Target</div>
        {allocation.map((a) => {
          const subAlloc = computeSubAllocation(activeInvestments, a.category, activeSubWeights[a.category])
          const hasMultipleSubs = subAlloc.length > 1
          const subBarKey = `alloc::${a.category}`
          const subsVisible = !collapsed[subBarKey]
          return (
            <div key={a.category}>
              <div
                className="alloc-bar-wrap"
                style={{ cursor: hasMultipleSubs ? 'pointer' : 'default' }}
                onClick={() => hasMultipleSubs && toggleCollapse(subBarKey)}
              >
                <div className="alloc-bar-label">
                  <span style={{ color: a.color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {hasMultipleSubs && (subsVisible
                      ? <ChevronDown size={12} />
                      : <ChevronRight size={12} />
                    )}
                    {a.category}
                  </span>
                  <span>
                    <span style={{ color: a.deviation > 0.005 ? 'var(--green)' : a.deviation < -0.005 ? 'var(--red)' : 'var(--text-secondary)' }}>
                      {fmtPct(a.percentage)}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}> / {fmtPct(a.targetPercentage)}</span>
                  </span>
                </div>
                <div className="alloc-bar-track">
                  <div
                    className="alloc-bar-fill"
                    style={{
                      width: `${Math.min(a.percentage / (a.targetPercentage || 0.01), 1) * 100}%`,
                      background: a.color,
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
              {/* Subcategory bars */}
              {hasMultipleSubs && subsVisible && (
                <div className="sub-alloc-bars">
                  {subAlloc.map((sa) => (
                    <div className="sub-alloc-row" key={sa.subcategory}>
                      <span className="sub-alloc-dot" style={{ background: sa.color }} />
                      <span className="sub-alloc-name">{sa.subcategory}</span>
                      <div className="sub-alloc-track">
                        <div
                          className="sub-alloc-fill"
                          style={{
                            width: `${Math.min(sa.percentage / (sa.targetPercentage || 0.01), 1) * 100}%`,
                            background: sa.color,
                          }}
                        />
                      </div>
                      <span className="sub-alloc-pct">{(sa.percentage * 100).toFixed(0)}%</span>
                      <span className="sub-alloc-target">/ {(sa.targetPercentage * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Rebalancing Recommendations */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Rebalancing Recommendations</div>
        <div className="rebalance-list">
          {allocation.map((a) => {
            const targetValue = totalValue * a.targetPercentage
            const diff = targetValue - a.value
            const absDiff = Math.abs(diff)
            const isOk = absDiff < totalValue * 0.01
            const subAlloc = computeSubAllocation(activeInvestments, a.category, activeSubWeights[a.category])
            const hasMultipleSubs = subAlloc.length > 1
            const rebalSubKey = `rebal::${a.category}`
            const rebalSubVisible = !collapsed[rebalSubKey]

            return (
              <div key={a.category}>
                <div
                  className="rebalance-item"
                  style={{ cursor: hasMultipleSubs ? 'pointer' : 'default' }}
                  onClick={() => hasMultipleSubs && toggleCollapse(rebalSubKey)}
                >
                  <span className="rebalance-item-dot" style={{ background: a.color }} />
                  {hasMultipleSubs && (rebalSubVisible
                    ? <ChevronDown size={12} color="var(--text-muted)" style={{ marginLeft: -6, marginRight: -4 }} />
                    : <ChevronRight size={12} color="var(--text-muted)" style={{ marginLeft: -6, marginRight: -4 }} />
                  )}
                  <span className="rebalance-item-name">{a.category}</span>
                  <span className="rebalance-deviation">
                    {a.deviation >= 0 ? '+' : ''}{(a.deviation * 100).toFixed(1)} %
                  </span>
                  {isOk ? (
                    <span className="rebalance-badge ok">
                      <Minus size={10} style={{ marginRight: 4 }} />On Target
                    </span>
                  ) : diff > 0 ? (
                    <span className="rebalance-badge buy">
                      <TrendingUp size={10} style={{ marginRight: 4 }} />Buy {fmtEur(absDiff)}
                    </span>
                  ) : (
                    <span className="rebalance-badge sell">
                      <TrendingDown size={10} style={{ marginRight: 4 }} />Sell {fmtEur(absDiff)}
                    </span>
                  )}
                  <span className="rebalance-actual" style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }} title="Actual % / Target % of total portfolio">
                    {(a.percentage * 100).toFixed(1)}% / {(a.targetPercentage * 100).toFixed(1)}% Portfolio
                  </span>
                </div>

                {/* Subcategory rebalancing */}
                {hasMultipleSubs && rebalSubVisible && (
                  <div className="sub-rebalance-list">
                    {subAlloc.filter((sa) => sa.targetPercentage > 0).map((sa) => {
                      // Absolute target for this subcategory = category target * sub-target within category
                      const subAbsTarget = a.targetPercentage * sa.targetPercentage
                      const subActualAbs = a.percentage * sa.percentage
                      const subTargetValue = totalValue * subAbsTarget
                      const subDiff = subTargetValue - sa.value
                      const subAbsDiff = Math.abs(subDiff)
                      const subIsOk = subAbsDiff < totalValue * 0.005
                      const subDev = subActualAbs - subAbsTarget

                      return (
                        <div className="rebalance-item sub-rebalance-item" key={sa.subcategory}>
                          <span className="sub-alloc-dot" style={{ background: sa.color }} />
                          <span className="rebalance-item-name sub-rebalance-name">{sa.subcategory}</span>
                          <span className="rebalance-deviation">
                            {subDev >= 0 ? '+' : ''}{(subDev * 100).toFixed(1)} %
                          </span>
                          {subIsOk ? (
                            <span className="rebalance-badge ok" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                              <Minus size={9} style={{ marginRight: 3 }} />OK
                            </span>
                          ) : subDiff > 0 ? (
                            <span className="rebalance-badge buy" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                              <TrendingUp size={9} style={{ marginRight: 3 }} />Buy {fmtEur(subAbsDiff)}
                            </span>
                          ) : (
                            <span className="rebalance-badge sell" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                              <TrendingDown size={9} style={{ marginRight: 3 }} />Sell {fmtEur(subAbsDiff)}
                            </span>
                          )}
                          <span className="rebalance-sub-actual" style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }} title="Actual % / Target % of total portfolio">
                            {(subActualAbs * 100).toFixed(1)}% / {(subAbsTarget * 100).toFixed(1)}% Portfolio
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Holdings Table grouped by category */}
      <div className="card holdings-section">
        <div className="card-title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          Holdings by Category
          <button className="btn btn-sm btn-gold" onClick={() => setAddAssetOpen(!addAssetOpen)}>
            <Plus size={13} />
            Add Asset
          </button>
        </div>

        {addAssetOpen && (
          <div className="add-asset-form">
            <div className="add-asset-fields">
              <div className="add-asset-field">
                <label>Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Bitcoin ETP"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                />
              </div>
              <div className="add-asset-field">
                <label>ISIN</label>
                <input
                  type="text"
                  placeholder="e.g. DE000A27Z304"
                  value={newAsset.isin}
                  onChange={(e) => setNewAsset({ ...newAsset, isin: e.target.value })}
                />
              </div>
              <div className="add-asset-field">
                <label>Value (€) *</label>
                <input
                  type="text"
                  placeholder="e.g. 1.500,00"
                  value={newAsset.currentValue}
                  onChange={(e) => setNewAsset({ ...newAsset, currentValue: e.target.value })}
                />
              </div>
              <div className="add-asset-field">
                <label>Category</label>
                <select
                  className="cat-select"
                  value={newAsset.category}
                  onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value as AssetCategory, subcategory: 'General' })}
                >
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="add-asset-field">
                <label>Subcategory</label>
                <select
                  className="cat-select"
                  value={newAsset.subcategory}
                  onChange={(e) => setNewAsset({ ...newAsset, subcategory: e.target.value })}
                >
                  {getSubcategories(newAsset.category).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="add-asset-actions">
              <button className="btn btn-sm btn-gold" onClick={handleAddAsset} disabled={!newAsset.name.trim() || !newAsset.currentValue.trim()}>
                <Plus size={13} /> Add
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setAddAssetOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {ALL_CATEGORIES.map((cat) => {
          const items = grouped[cat]
          const catValue = items.reduce((s, inv) => s + inv.currentValue, 0)
          const catPct = totalValue > 0 ? catValue / totalValue : 0
          const isOpen = !collapsed[cat]

          // Group items by subcategory
          const subGrouped = new Map<string, Investment[]>()
          for (const inv of items) {
            const sub = inv.subcategory || 'General'
            if (!subGrouped.has(sub)) subGrouped.set(sub, [])
            subGrouped.get(sub)!.push(inv)
          }
          const subKeys = Array.from(subGrouped.keys()).sort()

          return (
            <div className="category-group" key={cat}>
              <div className="category-header" onClick={() => toggleCollapse(cat)}>
                <span className="category-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                <span className="category-header-name">{cat}</span>
                <span className="category-header-value">{fmtEur(catValue)}</span>
                <span className="category-header-pct">{fmtPct(catPct)}</span>
                {isOpen
                  ? <ChevronDown size={14} color="var(--text-muted)" />
                  : <ChevronRight size={14} color="var(--text-muted)" />}
              </div>

              {isOpen && items.length > 0 && (
                <div className="subcategory-groups">
                  {subKeys.map((sub) => {
                    const subItems = subGrouped.get(sub)!
                    const subValue = subItems.reduce((s, inv) => s + inv.currentValue, 0)
                    const subPct = catValue > 0 ? subValue / catValue : 0
                    const subCollapseKey = `${cat}::${sub}`
                    const subOpen = !collapsed[subCollapseKey]

                    return (
                      <div className="subcategory-group" key={sub}>
                        <div
                          className="subcategory-header"
                          onClick={() => toggleCollapse(subCollapseKey)}
                        >
                          <span className="sub-dot" style={{ background: SUBCATEGORY_COLORS[sub] || '#6b7280' }} />
                          <span className="subcategory-header-name">{sub}</span>
                          <span className="subcategory-header-count">{subItems.length}</span>
                          <span className="subcategory-header-value">{fmtEur(subValue)}</span>
                          <span className="subcategory-header-pct">{(subPct * 100).toFixed(0)}%</span>
                          {subOpen
                            ? <ChevronDown size={12} color="var(--text-muted)" />
                            : <ChevronRight size={12} color="var(--text-muted)" />}
                        </div>

                        {subOpen && (
                          <div style={{ overflowX: 'auto' }}>
                            <table className="holdings-table sub-table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Type</th>
                                  <th style={{ textAlign: 'right' }}>Value €</th>
                                  <th style={{ textAlign: 'right' }}>G/L</th>
                                  <th>Subcategory</th>
                                  <th>Category</th>
                                </tr>
                              </thead>
                              <tbody>
                                {subItems.map((inv) => {
                                  const cost = inv.purchasePrice * inv.quantity
                                  const gain = inv.currentValue - cost
                                  const gainPct = cost > 0 ? gain / cost : 0
                                  return (
                                    <tr key={inv.isin + inv.name}>
                                      <td className="name-cell" title={inv.name}>{inv.name}</td>
                                      <td>{inv.type}</td>
                                      <td className="num">{fmt(inv.currentValue)}</td>
                                      <td className={`num ${gain >= 0 ? 'positive' : 'negative'}`}>
                                        {gain >= 0 ? '+' : ''}{(gainPct * 100).toFixed(1)} %
                                      </td>
                                      <td>
                                        <select
                                          className="cat-select sub-select"
                                          value={inv.subcategory}
                                          onChange={(e) => {
                                            onCategoryChange(inv.isin || inv.name, inv.category, e.target.value)
                                            setTimeout(refreshRules, 50)
                                          }}
                                        >
                                          {getSubcategories(cat).map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td>
                                        <div className="cat-select-wrap">
                                          <select
                                            className="cat-select"
                                            value={inv.category}
                                            onChange={(e) => {
                                              onCategoryChange(inv.isin || inv.name, e.target.value as AssetCategory)
                                              setTimeout(refreshRules, 50)
                                            }}
                                          >
                                            {ALL_CATEGORIES.map((c) => (
                                              <option key={c} value={c}>{c}</option>
                                            ))}
                                          </select>
                                          {ruleKeys.has(inv.isin || inv.name) && (
                                            <span className="rule-badge" title="User-defined category">
                                              <UserCheck size={12} />
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {isOpen && items.length === 0 && (
                <div className="empty-state">No holdings in this category</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Learned Rules Panel */}
      <div className="card rules-card">
        <div
          className="card-title rules-header"
          onClick={() => setRulesOpen(!rulesOpen)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCheck size={16} />
            Learned Rules
            <span className="rules-count">{rules.length}</span>
          </span>
          {rulesOpen
            ? <ChevronDown size={14} color="var(--text-muted)" />
            : <ChevronRight size={14} color="var(--text-muted)" />}
        </div>

        {rulesOpen && (
          <div className="rules-body">
            {rules.length === 0 ? (
              <div className="empty-state">No learned rules yet. Change a category in the table above to teach the system.</div>
            ) : (
              <>
                <table className="holdings-table rules-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>ISIN</th>
                      <th>Category</th>
                      <th>Subcategory</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.isin || r.name}>
                        <td className="name-cell" title={r.name}>{r.name}</td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.78rem' }}>{r.isin || '—'}</td>
                        <td>
                          <span className="rule-cat-badge" style={{ background: CATEGORY_COLORS[r.category] + '22', color: CATEGORY_COLORS[r.category] }}>
                            {r.category}
                          </span>
                        </td>
                        <td>
                          <span className="sub-tag">{r.subcategory || '—'}</span>
                        </td>
                        <td>
                          <button
                            className="btn-icon-sm"
                            title="Delete rule"
                            onClick={() => handleDeleteRule(r.isin || r.name)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="rules-actions">
                  <div className="rules-actions-left">
                    <button className="btn btn-sm btn-ghost" onClick={exportRulesToJSON}>
                      <Download size={13} /> Export
                    </button>
                    <label className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }}>
                      <Upload size={13} /> Import
                      <input
                        type="file"
                        accept=".json"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleImportRules(f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                  <button className="btn btn-sm btn-ghost btn-danger-ghost" onClick={handleClearRules}>
                    <XCircle size={13} style={{ marginRight: 4 }} />
                    Clear all
                  </button>
                </div>
                {importMsg && (
                  <div className="import-msg">{importMsg}</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onReset}>
          Upload new CSV
        </button>
      </div>
    </div>
  )
}
