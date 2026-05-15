import { useState, useCallback, useRef } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, UserCheck, Trash2, XCircle, Download, Upload, Plus, Coins, Layers, Globe, Settings, BarChart3, X } from 'lucide-react'
import type { Investment, AssetCategory } from '../utils/parser'
import {
  computeAllocation,
  computeSubAllocation,
  ALL_CATEGORIES,
  CATEGORY_COLORS,
  getSubcategoryColor,
  DEFAULT_SUBCATEGORIES,
} from '../utils/categorizer'
import type { SubWeight } from '../utils/categorizer'
import { loadRules, deleteRule, clearRules, exportRulesToJSON, importRulesFromFile, investmentKey, validIsin, type UserRule } from '../utils/userRules'
import { ALL_BROKERS, BROKER_COLORS, BROKER_SHORT, cycleOverride, buildAvailabilityMap, exportBrokerOverrides, importBrokerOverrides, clearBrokerOverrides, getBrokerOverrideCount, type BrokerName, type AvailabilityStatus } from '../utils/brokerAvailability'
import {
  loadDimensions,
  saveDimension,
  deleteDimension as deleteDimensionFn,
  generateDimensionId,
  computeDimensionAllocation,
  buildDimensionTagMap,
  runAutoTagging,
  setDimensionTag,
  getTagColor,
  exportDimension,
  importDimension,
  type Dimension,
  type DimensionAllocationItem,
} from '../utils/dimensions'
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
import { exportWorkspace, importWorkspace } from '../utils/workspace'

interface DashboardProps {
  investments: Investment[]
  onCategoryChange: (key: string, category: AssetCategory, subcategory?: string) => void
  onReset: () => void
  onRulesChanged?: () => void
  onAddAsset?: (asset: Investment) => void
  onDeleteAsset?: (key: string) => void
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

export default function Dashboard({ investments, onCategoryChange, onReset, onRulesChanged, onAddAsset, onDeleteAsset }: DashboardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [rules, setRules] = useState<UserRule[]>(() => loadRules())
  const [rulesOpen, setRulesOpen] = useState(false)
  const [addAssetOpen, setAddAssetOpen] = useState(false)
  const [newAsset, setNewAsset] = useState({ name: '', isin: '', currentValue: '', category: 'Stocks' as AssetCategory, subcategory: 'General' })
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [brokerVersion, setBrokerVersion] = useState(0)

  // Build broker availability map (recomputes when investments or overrides change)
  const brokerAvailMap = buildAvailabilityMap(investments, investmentKey)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _brokerDep = brokerVersion // force re-render on override toggle

  const handleCycleBroker = (assetKey: string, broker: BrokerName) => {
    cycleOverride(assetKey, broker)
    setBrokerVersion((v) => v + 1)
  }

  const handleImportBrokerOverrides = async (file: File) => {
    try {
      const count = await importBrokerOverrides(file)
      setBrokerVersion((v) => v + 1)
      setImportMsg(`${count} Broker-Overrides importiert`)
      setTimeout(() => setImportMsg(null), 3000)
    } catch (err) {
      setImportMsg(`Import fehlgeschlagen: ${String(err)}`)
      setTimeout(() => setImportMsg(null), 4000)
    }
  }

  const handleClearBrokerOverrides = () => {
    clearBrokerOverrides()
    setBrokerVersion((v) => v + 1)
  }

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

  // Tab state: 'allocation' or 'dimensions'
  const [activeTab, setActiveTab] = useState<'allocation' | 'dimensions'>('allocation')

  // Dimension state
  const [dimensions, setDimensions] = useState<Dimension[]>(() => loadDimensions())
  const [activeDimensionId, setActiveDimensionId] = useState<string>(() => {
    const dims = loadDimensions()
    return dims.length > 0 ? dims[0].id : ''
  })
  const [dimVersion, setDimVersion] = useState(0)
  const [showDimEditor, setShowDimEditor] = useState(false)
  const [showNewDim, setShowNewDim] = useState(false)
  const [newDimName, setNewDimName] = useState('')
  const [newDimTagInput, setNewDimTagInput] = useState('')
  const [editDimTagInput, setEditDimTagInput] = useState('')
  const dimImportRef = useRef<HTMLInputElement>(null)

  // Run auto-tagging when investments change
  const autoTagRan = useRef(false)
  if (investments.length > 0 && !autoTagRan.current) {
    runAutoTagging(investments)
    autoTagRan.current = true
  }

  const activeDimension = dimensions.find((d) => d.id === activeDimensionId) || dimensions[0]
  const dimAllocation: DimensionAllocationItem[] = activeDimension
    ? computeDimensionAllocation(investments, activeDimension)
    : []
  const dimTagMap = activeDimension ? buildDimensionTagMap(activeDimension.id) : new Map<string, string>()

  // Dimension handlers
  const refreshDimensions = () => {
    setDimensions(loadDimensions())
    setDimVersion((v) => v + 1)
  }

  const handleSetDimTag = (assetKey: string, dimId: string, tag: string) => {
    setDimensionTag(dimId, assetKey, tag, false)
    setDimVersion((v) => v + 1)
  }

  const handleCreateDimension = () => {
    if (!newDimName.trim()) return
    const dim: Dimension = {
      id: generateDimensionId(),
      name: newDimName.trim(),
      tags: [],
      color: '#60a5fa',
    }
    saveDimension(dim)
    refreshDimensions()
    setActiveDimensionId(dim.id)
    setNewDimName('')
    setShowNewDim(false)
    setShowDimEditor(true)
  }

  const handleDeleteDimension = (id: string) => {
    deleteDimensionFn(id)
    const updated = loadDimensions()
    setDimensions(updated)
    if (activeDimensionId === id && updated.length > 0) {
      setActiveDimensionId(updated[0].id)
    }
    setDimVersion((v) => v + 1)
  }

  const handleAddTagToDimension = (dimId: string, tagName: string) => {
    if (!tagName.trim()) return
    const dim = dimensions.find((d) => d.id === dimId)
    if (!dim || dim.tags.includes(tagName.trim())) return
    const updated = { ...dim, tags: [...dim.tags, tagName.trim()] }
    saveDimension(updated)
    refreshDimensions()
  }

  const handleRemoveTagFromDimension = (dimId: string, tagName: string) => {
    const dim = dimensions.find((d) => d.id === dimId)
    if (!dim) return
    const updated = { ...dim, tags: dim.tags.filter((t) => t !== tagName) }
    saveDimension(updated)
    refreshDimensions()
  }

  const handleExportDimension = () => {
    if (activeDimensionId) exportDimension(activeDimensionId)
  }

  const handleImportDimension = async (file: File) => {
    try {
      const id = await importDimension(file)
      refreshDimensions()
      setActiveDimensionId(id)
      setImportMsg('Dimension importiert')
      setTimeout(() => setImportMsg(null), 3000)
    } catch (err) {
      setImportMsg(`Import fehlgeschlagen: ${String(err)}`)
      setTimeout(() => setImportMsg(null), 4000)
    }
  }

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
  const ruleKeys = new Set(rules.map((r) => validIsin(r.isin) || r.name))

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
    downloadAnchorNode.setAttribute("download", "patty_profiles.json")
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
          localStorage.setItem('patty-target-profiles', JSON.stringify(parsed))
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

  // Extract gold price per gram from ETF and calculate 1 oz Philharmoniker price
  // ETF currentPrice = price per gram; 1 troy oz = 31.1035g; ~3% dealer premium for physical coin
  const TROY_OZ_IN_GRAMS = 31.1035
  const DEALER_PREMIUM = 1.03
  const goldEntry = investments.find((inv) => inv.sector.toLowerCase() === 'gold' && inv.name.toLowerCase().includes('gold'))
  const goldGramPrice = goldEntry?.currentPrice || 0
  const goldOzPrice = goldGramPrice * TROY_OZ_IN_GRAMS * DEALER_PREMIUM

  // Silver spot price per oz (manually maintained — no silver ETC in portfolio data)
  // Update this value periodically to reflect current market price
  const SILVER_OZ_PRICE_EUR = 30

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

      {/* Tab Switcher */}
      <div className="alloc-tabs">
        <button
          className={`alloc-tab${activeTab === 'allocation' ? ' active' : ''}`}
          onClick={() => setActiveTab('allocation')}
        >
          <BarChart3 size={14} className="tab-icon" />
          Allocation
        </button>
        <button
          className={`alloc-tab${activeTab === 'dimensions' ? ' active' : ''}`}
          onClick={() => setActiveTab('dimensions')}
        >
          <Layers size={14} className="tab-icon" />
          Dimensionen
        </button>
      </div>

      {activeTab === 'allocation' && (
      <>
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
                          <span className="weight-dot" style={{ background: getSubcategoryColor(sub, cat) }} />
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
                            style={{ accentColor: getSubcategoryColor(sub, cat) }}
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
                    <span style={{ color: a.deviation > 0.005 ? 'var(--green)' : a.deviation < -0.005 ? 'var(--red)' : 'var(--text-primary)' }}>
                      {fmtPct(a.percentage)}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}> / {fmtPct(a.targetPercentage)}</span>
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
          {[...allocation].sort((a, b) => b.deviation - a.deviation).map((a) => {
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
                  <span className="rebalance-item-name" title={a.category === 'Safe-Haven Gold' && goldOzPrice > 0 ? `1 oz Gold: ${fmtEur(goldOzPrice)}` : undefined}>{a.category}</span>
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
                  {/* Philharmoniker coin indicator for Safe-Haven Gold */}
                  {a.category === 'Safe-Haven Gold' && diff > 0 && goldOzPrice > 0 && absDiff >= goldOzPrice && (
                    <span title={`Buy recommendation ≥ 1 oz Philharmoniker (${fmtEur(goldOzPrice)})`} style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 6 }}>
                      <Coins size={16} color="var(--gold)" />
                    </span>
                  )}
                  <span className="rebalance-actual" style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 500 }} title="Actual % / Target % of total portfolio">
                    {(a.percentage * 100).toFixed(1)}% / {(a.targetPercentage * 100).toFixed(1)}% Portfolio
                  </span>
                </div>

                {/* Subcategory rebalancing */}
                {hasMultipleSubs && rebalSubVisible && (
                  <div className="sub-rebalance-list">
                    {[...subAlloc]
                      .filter((sa) => sa.targetPercentage > 0)
                      .sort((x, y) => {
                        const xDev = (a.percentage * x.percentage) - (a.targetPercentage * x.targetPercentage)
                        const yDev = (a.percentage * y.percentage) - (a.targetPercentage * y.targetPercentage)
                        return yDev - xDev
                      })
                      .map((sa) => {
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
                          <span className="rebalance-item-name sub-rebalance-name" title={sa.subcategory === 'Silber' && SILVER_OZ_PRICE_EUR > 0 ? `1 oz Silber: ~${fmtEur(SILVER_OZ_PRICE_EUR)}` : undefined}>{sa.subcategory}</span>
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
                          <span className="rebalance-sub-actual" style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 500 }} title="Actual % / Target % of total portfolio">
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
      </>
      )}

      {activeTab === 'dimensions' && (
        <div className="card dim-panel" style={{ marginBottom: 24 }}>
          <div className="card-title">
            <Globe size={14} />
            Cross-Dimension Analysis
          </div>

          {/* Top bar: dimension selector + actions */}
          <div className="dim-top-bar">
            <div className="dim-selector">
              <select
                className="cat-select"
                value={activeDimensionId}
                onChange={(e) => {
                  setActiveDimensionId(e.target.value)
                  setShowDimEditor(false)
                }}
              >
                {dimensions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="dim-actions">
              <button
                className="btn btn-sm btn-ghost"
                onClick={handleExportDimension}
                title="Dimension exportieren"
              >
                <Download size={13} />
              </button>
              <label className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }} title="Dimension importieren">
                <Upload size={13} />
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  ref={dimImportRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleImportDimension(f)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                className={`btn btn-sm btn-ghost${showDimEditor ? ' active' : ''}`}
                onClick={() => setShowDimEditor(!showDimEditor)}
                title="Dimension bearbeiten"
              >
                <Settings size={13} />
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setShowNewDim(!showNewDim)}
                title="Neue Dimension"
              >
                <Plus size={13} /> Neu
              </button>
            </div>
          </div>

          {/* New dimension form */}
          {showNewDim && (
            <div className="new-dim-form">
              <div className="new-dim-form-title">Neue Dimension erstellen</div>
              <div className="new-dim-fields">
                <div className="new-dim-field" style={{ flex: 1 }}>
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder="z.B. Thema, Risiko..."
                    value={newDimName}
                    onChange={(e) => setNewDimName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateDimension()}
                  />
                </div>
                <button
                  className="btn btn-sm btn-gold"
                  onClick={handleCreateDimension}
                  disabled={!newDimName.trim()}
                  style={{ marginBottom: 1 }}
                >
                  Erstellen
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => { setShowNewDim(false); setNewDimName('') }}
                  style={{ marginBottom: 1 }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Dimension editor */}
          {showDimEditor && activeDimension && (
            <div className="dim-editor">
              <div className="dim-editor-title">
                {activeDimension.name} — Tags verwalten
              </div>
              <div className="dim-editor-tags">
                {activeDimension.tags.map((tag) => (
                  <span className="dim-editor-tag" key={tag}>
                    <span
                      className="dim-bar-tag-dot"
                      style={{ background: getTagColor(activeDimension, tag), width: 8, height: 8 }}
                    />
                    {tag}
                    <span
                      className="remove-tag"
                      onClick={() => handleRemoveTagFromDimension(activeDimension.id, tag)}
                    >
                      <X size={12} />
                    </span>
                  </span>
                ))}
                {activeDimension.tags.length === 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Keine Tags — füge welche hinzu
                  </span>
                )}
              </div>
              <div className="dim-editor-add-row">
                <input
                  type="text"
                  placeholder="Neuer Tag..."
                  value={editDimTagInput}
                  onChange={(e) => setEditDimTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddTagToDimension(activeDimension.id, editDimTagInput)
                      setEditDimTagInput('')
                    }
                  }}
                />
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    handleAddTagToDimension(activeDimension.id, editDimTagInput)
                    setEditDimTagInput('')
                  }}
                  disabled={!editDimTagInput.trim()}
                >
                  <Plus size={11} /> Hinzufügen
                </button>
              </div>
              {/* Delete dimension button (not for defaults) */}
              {activeDimension.id !== 'geo' && activeDimension.id !== 'market-type' && (
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-sm btn-ghost btn-danger-ghost"
                    onClick={() => handleDeleteDimension(activeDimension.id)}
                  >
                    <Trash2 size={12} /> Dimension löschen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Dimension allocation content */}
          {activeDimension && dimAllocation.length > 0 && (
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'center' }}>
              {/* Donut chart */}
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={dimAllocation.map((a) => ({
                      name: a.tag,
                      value: a.percentage,
                      color: a.color,
                      targetPct: 0,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {dimAllocation.map((a, i) => (
                      <Cell key={i} fill={a.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]
                      const item = dimAllocation.find((a) => a.tag === d.name)
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
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
                          <div style={{ color: 'var(--text-secondary)' }}>
                            {((d.value as number) * 100).toFixed(1)} % · {fmtEur(item?.value || 0)}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                            {item?.assetCount || 0} Assets
                          </div>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="legend">
                {dimAllocation.map((a) => (
                  <div className="legend-item" key={a.tag}>
                    <span className="legend-dot" style={{ background: a.color }} />
                    <span className="legend-name">{a.tag}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginRight: 4 }}>
                      {a.assetCount}
                    </span>
                    <span className="legend-pct">{(a.percentage * 100).toFixed(1)} %</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeDimension && dimAllocation.length === 0 && (
            <div className="empty-state">
              Keine Assets mit Tags in dieser Dimension. Weise Tags über die Holdings-Tabelle zu.
            </div>
          )}
        </div>
      )}

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
                          <span className="sub-dot" style={{ background: getSubcategoryColor(sub, cat) }} />
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
                                  <th>Broker</th>
                                  {activeDimension && (
                                    <th title={activeDimension.name}>{activeDimension.name.slice(0, 10)}</th>
                                  )}
                                  <th>Subcategory</th>
                                  <th>Category</th>
                                  <th style={{ width: 36 }}></th>
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
                                        <div className="broker-badges">
                                          {ALL_BROKERS.map((broker) => {
                                            const assetKey = investmentKey(inv)
                                            const status: AvailabilityStatus = brokerAvailMap.get(assetKey)?.[broker] ?? 'unavailable'
                                            const isOn = status === 'available' || status === 'override-on'
                                            const isOverride = status === 'override-on' || status === 'override-off'
                                            const title = `${broker}: ${status === 'available' ? 'Verfügbar (auto)' : status === 'unavailable' ? 'Nicht verfügbar (auto)' : status === 'override-on' ? 'Manuell: Verfügbar ✓' : 'Manuell: Nicht verfügbar ✗'}\nKlick zum Umschalten`
                                            return (
                                              <button
                                                key={broker}
                                                className={`broker-badge ${isOn ? 'broker-active' : ''} ${isOverride ? 'broker-override' : ''}`}
                                                style={isOn ? {
                                                  background: BROKER_COLORS[broker] + '20',
                                                  borderColor: BROKER_COLORS[broker] + '60',
                                                  color: BROKER_COLORS[broker],
                                                } : {}}
                                                title={title}
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleCycleBroker(assetKey, broker)
                                                }}
                                              >
                                                {BROKER_SHORT[broker]}
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </td>
                                      {activeDimension && (
                                        <td>
                                          <select
                                            className="cat-select dim-tag-select"
                                            value={dimTagMap.get(investmentKey(inv)) || ''}
                                            onChange={(e) => {
                                              handleSetDimTag(investmentKey(inv), activeDimension.id, e.target.value)
                                            }}
                                          >
                                            <option value="">—</option>
                                            {activeDimension.tags.map((tag) => (
                                              <option key={tag} value={tag}>{tag}</option>
                                            ))}
                                          </select>
                                        </td>
                                      )}
                                      <td>
                                        <select
                                          className="cat-select sub-select"
                                          value={inv.subcategory}
                                          onChange={(e) => {
                                            onCategoryChange(investmentKey(inv), inv.category, e.target.value)
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
                                              onCategoryChange(investmentKey(inv), e.target.value as AssetCategory)
                                              setTimeout(refreshRules, 50)
                                            }}
                                          >
                                            {ALL_CATEGORIES.map((c) => (
                                              <option key={c} value={c}>{c}</option>
                                            ))}
                                          </select>
                                          {ruleKeys.has(investmentKey(inv)) && (
                                            <span className="rule-badge" title="User-defined category">
                                              <UserCheck size={12} />
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td>
                                        <button
                                          className="btn-icon-sm btn-delete-asset"
                                          title="Remove asset"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            onDeleteAsset?.(investmentKey(inv))
                                          }}
                                        >
                                          <Trash2 size={13} />
                                        </button>
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

      {/* Broker Overrides Panel */}
      {getBrokerOverrideCount() > 0 && (
        <div className="card rules-card" style={{ marginTop: 12 }}>
          <div className="card-title" style={{ fontSize: '0.85rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Coins size={14} />
              Broker Overrides
              <span className="rules-count">{getBrokerOverrideCount()}</span>
            </span>
          </div>
          <div className="rules-actions" style={{ marginTop: 8 }}>
            <div className="rules-actions-left">
              <button className="btn btn-sm btn-ghost" onClick={exportBrokerOverrides}>
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
                    if (f) handleImportBrokerOverrides(f)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            <button className="btn btn-sm btn-ghost btn-danger-ghost" onClick={handleClearBrokerOverrides}>
              <XCircle size={13} style={{ marginRight: 4 }} />
              Clear all
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
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
                  setImportMsg(String(err))
                  setTimeout(() => setImportMsg(null), 4000)
                }
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <button className="btn btn-ghost" onClick={onReset}>
          Upload new CSV
        </button>
      </div>
    </div>
  )
}
