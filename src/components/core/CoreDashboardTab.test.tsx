import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { Investment } from '../../utils/parser'
import { CoreDashboardTab } from './CoreDashboardTab'

vi.mock('recharts', async () => {
  const Original = await vi.importActual('recharts')
  return {
    ...Original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  }
})

describe('CoreDashboardTab 3-Level Cockpit', () => {
  const coreInvestments: Investment[] = [
    {
      name: 'ISHARES EDGE MSCI WLD QUAL FCTR ETF',
      isin: 'IE00BP3QZ601',
      wkn: 'A12ATE',
      type: 'ETF',
      quantity: 124,
      purchasePrice: 64,
      currentPrice: 73.45,
      currentValue: 9108,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Global',
      sector: 'Broad',
      category: 'Stocks',
      subcategory: 'Core',
    },
    {
      name: 'XTRACKERS MSCI WORLD ETF',
      isin: 'IE00BJ0KDQ92',
      wkn: 'A1XB5U',
      type: 'ETF',
      quantity: 45,
      purchasePrice: 112,
      currentPrice: 135.04,
      currentValue: 6077,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Global',
      sector: 'Broad',
      category: 'Stocks',
      subcategory: 'Core',
    },
    {
      name: 'XTRACKERS MSCI EUROPE SMALL CAP ETF',
      isin: 'LU0322253906',
      wkn: 'DBX1AU',
      type: 'ETF',
      quantity: 20,
      purchasePrice: 55,
      currentPrice: 66.75,
      currentValue: 1335,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Europa',
      sector: 'Broad',
      category: 'Stocks',
      subcategory: 'Core',
    },
    {
      name: 'ISHARES MSCI INDIA ETF',
      isin: 'IE00BZCQB185',
      wkn: 'A2AFCY',
      type: 'ETF',
      quantity: 60,
      purchasePrice: 8.7,
      currentPrice: 7.45,
      currentValue: 447,
      currency: 'EUR',
      exchangeRate: 1,
      region: 'Indien',
      sector: 'Broad',
      category: 'Stocks',
      subcategory: 'Core',
    },
  ]

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders the 3-level cockpit with collapsed expert drawers when all ETFs have profiles', () => {
    render(<CoreDashboardTab investments={coreInvestments} suggestedCoreBuy={1000} />)

    expect(screen.getByText('Core-Fit')).toBeInTheDocument()
    expect(screen.getByText('Regionen-Verteilung')).toBeInTheDocument()
    expect(screen.getByText('Market Cap (Large / Mid / Small)')).toBeInTheDocument()
    expect(screen.getByText('Fahrplan zur optimalen Gewichtung')).toBeInTheDocument()

    const simDrawerBtn = screen.getByRole('button', { name: /Manuell simulieren \(What-If\)/i })
    const holdingsDrawerBtn = screen.getByRole('button', { name: /Core-ETFs & Profil-Zuordnung/i })

    expect(simDrawerBtn).toHaveAttribute('aria-expanded', 'false')
    expect(holdingsDrawerBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('switches exposure tabs between Regionen & Cap, Länder, and Währungen & Faktoren', async () => {
    const user = userEvent.setup()
    render(<CoreDashboardTab investments={coreInvestments} suggestedCoreBuy={1000} />)

    await user.click(screen.getByRole('tab', { name: 'Länder' }))
    expect(screen.getByText(/Länder-Exposure/i)).toBeInTheDocument()
    expect(screen.getByText('USA')).toBeInTheDocument()
    expect(screen.getByText('Indien')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Währungen & Faktoren' }))
    expect(screen.getByText(/Cashflow-Währungen/i)).toBeInTheDocument()
    expect(screen.getByText('Quality')).toBeInTheDocument()
    expect(screen.getByText('Size (Small Cap)')).toBeInTheDocument()
  })

  it('previews Heute, Nach 12 M, and Ziel scenarios in KPI & Ist-vs-Soll view', async () => {
    const user = userEvent.setup()
    render(<CoreDashboardTab investments={coreInvestments} suggestedCoreBuy={1000} />)

    const scenarioBar = screen.getByLabelText('Szenario Vorschau')
    await user.click(within(scenarioBar).getByRole('button', { name: 'Ziel' }))
    expect(screen.getByText('100 / 100')).toBeInTheDocument()
    expect(screen.getByText(/Ist vs\. Soll \(Zielzustand\)/i)).toBeInTheDocument()

    await user.click(within(scenarioBar).getByRole('button', { name: 'Nach 12 M' }))
    expect(screen.getByText(/Ist vs\. Soll \(Nach 12 M Fahrplan\)/i)).toBeInTheDocument()
  })

  it('switches roadmap to Einmalkauf, opens drawers, and loads plan into What-If simulator', async () => {
    const user = userEvent.setup()
    render(<CoreDashboardTab investments={coreInvestments} suggestedCoreBuy={1000} />)

    await user.click(screen.getByRole('button', { name: /12 M in Simulator laden/i }))

    const simDrawerBtn = screen.getByRole('button', { name: /Manuell simulieren \(What-If\)/i })
    expect(simDrawerBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText('Simulation aktiv').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /Einmalkauf \/ Umschichtung/i }))
    expect(screen.getByLabelText('Einmalkauf Budget')).toBeInTheDocument()

    const holdingsDrawerBtn = screen.getByRole('button', { name: /Core-ETFs & Profil-Zuordnung/i })
    await user.click(holdingsDrawerBtn)
    expect(holdingsDrawerBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Core-Holdings & Profil-Zuordnung')).toBeInTheDocument()
    const holdingsDrawer = holdingsDrawerBtn.closest('.core-drawer') as HTMLElement
    expect(within(holdingsDrawer).getByText('ISHARES MSCI INDIA ETF')).toBeInTheDocument()
  })

  it('displays separate Frontier / Entwicklungsländer row, Frontier-Cap controls (3% default), and Beimischung role', async () => {
    const user = userEvent.setup()
    const withFrontier: Investment[] = [
      ...coreInvestments,
      {
        name: 'XTRACKERS S&P SELECT FRONTIER SWAP ETF',
        isin: 'LU0328476410',
        wkn: 'DBX1A9',
        type: 'ETF',
        quantity: 10,
        purchasePrice: 18,
        currentPrice: 20,
        currentValue: 200,
        currency: 'EUR',
        exchangeRate: 1,
        region: 'Global',
        sector: 'Broad',
        category: 'Stocks',
        subcategory: 'Core',
      },
    ]

    render(<CoreDashboardTab investments={withFrontier} suggestedCoreBuy={350} />)

    expect(screen.getByText('Frontier / Entwicklungsländer')).toBeInTheDocument()
    const capGroup = screen.getByLabelText('Frontier-Cap')
    expect(within(capGroup).getByRole('button', { name: '3 %' })).toHaveClass('active')

    await user.click(within(capGroup).getByRole('button', { name: '5 %' }))
    expect(within(capGroup).getByRole('button', { name: '5 %' })).toHaveClass('active')

    const holdingsDrawerBtn = screen.getByRole('button', { name: /Core-ETFs & Profil-Zuordnung/i })
    await user.click(holdingsDrawerBtn)
    expect(screen.getAllByText('Beimischung / Satellit').length).toBeGreaterThan(0)
  })
})
