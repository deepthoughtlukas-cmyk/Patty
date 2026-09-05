import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
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


