import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import Dashboard from './Dashboard'

// Mock Recharts to avoid issues with ResizeObserver in jsdom
vi.mock('recharts', async () => {
  const Original = await vi.importActual('recharts')
  return {
    ...Original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  }
})

describe('Dashboard Interactive UI Tests', () => {
  const mockInvestments = [
    { id: 'inv1', name: 'Apple Inc.', isin: 'US0378331005', type: 'Stocks', category: 'Stocks', currentValue: 1000, quantity: 10, purchasePrice: 500, sector: 'Technology', region: 'USA', currency: 'EUR', depository: '' },
    { id: 'inv2', name: 'Microsoft', isin: 'US5949181045', type: 'Stocks', category: 'Stocks', currentValue: 2000, quantity: 20, purchasePrice: 1000, sector: 'Technology', region: 'USA', currency: 'EUR', depository: '' }
  ]

  it('renders dashboard with mock data', async () => {
    render(<Dashboard investments={mockInvestments} onCategoryChange={vi.fn()} />)
    
    // Check if total portfolio value is somewhat rendered (Apple + MS = 3000)
    await waitFor(() => {
      expect(screen.getAllByText(/3\.000,00/i)[0]).toBeInTheDocument()
    })
  })

  it('can switch tabs', async () => {
    const user = userEvent.setup()
    render(<Dashboard investments={mockInvestments} onCategoryChange={vi.fn()} />)
    
    // The "Dimensionen" tab is visible in the HTML dump
    const dimensionsTab = await screen.findByRole('button', { name: /Dimensionen/i })
    expect(dimensionsTab).toBeInTheDocument()
    
    await user.click(dimensionsTab)
    // Just verify no crash occurred
  })

  it('renders rebalancing recommendation tooltips with exact recommendations', async () => {
    render(<Dashboard investments={mockInvestments} onCategoryChange={vi.fn()} />)
    
    await waitFor(() => {
      const elements = screen.getAllByText('Stocks')
      const rebalItem = elements.map(el => el.closest('.rebalance-item')).find(Boolean)
      expect(rebalItem).toBeInTheDocument()
      expect(rebalItem?.getAttribute('title')).toContain('Stocks - Rebalancing Empfehlung')
      expect(rebalItem?.getAttribute('title')).toContain('Empfehlung:')
      expect(rebalItem?.getAttribute('title')).toContain('Ist-Wert:')
      expect(rebalItem?.getAttribute('title')).toContain('Soll-Wert:')
    })
  })

  it('can open silver coin denomination dialog and click Münze hinzufügen', async () => {
    const user = userEvent.setup()
    const silverInvestments = [
      {
        name: 'Silber Phils',
        isin: 'XC0009653103',
        quantity: 10,
        currentValue: 300,
        category: 'Performance Gold',
        subcategory: 'Silber',
        type: 'Münzen',
        currency: 'EUR',
        exchangeRate: 1,
        purchasePrice: 250,
        currentPrice: 30,
        sector: '',
        region: ''
      }
    ]

    render(<Dashboard investments={silverInvestments} onCategoryChange={vi.fn()} />)

    // Find the Münz-Stückelung button
    const splitButton = await screen.findByTitle('Münz-Stückelung')
    expect(splitButton).toBeInTheDocument()
    await user.click(splitButton)

    // The modal should now be visible
    expect(await screen.findByText(/Münz-Stückelung: Silber Phils/i)).toBeInTheDocument()
    expect(screen.getByText(/Keine Münzen definiert/i)).toBeInTheDocument()

    // Click "Münze hinzufügen"
    const addCoinButton = screen.getByRole('button', { name: /Münze hinzufügen/i })
    expect(addCoinButton).toBeInTheDocument()
    await user.click(addCoinButton)

    // Verify if a coin row was added
    expect(screen.queryByText(/Keine Münzen definiert/i)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Philharmoniker Silber')).toBeInTheDocument()
  })

  it('applies Core as reference for Stocks rebalancing recommendations (Options A & B)', async () => {
    const user = userEvent.setup()
    const stockInvestments = [
      { id: 'c1', name: 'Core MSCI World', isin: 'IE00B4L5Y983', type: 'Stocks', category: 'Stocks', subcategory: 'Core', currentValue: 1000, quantity: 10, purchasePrice: 80, sector: 'Broad Market', region: 'Global', currency: 'EUR', depository: '' },
      { id: 's1', name: 'Nvidia Corp', isin: 'US67066G1040', type: 'Stocks', category: 'Stocks', subcategory: 'AI', currentValue: 500, quantity: 5, purchasePrice: 50, sector: 'Technology', region: 'USA', currency: 'EUR', depository: '' },
      { id: 'b1', name: 'Bonds ETF', isin: 'LU0290358497', type: 'Anleihen', category: 'Bonds', subcategory: 'General', currentValue: 8500, quantity: 80, purchasePrice: 100, sector: 'Government', region: 'Global', currency: 'EUR', depository: '' }
    ]

    render(<Dashboard investments={stockInvestments} onCategoryChange={vi.fn()} />)

    // Stocks is currently at 1500 / 10000 = 15%, but target is 45% (underweight by 3000)
    await waitFor(() => {
      // Option A: Stocks category badge shows Buy Core
      const elements = screen.getAllByText('Stocks')
      const stocksRebalItem = elements.map(el => el.closest('.rebalance-item')).find(Boolean)
      expect(stocksRebalItem).toBeInTheDocument()
      expect(stocksRebalItem?.getAttribute('title')).toContain('Core-First')
      expect(stocksRebalItem?.getAttribute('title')).toContain('KAUFEN')
      expect(stocksRebalItem?.getAttribute('title')).toContain('in Core')

      // Core has "Anker" badge
      expect(screen.getByText('Anker')).toBeInTheDocument()

      // Satellite AI is held (subIsOk) because Stocks is underweight and Core has priority
      const aiItems = screen.getAllByText('AI')
      const aiRebalItem = aiItems.map(el => el.closest('.rebalance-item')).find(Boolean)
      expect(aiRebalItem).toBeInTheDocument()
      expect(aiRebalItem?.getAttribute('title')).toContain('[Core-First]')
      expect(aiRebalItem?.getAttribute('title')).toContain('Halten')
    })

    // Now test switching to "Standard (Parallel)" method
    const standardBtn = screen.getByRole('button', { name: /Standard \(Parallel\)/i })
    await user.click(standardBtn)

    // Under Standard mode, satellite AI now calculates independent rebalancing
    await waitFor(() => {
      const aiItems = screen.getAllByText('AI')
      const aiRebalItem = aiItems.map(el => el.closest('.rebalance-item')).find(Boolean)
      expect(aiRebalItem?.getAttribute('title')).not.toContain('[Core-First]')
    })

    // Now test clicking the interactive slider track to toggle back to Core-First
    const sliderTrack = screen.getByRole('slider', { name: /Rebalancing Methode Schieberegler/i })
    expect(sliderTrack).toBeInTheDocument()
    await user.click(sliderTrack)

    // It should switch back to Core-First
    await waitFor(() => {
      const aiItems = screen.getAllByText('AI')
      const aiRebalItem = aiItems.map(el => el.closest('.rebalance-item')).find(Boolean)
      expect(aiRebalItem?.getAttribute('title')).toContain('[Core-First]')
    })
  })

  it('correctly requires Core buy and holds satellites when Stocks is slightly underweight (e.g. 54.1% vs 55.0%)', async () => {
    // Total 100,000: Stocks = 54,100 (54.1%), Bonds = 45,900
    // Within Stocks: Core = 28,000 (28.0%), Dividend = 8,900 (8.9%), AI = 17,200 (17.2%)
    const stockPortfolio = [
      { id: 'c1', name: 'Core MSCI World', isin: 'IE00B4L5Y983', type: 'Stocks', category: 'Stocks', subcategory: 'Core', currentValue: 28000, quantity: 280, purchasePrice: 100, sector: 'Broad', region: 'Global', currency: 'EUR', depository: '' },
      { id: 'd1', name: 'Allianz Dividend', isin: 'DE0008404005', type: 'Stocks', category: 'Stocks', subcategory: 'Dividend', currentValue: 8900, quantity: 89, purchasePrice: 100, sector: 'Finance', region: 'Europe', currency: 'EUR', depository: '' },
      { id: 'a1', name: 'Nvidia AI', isin: 'US67066G1040', type: 'Stocks', category: 'Stocks', subcategory: 'AI', currentValue: 17200, quantity: 172, purchasePrice: 100, sector: 'Tech', region: 'USA', currency: 'EUR', depository: '' },
      { id: 'b1', name: 'Bund Anleihe', isin: 'DE0001102341', type: 'Bonds', category: 'Bonds', subcategory: 'General', currentValue: 45900, quantity: 459, purchasePrice: 100, sector: 'Gov', region: 'Europe', currency: 'EUR', depository: '' },
    ]

    // Set target profile with Stocks = 55% (0.55), Core = 50% of stocks (0.50)
    localStorage.setItem('patty-target-profiles', JSON.stringify([{
      id: 'incrementum-60-40',
      name: 'Incrementum 60/40',
      weights: { Stocks: 0.55, Bonds: 0.45, 'Safe-Haven Gold': 0, 'Performance Gold': 0, Commodities: 0, Bitcoin: 0, Altcoins: 0 },
      subWeights: { Stocks: [{ name: 'Core', weight: 0.50 }, { name: 'Dividend', weight: 0.20 }, { name: 'AI', weight: 0.30 }] }
    }]))
    localStorage.setItem('patty-rebalance-method', 'core-first')

    render(<Dashboard investments={stockPortfolio} onCategoryChange={vi.fn()} />)

    await waitFor(() => {
      // 1. Stocks category badge must show Buy Core (NOT "On Target"!)
      const elements = screen.getAllByText('Stocks')
      const stocksRebalItem = elements.map(el => el.closest('.rebalance-item')).find(Boolean)
      expect(stocksRebalItem).toBeInTheDocument()
      expect(stocksRebalItem?.textContent).toContain('Buy Core')

      // 2. Core subcategory must show Buy (NOT "OK"!)
      const coreItems = screen.getAllByText('Core')
      const coreRebalItem = coreItems.map(el => el.closest('.rebalance-item')).find(Boolean)
      expect(coreRebalItem).toBeInTheDocument()
      expect(coreRebalItem?.textContent).toContain('Buy')

      // 3. Dividend must be held (NOT "Sell"!)
      const divItems = screen.getAllByText('Dividend')
      const divRebalItem = divItems.map(el => el.closest('.rebalance-item')).find(Boolean)
      expect(divRebalItem).toBeInTheDocument()
      expect(divRebalItem?.textContent).toContain('Halten')
      expect(divRebalItem?.textContent).not.toContain('Sell')
    })
  })
})

describe('Dashboard Metal Prices Live Fetch', () => {
  const metalInvestments = [
    {
      name: 'Gold',
      isin: 'XC0009655157',
      wkn: 'N/A',
      type: 'Edelmetalle',
      category: 'Safe-Haven Gold' as const,
      subcategory: 'Münzen',
      currentValue: 4000,
      currentPrice: 2000,
      quantity: 2,
      purchasePrice: 1800,
      sector: 'Gold',
      region: 'Global',
      currency: 'EUR',
      exchangeRate: 1,
    },
    {
      name: 'Silber',
      isin: 'XC0009653103',
      wkn: 'N/A',
      type: 'Edelmetalle',
      category: 'Performance Gold' as const,
      subcategory: 'Silber',
      currentValue: 300,
      currentPrice: 30,
      quantity: 10,
      purchasePrice: 25,
      sector: 'Edelmetalle & Mineralien',
      region: 'Global',
      currency: 'EUR',
      exchangeRate: 1,
    },
  ]

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('loads Gold and Silver EUR prices on button click, updates localStorage and recalculates portfolio values', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://api.gold-api.com/price/XAU/EUR') {
        return new Response(JSON.stringify({ price: 3225.09, updatedAt: '2026-11-22T14:00:10Z' }), { status: 200 })
      }
      if (url === 'https://api.gold-api.com/price/XAG/EUR') {
        return new Response(JSON.stringify({ price: 37.44, updatedAt: '2026-11-22T14:00:09Z' }), { status: 200 })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<Dashboard investments={metalInvestments} onCategoryChange={vi.fn()} />)

    // Initial portfolio total = 4000 + 300 = 4.300,00
    expect(screen.getByText(/4\.300,00/)).toBeInTheDocument()

    const fetchBtn = screen.getByRole('button', { name: /Gold & Silber laden/i })
    await user.click(fetchBtn)

    await waitFor(() => {
      expect(screen.getByText(/3\.225,09/)).toBeInTheDocument()
      expect(screen.getByText(/37,44/)).toBeInTheDocument()
    })

    expect(localStorage.getItem('patty-manual-gold')).toBe('3225.09')
    expect(localStorage.getItem('patty-manual-silver')).toBe('37.44')

    // Recalculated portfolio value: 2 * 3225.09 + 10 * 37.44 = 6450.18 + 374.40 = 6.824,58
    await waitFor(() => {
      expect(screen.getByText(/6\.824,58/)).toBeInTheDocument()
    })
  })

  it('shows an error alert and preserves existing prices when all providers fail', async () => {
    const user = userEvent.setup()
    localStorage.setItem('patty-manual-gold', '2900')
    localStorage.setItem('patty-manual-silver', '32')

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'down' }), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<Dashboard investments={metalInvestments} onCategoryChange={vi.fn()} />)

    const fetchBtn = screen.getByRole('button', { name: /Gold & Silber laden/i })
    await user.click(fetchBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Edelmetallpreise konnten nicht geladen werden/i)
    })

    expect(localStorage.getItem('patty-manual-gold')).toBe('2900')
    expect(localStorage.getItem('patty-manual-silver')).toBe('32')
    expect(screen.getByText(/2\.900,00/)).toBeInTheDocument()
    expect(screen.getByText(/32,00/)).toBeInTheDocument()
  })

  it('resets prices and restores original CSV portfolio values when clicking reset', async () => {
    const user = userEvent.setup()
    localStorage.setItem('patty-manual-gold', '3225.09')
    localStorage.setItem('patty-manual-silver', '37.44')

    render(<Dashboard investments={metalInvestments} onCategoryChange={vi.fn()} />)

    // Overridden portfolio value is shown initially: 6.824,58
    await waitFor(() => {
      expect(screen.getByText(/6\.824,58/)).toBeInTheDocument()
    })

    const resetBtn = screen.getByRole('button', { name: /Edelmetallpreise zurücksetzen/i })
    await user.click(resetBtn)

    await waitFor(() => {
      expect(localStorage.getItem('patty-manual-gold')).toBe('0')
      expect(localStorage.getItem('patty-manual-silver')).toBe('0')
      expect(screen.getByText(/4\.300,00/)).toBeInTheDocument()
    })
  })
})

describe('Dashboard Precious Metal Ounces & Depository Summary', () => {
  const portfolioWithMetals = [
    {
      name: 'Gold',
      isin: 'XC0009655157',
      wkn: 'N/A',
      type: 'Edelmetalle',
      category: 'Safe-Haven Gold' as const,
      subcategory: 'Münzen',
      currentValue: 6450.28,
      currentPrice: 3904.8,
      quantity: 1.652,
      purchasePrice: 2504.26,
      sector: 'Gold',
      region: 'Global',
      currency: 'EUR',
      exchangeRate: 1,
    },
    {
      name: 'DT.BOERSE COM. XETRA-GOLD',
      isin: 'DE000A0S9GB0',
      wkn: 'A0S9GB',
      type: 'Edelmetalle',
      category: 'Safe-Haven Gold' as const,
      subcategory: 'ETF',
      currentValue: 3525.14,
      currentPrice: 125.9,
      quantity: 28,
      purchasePrice: 75.84,
      sector: 'Gold',
      region: 'Global',
      currency: 'EUR',
      exchangeRate: 1,
    },
    {
      name: 'Silber',
      isin: 'XC0009653103',
      wkn: 'N/A',
      type: 'Edelmetalle',
      category: 'Performance Gold' as const,
      subcategory: 'Silber',
      currentValue: 587.63,
      currentPrice: 65.29,
      quantity: 9,
      purchasePrice: 54.32,
      sector: 'Edelmetalle & Mineralien',
      region: 'Global',
      currency: 'EUR',
      exchangeRate: 1,
    },
    {
      name: 'XTRACK. ETC SILBER 80',
      isin: 'DE000A2T0VS9',
      wkn: 'A2T0VS',
      type: 'Edelmetalle',
      category: 'Performance Gold' as const,
      subcategory: 'Silber',
      currentValue: 1317.19,
      currentPrice: 94.09,
      quantity: 14,
      purchasePrice: 89.77,
      sector: 'Roh-, Hilfs- & Betriebsstoffe',
      region: 'Global',
      currency: 'EUR',
      exchangeRate: 1,
    },
    {
      name: 'Core MSCI World',
      isin: 'IE00B4L5Y983',
      wkn: 'A0RPWH',
      type: 'ETF',
      category: 'Stocks' as const,
      subcategory: 'Core',
      currentValue: 10000,
      currentPrice: 100,
      quantity: 100,
      purchasePrice: 80,
      sector: 'Broad',
      region: 'Global',
      currency: 'EUR',
      exchangeRate: 1,
    },
  ]

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    localStorage.setItem(
      'patty-depository-list',
      JSON.stringify(['Kleiderschrank', 'Flatex', 'Gold Avenue'])
    )
    localStorage.setItem(
      'patty-depositories',
      JSON.stringify({
        XC0009655157: 'Kleiderschrank',
        XC0009653103: 'Kleiderschrank',
        DE000A0S9GB0: 'Flatex',
        DE000A2T0VS9: 'Flatex',
      })
    )
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('displays ounces per precious-metal asset in Holdings and omits the Unzen column for Stocks', async () => {
    render(<Dashboard investments={portfolioWithMetals} onCategoryChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getAllByText('Unzen').length).toBeGreaterThan(0)
    })

    const goldRow = screen.getAllByText('Gold').map(el => el.closest('tr')).find(Boolean) ?? null
    expect(goldRow).not.toBeNull()
    expect(within(goldRow!).getByText('1,652 oz')).toBeInTheDocument()

    const xetraRow = screen.getByText('DT.BOERSE COM. XETRA-GOLD').closest('tr')
    expect(xetraRow).not.toBeNull()
    expect(within(xetraRow!).getByText('0,90 oz')).toBeInTheDocument()

    const silverRow = screen.getAllByText('Silber').map(el => el.closest('tr')).find(Boolean) ?? null
    expect(silverRow).not.toBeNull()
    expect(within(silverRow!).getByText('9,00 oz')).toBeInTheDocument()

    const xtrackersRow = screen.getByText('XTRACK. ETC SILBER 80').closest('tr')
    expect(xtrackersRow).not.toBeNull()
    expect(within(xtrackersRow!).getByText('20,02 oz')).toBeInTheDocument()

    const stocksTable = screen.getByText('Core MSCI World').closest('table')
    expect(stocksTable).not.toBeNull()
    expect(within(stocksTable!).queryByText('Unzen')).not.toBeInTheDocument()
  })

  it('shows the top Unzen pro Lagerstätte summary and updates when a depository changes', async () => {
    const user = userEvent.setup()
    const { container } = render(<Dashboard investments={portfolioWithMetals} onCategoryChange={vi.fn()} />)

    const summary = container.querySelector('.metal-depo-summary')
    expect(summary).toBeInTheDocument()

    const sWithin = within(summary as HTMLElement)
    expect(sWithin.getByText('Unzen pro Lagerstätte')).toBeInTheDocument()
    expect(sWithin.getByText('2,552 oz Gold')).toBeInTheDocument()
    expect(sWithin.getByText('29,02 oz Silber')).toBeInTheDocument()

    expect(sWithin.getByText('Kleiderschrank')).toBeInTheDocument()
    expect(sWithin.getByText('1,652 oz Gold')).toBeInTheDocument()
    expect(sWithin.getByText('9,00 oz Silber')).toBeInTheDocument()

    expect(sWithin.getByText('Flatex')).toBeInTheDocument()
    expect(sWithin.getByText('0,90 oz Gold')).toBeInTheDocument()
    expect(sWithin.getByText('20,02 oz Silber')).toBeInTheDocument()

    // Change Silber depository from Kleiderschrank to Gold Avenue
    const silverRow = screen.getAllByText('Silber').map(el => el.closest('tr')).find(Boolean)!
    const depoSelect = within(silverRow).getAllByRole('combobox')[0]
    await user.selectOptions(depoSelect, 'Gold Avenue')

    await waitFor(() => {
      expect(sWithin.getByText('Gold Avenue')).toBeInTheDocument()
      expect(sWithin.getAllByText('9,00 oz Silber').length).toBeGreaterThan(0)
    })

    // Kleiderschrank should now only have Gold, not Silber
    const kleiderschrankCard = sWithin.getByText('Kleiderschrank').closest('.metal-depo-card') as HTMLElement
    expect(within(kleiderschrankCard).getByText('1,652 oz Gold')).toBeInTheDocument()
    expect(within(kleiderschrankCard).queryByText(/Silber/)).not.toBeInTheDocument()
  })
})




