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

  it('switches tabs and displays individual modules', async () => {
    const user = userEvent.setup()
    render(<DataManagementModal {...defaultProps} />)

    // Initially workspace tab is active
    expect(screen.getByText('Gesamter Workspace')).toBeInTheDocument()
    expect(screen.queryByText('Analysedimensionen')).not.toBeInTheDocument()

    // Switch to Einzelne Module tab
    const modulesTab = screen.getByRole('button', { name: /Einzelne Module/i })
    await user.click(modulesTab)

    // Modular sections should now be visible
    expect(screen.getByText('Rebalancing-Profile')).toBeInTheDocument()
    expect(screen.getByText('Analysedimensionen')).toBeInTheDocument()
    expect(screen.getByText('Benutzerregeln (User Rules)')).toBeInTheDocument()
    expect(screen.getByText('Broker-Overrides')).toBeInTheDocument()

    // Exporting profiles
    const exportButtons = screen.getAllByRole('button', { name: /Export/i })
    await user.click(exportButtons[0]) // First module export button
    expect(defaultProps.onExportProfiles).toHaveBeenCalled()

    // Switch back to Workspace tab
    const workspaceTab = screen.getByRole('button', { name: /Workspace Backup/i })
    await user.click(workspaceTab)
    expect(screen.getByText('Gesamter Workspace')).toBeInTheDocument()
  })

  it('allows canceling the PIN prompt', async () => {
    const user = userEvent.setup()
    render(<DataManagementModal {...defaultProps} />)

    const exportBtn = screen.getAllByRole('button', { name: /Export/i })[0]
    await user.click(exportBtn)
    expect(screen.getByText('Workspace verschlüsseln')).toBeInTheDocument()

    const cancelBtn = screen.getByRole('button', { name: 'Abbrechen' })
    await user.click(cancelBtn)
    expect(screen.queryByText('Workspace verschlüsseln')).not.toBeInTheDocument()
  })
})

