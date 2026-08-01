import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Create a mock for localStorage to prevent test data from modifying the real localStorage or test bleed
const localStorageMock = (function () {
  let store: Record<string, string> = {}

  return {
    getItem(key: string) {
      return store[key] || null
    },
    setItem(key: string, value: string) {
      store[key] = value.toString()
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Optional: Provide a mock for URL.createObjectURL to avoid errors in JSDOM
if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = vi.fn()
  window.URL.revokeObjectURL = vi.fn()
}
