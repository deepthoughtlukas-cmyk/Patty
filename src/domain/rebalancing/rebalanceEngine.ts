import type { AssetCategory, Investment } from '../../utils/parser'
import { computeSubAllocation, type AllocationSummary, type SubWeight } from '../../utils/categorizer'
import { fmtEur } from '../../shared/lib/format'

export type RebalanceMethod = 'core-first' | 'standard'
export type RebalanceAction = 'ok' | 'buy' | 'sell' | 'hold'

export interface SubRebalanceRecommendation {
  subcategory: string
  color: string
  value: number
  categoryValue: number
  percentageOfCategory: number
  targetPercentageOfCategory: number
  subAbsTarget: number
  subActualAbs: number
  subTargetValue: number
  diff: number
  absDiff: number
  deviation: number
  action: RebalanceAction
  isCoreAnchor: boolean
  hasCoreReference: boolean
  stocksIsOk: boolean
  actualRatioToCore: number
  targetRatioToCore: number
  badgeText: string
  pdfBadgeText: string
  devLabel: string
  ratioLabel: string
  tooltip: string
  silverCoinCount: number
  silverCoinTooltip?: string
}

export interface CategoryRebalanceRecommendation {
  category: AssetCategory
  color: string
  value: number
  percentage: number
  targetPercentage: number
  targetValue: number
  deviation: number
  diff: number
  absDiff: number
  action: RebalanceAction
  hasCoreReference: boolean
  badgeText: string
  pdfBadgeText: string
  tooltip: string
  goldCoinCount: number
  goldCoinTooltip?: string
  subcategories: SubRebalanceRecommendation[]
}

export interface ComputeRebalanceInput {
  activeInvestments: Investment[]
  allocation: AllocationSummary[]
  activeSubWeights: Record<string, SubWeight[]>
  totalValue: number
  goldOzPrice: number
  silverOzPrice: number
  rebalanceMethod: RebalanceMethod
  sortByDeviationDesc?: boolean
}

export function computeRebalancePlan({
  activeInvestments,
  allocation,
  activeSubWeights,
  totalValue,
  goldOzPrice,
  silverOzPrice,
  rebalanceMethod,
  sortByDeviationDesc = true,
}: ComputeRebalanceInput): CategoryRebalanceRecommendation[] {
  const orderedAllocation = sortByDeviationDesc
    ? [...allocation].sort((a, b) => b.deviation - a.deviation)
    : allocation

  return orderedAllocation.map((a) => {
    const targetValue = totalValue * a.targetPercentage
    const diff = targetValue - a.value
    const absDiff = Math.abs(diff)
    const catTolerance = totalValue * 0.0025
    const isOk = absDiff < catTolerance
    const subAlloc = computeSubAllocation(activeInvestments, a.category, activeSubWeights[a.category])
    const hasMultipleSubs = subAlloc.length > 1

    const isStocks = a.category === 'Stocks'
    const coreSub = isStocks ? subAlloc.find((sa) => sa.subcategory.toLowerCase() === 'core') : undefined
    const hasCoreReference =
      isStocks && rebalanceMethod === 'core-first' && !!coreSub && coreSub.targetPercentage > 0
    const stocksIsOk = isOk
    const stocksIsUnder = diff > catTolerance
    const stocksIsOver = diff < -catTolerance

    // In Core-First Stage 2 (Stocks is on target), precompute satellite diffs so Core can absorb them
    let coreStage2NetDiff = 0
    if (hasCoreReference && coreSub && coreSub.value > 0 && stocksIsOk) {
      subAlloc.forEach((sa) => {
        if (sa.subcategory.toLowerCase() !== 'core') {
          const targetRatio = sa.targetPercentage / coreSub.targetPercentage
          const subTargetVal = coreSub.value * targetRatio
          const sDiff = subTargetVal - sa.value
          const sAbsDiff = Math.abs(sDiff)
          const sOk = sAbsDiff < Math.max(coreSub.value * 0.02, totalValue * 0.005)
          if (!sOk) {
            coreStage2NetDiff -= sDiff
          }
        }
      })
    }

    let actionText = ''
    let action: RebalanceAction = 'ok'
    let badgeText = 'On Target'
    let pdfBadgeText = 'On Target'

    if (isOk) {
      actionText = 'Empfehlung: Im Zielbereich (keine Anpassung erforderlich)'
    } else if (diff > 0) {
      action = 'buy'
      actionText = hasCoreReference
        ? `Empfehlung: KAUFEN +${fmtEur(absDiff)} (in Core)`
        : `Empfehlung: KAUFEN +${fmtEur(absDiff)}`
      badgeText = `Buy ${hasCoreReference ? 'Core ' : ''}${fmtEur(absDiff)}`
      pdfBadgeText = hasCoreReference ? `BUY Core ${fmtEur(absDiff)}` : `BUY ${fmtEur(absDiff)}`
    } else {
      action = 'sell'
      actionText = hasCoreReference
        ? `Empfehlung: VERKAUFEN -${fmtEur(absDiff)} (aus Core)`
        : `Empfehlung: VERKAUFEN -${fmtEur(absDiff)}`
      badgeText = `Sell ${hasCoreReference ? 'Core ' : ''}${fmtEur(absDiff)}`
      pdfBadgeText = hasCoreReference ? `SELL Core ${fmtEur(absDiff)}` : `SELL ${fmtEur(absDiff)}`
    }

    const catTooltipLines = [
      `${a.category} - Rebalancing Empfehlung`,
      actionText,
      `• Ist-Wert: ${fmtEur(a.value)} (${(a.percentage * 100).toFixed(1)}% des Portfolios)`,
      `• Soll-Wert: ${fmtEur(targetValue)} (${(a.targetPercentage * 100).toFixed(1)}% des Portfolios)`,
      `• Abweichung: ${a.deviation >= 0 ? '+' : ''}${(a.deviation * 100).toFixed(1)}% (${diff >= 0 ? '+' : ''}${fmtEur(diff)})`,
    ]

    if (hasCoreReference && coreSub) {
      catTooltipLines.push(
        '• Referenz-Modell: Core-First (2-Stufen)',
        `• Core: ${fmtEur(coreSub.value)} Ist-Wert, ${(coreSub.targetPercentage * 100).toFixed(0)}% Ziel-Gewichtung in Stocks`
      )
    }

    let goldCoinCount = 0
    let goldCoinTooltip: string | undefined
    if (a.category === 'Safe-Haven Gold' && diff > 0 && goldOzPrice > 0) {
      const ozExact = (absDiff / goldOzPrice).toFixed(2)
      const coinsCount = Math.floor(absDiff / goldOzPrice)
      if (coinsCount >= 1) {
        goldCoinCount = coinsCount
        goldCoinTooltip = `Kaufempfehlung ≥ ${coinsCount} oz Philharmoniker (${fmtEur(goldOzPrice)}/oz)`
        catTooltipLines.push(`• Gold-Stückelung: ≥ ${coinsCount} oz Philharmoniker (${ozExact} oz à ${fmtEur(goldOzPrice)})`)
      } else {
        catTooltipLines.push(`• Gold-Stückelung: ~${ozExact} oz Gold (1 oz = ${fmtEur(goldOzPrice)})`)
      }
    }

    const activeSubs = hasMultipleSubs
      ? [...subAlloc].filter((sa) => sa.targetPercentage > 0)
      : []

    if (sortByDeviationDesc && activeSubs.length > 1) {
      activeSubs.sort((x, y) => {
        if (hasCoreReference) {
          const xIsCore = x.subcategory.toLowerCase() === 'core'
          const yIsCore = y.subcategory.toLowerCase() === 'core'
          if (xIsCore) return -1
          if (yIsCore) return 1
        }
        const xDev = a.percentage * x.percentage - a.targetPercentage * x.targetPercentage
        const yDev = a.percentage * y.percentage - a.targetPercentage * y.targetPercentage
        return yDev - xDev
      })
    }

    const subcategories: SubRebalanceRecommendation[] = activeSubs.map((sa) => {
      const isThisCore = hasCoreReference && sa.subcategory.toLowerCase() === 'core'
      const subAbsTarget = a.targetPercentage * sa.targetPercentage
      const subActualAbs = a.percentage * sa.percentage

      let subTargetValue = totalValue * subAbsTarget
      let subDiff = subTargetValue - sa.value
      let subAbsDiff = Math.abs(subDiff)
      let subIsOk = subAbsDiff < totalValue * 0.005
      let subDev = subActualAbs - subAbsTarget
      let targetRatioToCore = 0
      let actualRatioToCore = 0
      let ratioDev = 0
      let devLabel = `(${subDev >= 0 ? '+' : ''}${(subDev * 100).toFixed(1)}%)`

      if (hasCoreReference) {
        if (isThisCore) {
          if (stocksIsUnder) {
            subDiff = absDiff
            subAbsDiff = absDiff
            subTargetValue = sa.value + absDiff
            subIsOk = false
            subDev = subActualAbs - subAbsTarget
          } else if (stocksIsOver) {
            subDiff = -absDiff
            subAbsDiff = absDiff
            subTargetValue = Math.max(0, sa.value - absDiff)
            subIsOk = false
            subDev = subActualAbs - subAbsTarget
          } else {
            subDiff = coreStage2NetDiff
            subAbsDiff = Math.abs(subDiff)
            subTargetValue = sa.value + subDiff
            subIsOk = subAbsDiff < Math.max(coreSub ? coreSub.value * 0.02 : 0, totalValue * 0.005)
            subDev = subActualAbs - subAbsTarget
          }
          devLabel = `(${subDev >= 0 ? '+' : ''}${(subDev * 100).toFixed(1)}%)`
        } else {
          if (stocksIsUnder || stocksIsOver) {
            subIsOk = true
            subDiff = 0
            subAbsDiff = 0
            subDev = subActualAbs - subAbsTarget
            devLabel = '(Halten)'
          } else if (coreSub && coreSub.value > 0) {
            targetRatioToCore = sa.targetPercentage / coreSub.targetPercentage
            actualRatioToCore = sa.value / coreSub.value
            subTargetValue = coreSub.value * targetRatioToCore
            subDiff = subTargetValue - sa.value
            subAbsDiff = Math.abs(subDiff)
            ratioDev = actualRatioToCore - targetRatioToCore
            subDev = ratioDev
            subIsOk = subAbsDiff < Math.max(coreSub.value * 0.02, totalValue * 0.005)
            devLabel = `(${subDev >= 0 ? '+' : ''}${(subDev * 100).toFixed(1)}% Core)`
          }
        }
      }

      let subActionText = ''
      let subAction: RebalanceAction = 'ok'
      let subBadgeText = 'OK'
      let subPdfBadgeText = 'On Target'

      if (subIsOk) {
        if (hasCoreReference && !isThisCore && !stocksIsOk) {
          subAction = 'hold'
          subBadgeText = 'Halten'
          subPdfBadgeText = 'Halten'
          subActionText = `Empfehlung: Halten (Nachgelagert – Zuerst muss Stocks über Core das Zielgewicht von ${(a.targetPercentage * 100).toFixed(0)}% erreichen)`
        } else {
          subActionText = 'Empfehlung: Im Zielbereich (keine Anpassung erforderlich)'
        }
      } else if (subDiff > 0) {
        subAction = 'buy'
        subBadgeText = `Buy ${fmtEur(subAbsDiff)}`
        subPdfBadgeText = `Buy ${fmtEur(subAbsDiff)}`
        if (hasCoreReference && isThisCore) {
          subActionText = stocksIsUnder
            ? `Empfehlung: KAUFEN +${fmtEur(subAbsDiff)} (Basisaufbau für Stocks auf ${(a.targetPercentage * 100).toFixed(0)}%)`
            : `Empfehlung: KAUFEN +${fmtEur(subAbsDiff)} (finanziert aus Satelliten-Gewinnmitnahme)`
        } else if (hasCoreReference && !isThisCore) {
          subActionText = `Empfehlung: KAUFEN +${fmtEur(subAbsDiff)} (finanziert aus Core)`
        } else {
          subActionText = `Empfehlung: KAUFEN +${fmtEur(subAbsDiff)}`
        }
      } else {
        subAction = 'sell'
        subBadgeText = `Sell ${fmtEur(subAbsDiff)}`
        subPdfBadgeText = `Sell ${fmtEur(subAbsDiff)}`
        if (hasCoreReference && isThisCore) {
          subActionText = stocksIsOver
            ? `Empfehlung: VERKAUFEN -${fmtEur(subAbsDiff)} (Gewinnmitnahme aus Core)`
            : `Empfehlung: VERKAUFEN -${fmtEur(subAbsDiff)} (zur Finanzierung untergewichteter Satelliten)`
        } else if (hasCoreReference && !isThisCore) {
          subActionText = `Empfehlung: VERKAUFEN -${fmtEur(subAbsDiff)} (in Core umschichten)`
        } else {
          subActionText = `Empfehlung: VERKAUFEN -${fmtEur(subAbsDiff)}`
        }
      }

      const subTooltipLines = [
        `${sa.subcategory} (${a.category}) - Rebalancing Empfehlung${isThisCore ? ' [Referenz-Anker]' : hasCoreReference ? ' [Core-First]' : ''}`,
        subActionText,
      ]

      if (hasCoreReference && !isThisCore) {
        if (!stocksIsOk) {
          subTooltipLines.push(
            '• Status: Halten (Nachgelagert – Core-Zukauf hat Priorität)',
            `• Ist-Wert: ${fmtEur(sa.value)} (${(subActualAbs * 100).toFixed(1)}% Portfolio / ${(sa.percentage * 100).toFixed(0)}% von Stocks)`,
            `• Langfristiger Soll-Wert bei ${(a.targetPercentage * 100).toFixed(0)}% Stocks: ${fmtEur(totalValue * a.targetPercentage * sa.targetPercentage)}`,
            '• Hinweis: Satelliten-Anpassung greift erst, wenn Stocks im Zielbereich liegt.'
          )
        } else if (coreSub && coreSub.value > 0) {
          subTooltipLines.push(
            `• Ist-Wert: ${fmtEur(sa.value)} (${(actualRatioToCore * 100).toFixed(1)}% von Core)`,
            `• Soll-Wert: ${fmtEur(subTargetValue)} (${(targetRatioToCore * 100).toFixed(1)}% von Core: ${fmtEur(coreSub.value)})`,
            `• Abweichung zu Core: ${ratioDev >= 0 ? '+' : ''}${(ratioDev * 100).toFixed(1)}% (${subDiff >= 0 ? '+' : ''}${fmtEur(subDiff)})`,
            `• Portfolio-Anteil: ${(subActualAbs * 100).toFixed(1)}% / ${(subAbsTarget * 100).toFixed(1)}% Portfolio`
          )
        }
      } else {
        subTooltipLines.push(
          `• Ist-Wert: ${fmtEur(sa.value)} (${(subActualAbs * 100).toFixed(1)}% Portfolio / ${(sa.percentage * 100).toFixed(0)}% von ${a.category})`,
          `• Soll-Wert: ${fmtEur(subTargetValue)} (${(subAbsTarget * 100).toFixed(1)}% Portfolio / ${(sa.targetPercentage * 100).toFixed(0)}% von ${a.category})`,
          `• Abweichung: ${subDev >= 0 ? '+' : ''}${(subDev * 100).toFixed(1)}% (${subDiff >= 0 ? '+' : ''}${fmtEur(subDiff)})`
        )
      }

      let silverCoinCount = 0
      let silverCoinTooltip: string | undefined
      if (sa.subcategory === 'Silber' && subDiff > 0 && silverOzPrice > 0) {
        const ozExact = (subAbsDiff / silverOzPrice).toFixed(1)
        const coinsCount = Math.floor(subAbsDiff / silverOzPrice)
        if (coinsCount >= 1) {
          silverCoinCount = coinsCount
          silverCoinTooltip = `Kaufempfehlung ≥ ${coinsCount} oz Silber (${fmtEur(silverOzPrice)}/oz)`
          subTooltipLines.push(`• Silber-Stückelung: ≥ ${coinsCount} oz Silber (${ozExact} oz à ${fmtEur(silverOzPrice)})`)
        } else {
          subTooltipLines.push(`• Silber-Stückelung: ~${ozExact} oz Silber (1 oz = ${fmtEur(silverOzPrice)})`)
        }
      }

      const ratioLabel =
        hasCoreReference && !isThisCore && coreSub && coreSub.value > 0
          ? stocksIsOk
            ? `${(actualRatioToCore * 100).toFixed(0)}% / ${(targetRatioToCore * 100).toFixed(0)}% Core`
            : `${(subActualAbs * 100).toFixed(1)}% / ${(subAbsTarget * 100).toFixed(1)}% Portfolio`
          : `${(subActualAbs * 100).toFixed(1)}% / ${(subAbsTarget * 100).toFixed(1)}% Portfolio`

      return {
        subcategory: sa.subcategory,
        color: sa.color,
        value: sa.value,
        categoryValue: a.value,
        percentageOfCategory: sa.percentage,
        targetPercentageOfCategory: sa.targetPercentage,
        subAbsTarget,
        subActualAbs,
        subTargetValue,
        diff: subDiff,
        absDiff: subAbsDiff,
        deviation: subDev,
        action: subAction,
        isCoreAnchor: isThisCore,
        hasCoreReference,
        stocksIsOk,
        actualRatioToCore,
        targetRatioToCore,
        badgeText: subBadgeText,
        pdfBadgeText: subPdfBadgeText,
        devLabel,
        ratioLabel,
        tooltip: subTooltipLines.join('\n'),
        silverCoinCount,
        silverCoinTooltip,
      }
    })

    return {
      category: a.category,
      color: a.color,
      value: a.value,
      percentage: a.percentage,
      targetPercentage: a.targetPercentage,
      targetValue,
      deviation: a.deviation,
      diff,
      absDiff,
      action,
      hasCoreReference,
      badgeText,
      pdfBadgeText,
      tooltip: catTooltipLines.join('\n'),
      goldCoinCount,
      goldCoinTooltip,
      subcategories,
    }
  })
}
