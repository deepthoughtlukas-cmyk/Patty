import { beforeEach, describe, expect, it } from 'vitest'
import {
  PREDEFINED_DEPOSITORIES,
  bulkSetDepository,
  clearDepositories,
  getDepository,
  loadDepositories,
  loadDepositoryList,
  saveDepositoryList,
  setDepository,
} from './depositories'

describe('depositories', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns predefined depositories by default and allows saving custom list', () => {
    expect(loadDepositoryList()).toEqual(PREDEFINED_DEPOSITORIES)

    saveDepositoryList(['Tresor', 'Flatex'])
    expect(loadDepositoryList()).toEqual(['Tresor', 'Flatex'])
  })

  it('sets, reads, clears individual depositories, and bulk updates keys', () => {
    setDepository('IE00B4L5Y983', 'Flatex')
    expect(getDepository('IE00B4L5Y983')).toBe('Flatex')

    // Setting empty string removes assignment
    setDepository('IE00B4L5Y983', '')
    expect(getDepository('IE00B4L5Y983')).toBe('')
    expect(loadDepositories()['IE00B4L5Y983']).toBeUndefined()

    bulkSetDepository(['A1', 'A2'], 'Gold Avenue')
    expect(getDepository('A1')).toBe('Gold Avenue')
    expect(getDepository('A2')).toBe('Gold Avenue')

    clearDepositories()
    expect(loadDepositories()).toEqual({})
  })
})
