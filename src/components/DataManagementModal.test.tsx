import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import DataManagementModal from './DataManagementModal'

describe('DataManagementModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onExportWorkspace: vi.fn(),
    onImportWorkspace: vi.fn(),
    onExportProfiles: vi.fn(),
    onImportProfiles: vi.fn(),
    onExportDimension: vi.fn(),
    onImportDimension: vi.fn(),
    onExportRules: vi.fn(),
    onImportRules: vi.fn(),
    onExportOverrides: vi.fn(),
    onImportOverrides: vi.fn()
  }

  it('renders correctly when open', () => {
    render(<DataManagementModal {...defaultProps} />)
    expect(screen.getByText('Daten Ex- & Import Center')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<DataManagementModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Daten Ex- & Import Center')).not.toBeInTheDocument()
  })

  it('opens the PIN prompt when exporting workspace', async () => {
    const user = userEvent.setup()
    render(<DataManagementModal {...defaultProps} />)
    
    // Find all export buttons
    const exportButtons = screen.getAllByRole('button', { name: /Export/i })
    
    // Click the first one which should be Workspace
    await user.click(exportButtons[0])
    
    // Check if the PIN prompt opens
    expect(screen.queryByText('Workspace verschlüsselt exportiert')).not.toBeInTheDocument() // just a sanity check
    expect(screen.getByText('Workspace verschlüsseln')).toBeInTheDocument()
    
    // We should be able to type a pin
    const pinInput = screen.getByPlaceholderText('••••••')
    await user.type(pinInput, '123456')
    
    const encryptBtn = screen.getByRole('button', { name: 'Verschlüsseln' })
    await user.click(encryptBtn)
    
    expect(defaultProps.onExportWorkspace).toHaveBeenCalledWith('123456')
  })
})
