import { BUILTIN_PROFILES } from '../../utils/core/builtinProfiles'
import { getAllProfiles } from '../../utils/core/profileStore'
import type { CorePosition, CoreProfile, TargetStage } from '../../utils/core/types'
import { optimizeExistingCoreSparplan } from './roadmapPlanner'

export interface OrderRecommendation {
  profileId: string
  name: string
  isin: string
  action: 'BUY' | 'SELL'
  amount: number
  targetShare: number
  reason: string
}

export interface OptimizationResult {
  orders: OrderRecommendation[]
  budgetUsed: number
  remainingBudget: number
  simulatedDeltas: Record<string, number>
}

/**
 * Erstellt Kauf- bzw. Rebalancing-Empfehlungen auf Basis des gewählten Whitepaper-Soll-Modells (Stufe 2 oder 3).
 * Berücksichtigt vorhandene ETFs, falls vorhanden, sonst Fallback auf Modell-ETFs.
 */
export function optimizeCoreOrders(
  positions: CorePosition[],
  targetStage: TargetStage,
  budget: number,
  mode: 'buy-only' | 'rebalance' = 'buy-only',
  minOrderSize = 25
): OptimizationResult {
  const allProfiles = getAllProfiles()
  const profileMap = new Map(allProfiles.map((p) => [p.id, p]))
  const activeExistingPositions = positions.filter((p) => p.profile !== null && p.value > 0)

  if (mode === 'buy-only' && activeExistingPositions.length > 0) {
    const sparplanItems = optimizeExistingCoreSparplan(activeExistingPositions, targetStage, budget, {
      maxPositions: 4,
    })

    const orders: OrderRecommendation[] = sparplanItems.map((item) => ({
      profileId: item.profileId,
      name: item.name,
      isin: item.isin,
      action: 'BUY',
      amount: item.amount,
      targetShare: item.shareOfBudget,
      reason: item.reason,
    }))

    const simulatedDeltas: Record<string, number> = {}
    let budgetUsed = 0
    for (const item of sparplanItems) {
      simulatedDeltas[item.key] = item.amount
      budgetUsed += item.amount
    }

    return {
      orders,
      budgetUsed,
      remainingBudget: Math.max(0, budget - budgetUsed),
      simulatedDeltas,
    }
  }

  const currentValueByProfile = new Map<string, number>()
  const positionKeyByProfile = new Map<string, string>()

  for (const pos of positions) {
    if (pos.profile) {
      const pid = pos.profile.id
      currentValueByProfile.set(pid, (currentValueByProfile.get(pid) || 0) + pos.value)
      if (!positionKeyByProfile.has(pid)) {
        positionKeyByProfile.set(pid, pos.key)
      }
    }
  }

  const currentTotal = positions.reduce((s, p) => s + p.value, 0)
  const targetTotal = mode === 'buy-only' ? currentTotal + Math.max(0, budget) : currentTotal

  const orders: OrderRecommendation[] = []
  const simulatedDeltas: Record<string, number> = {}

  if (mode === 'buy-only') {
    if (budget <= 0) {
      return { orders: [], budgetUsed: 0, remainingBudget: 0, simulatedDeltas: {} }
    }

    const deficits: Array<{ profile: CoreProfile; deficit: number; weight: number }> = []

    for (const item of targetStage.model) {
      const prof = profileMap.get(item.profileId) || BUILTIN_PROFILES.find((p) => p.id === item.profileId)
      if (!prof) continue

      const curVal = currentValueByProfile.get(prof.id) || 0
      const desiredVal = targetTotal * item.weight
      const deficit = Math.max(0, desiredVal - curVal)

      if (deficit > 0) {
        deficits.push({ profile: prof, deficit, weight: item.weight })
      }
    }

    const totalDeficit = deficits.reduce((s, d) => s + d.deficit, 0)
    let allocatedTotal = 0

    if (totalDeficit > 0) {
      for (const item of deficits) {
        const rawShare = (item.deficit / totalDeficit) * budget
        const roundedAmount = Math.floor(rawShare / 5) * 5

        if (roundedAmount >= minOrderSize) {
          allocatedTotal += roundedAmount
          orders.push({
            profileId: item.profile.id,
            name: item.profile.name,
            isin: item.profile.isins[0] || '',
            action: 'BUY',
            amount: roundedAmount,
            targetShare: item.weight,
            reason: `Untergewicht im Soll-Modell (${(item.weight * 100).toFixed(0)} % Zielquote)`,
          })

          const key = positionKeyByProfile.get(item.profile.id) || item.profile.id
          simulatedDeltas[key] = (simulatedDeltas[key] || 0) + roundedAmount
        }
      }
    }

    return {
      orders: orders.sort((a, b) => b.amount - a.amount),
      budgetUsed: allocatedTotal,
      remainingBudget: Math.max(0, budget - allocatedTotal),
      simulatedDeltas,
    }
  }

  let netBought = 0
  for (const item of targetStage.model) {
    const prof = profileMap.get(item.profileId) || BUILTIN_PROFILES.find((p) => p.id === item.profileId)
    if (!prof) continue

    const curVal = currentValueByProfile.get(prof.id) || 0
    const targetVal = targetTotal * item.weight
    const diff = targetVal - curVal
    const rounded = Math.round(diff / 5) * 5

    if (Math.abs(rounded) >= minOrderSize) {
      const isBuy = rounded > 0
      orders.push({
        profileId: prof.id,
        name: prof.name,
        isin: prof.isins[0] || '',
        action: isBuy ? 'BUY' : 'SELL',
        amount: Math.abs(rounded),
        targetShare: item.weight,
        reason: isBuy
          ? `Aufstockung auf Soll-Quote (${(item.weight * 100).toFixed(0)} %)`
          : `Gewinnmitnahme / Rebalancing auf Soll-Quote (${(item.weight * 100).toFixed(0)} %)`,
      })

      const key = positionKeyByProfile.get(prof.id) || prof.id
      simulatedDeltas[key] = (simulatedDeltas[key] || 0) + rounded
      if (isBuy) netBought += rounded
    }
  }

  return {
    orders: orders.sort((a, b) => b.amount - a.amount),
    budgetUsed: netBought,
    remainingBudget: 0,
    simulatedDeltas,
  }
}
