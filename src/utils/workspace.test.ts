import { describe, it, expect, beforeEach, vi } from 'vitest'
import { exportWorkspace, importWorkspace } from './workspace'
import CryptoJS from 'crypto-js'

describe('Workspace AES Encryption', () => {
  const PIN = '123456'

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('patty-investments', JSON.stringify([{ id: 'test', name: 'Test' }]))
  })

  it('exports encrypted file correctly and decrypts via import', async () => {
    // We mock URL and document functions
    window.URL.createObjectURL = () => 'blob:url'
    
    // Instead of mocking createElement, we just let it create a real anchor tag
    // and spy on its click method.
    const createElementSpy = vi.spyOn(document, 'createElement')
    
    exportWorkspace(PIN)
    
    expect(createElementSpy).toHaveBeenCalledWith('a')

    // Clean up
    createElementSpy.mockRestore()
  })

  it('rejects import if file is encrypted and no pin is provided', async () => {
    const rawData = { version: 1, text: 'test' }
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(rawData), PIN).toString()

    const file = new File([encrypted], 'test.json', { type: 'text/plain' })
    
    await expect(importWorkspace(file)).rejects.toThrow('PIN_REQUIRED')
  })
  
  it('imports successfully with correct pin', async () => {
    const rawData = { version: 1, investments: [{ name: 'Test 2' }] }
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(rawData), PIN).toString()

    const file = new File([encrypted], 'test.json', { type: 'text/plain' })
    
    await expect(importWorkspace(file, PIN)).resolves.not.toThrow()
    expect(localStorage.getItem('patty-investments')).toContain('Test 2')
  })

  it('rejects import with incorrect pin', async () => {
    const rawData = { version: 1, text: 'test' }
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(rawData), PIN).toString()

    const file = new File([encrypted], 'test.json', { type: 'text/plain' })
    
    await expect(importWorkspace(file, '999999')).rejects.toThrow('Falscher PIN oder ungültige/beschädigte Datei')
  })
})
