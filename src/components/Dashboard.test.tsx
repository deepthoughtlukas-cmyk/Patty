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
    { id: 'inv1', name: 'Apple Inc.', isin: 'US0378331005', type: 'Aktien', currentValue: 1000, quantity: 10, purchasePrice: 500, sector: 'Technology', region: 'USA', currency: 'EUR', depository: '' },
    { id: 'inv2', name: 'Microsoft', isin: 'US5949181045', type: 'Aktien', currentValue: 2000, quantity: 20, purchasePrice: 1000, sector: 'Technology', region: 'USA', currency: 'EUR', depository: '' }
  ]

  it('renders dashboard with mock data', async () => {
    render(<Dashboard investments={mockInvestments} onCategoryChange={vi.fn()} />)
    
    // Check if total portfolio value is somewhat rendered (Apple + MS = 3000)
    await waitFor(() => {
      expect(screen.getByText(/3\.000,00/i)).toBeInTheDocument()
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
})
