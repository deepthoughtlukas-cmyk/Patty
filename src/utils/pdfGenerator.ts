import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Investment } from './parser'
import { investmentKey } from './userRules'
import type { DepositoryMap } from './depositories'
import { computeSubAllocation } from './categorizer'

function fmt(value: number, digits = 2): string {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtEur(value: number): string {
  return `€ ${fmt(value)}`
}

export function generatePDF(investments: Investment[], depositories: DepositoryMap) {
  const doc = new jsPDF()

  // Group by depository
  const depGroups: Record<string, Investment[]> = {}
  let totalPortfolioValue = 0

  const activeInvestments = investments.filter(inv => inv.currentValue > 0)

  activeInvestments.forEach(inv => {
    const dep = depositories[investmentKey(inv)] || 'Nicht zugewiesen'
    if (!depGroups[dep]) depGroups[dep] = []
    depGroups[dep].push(inv)
    totalPortfolioValue += inv.currentValue
  })

  // Prepare overview data
  const overviewData = Object.entries(depGroups).map(([depName, items]) => {
    const val = items.reduce((sum, inv) => sum + inv.currentValue, 0)
    const pct = totalPortfolioValue > 0 ? (val / totalPortfolioValue) * 100 : 0
    return {
      name: depName,
      value: val,
      pct,
      count: items.length
    }
  }).sort((a, b) => b.value - a.value)

  // TITLE
  doc.setFontSize(20)
  doc.text('Portfolio Lagerstätten Report', 14, 22)
  
  doc.setFontSize(11)
  doc.setTextColor(100)
  doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, 14, 30)

  // OVERVIEW TABLE
  autoTable(doc, {
    startY: 38,
    head: [['Lagerstätte', 'Anzahl Assets', 'Wert', 'Anteil (%)']],
    body: overviewData.map(d => [
      d.name,
      d.count.toString(),
      fmtEur(d.value),
      d.pct.toFixed(1) + ' %'
    ]),
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] },
    foot: [['Gesamt', activeInvestments.length.toString(), fmtEur(totalPortfolioValue), '100 %']],
    footStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold' }
  })

  // DETAILS PAGES
  // Sort depositories by total value descending
  const sortedDepGroups = Object.entries(depGroups).sort((a, b) => {
    const valA = a[1].reduce((sum, inv) => sum + inv.currentValue, 0)
    const valB = b[1].reduce((sum, inv) => sum + inv.currentValue, 0)
    return valB - valA
  })

  // 1. Render Large Depositories (each on a separate page)
  sortedDepGroups.forEach(([depName, items]) => {
    if (items.length > 3) {
      doc.addPage()
      doc.setFontSize(16)
      doc.setTextColor(0)
      doc.text(`Detailansicht: ${depName}`, 14, 22)

      const depValue = items.reduce((s, inv) => s + inv.currentValue, 0)
      const depCost = items.reduce((s, inv) => s + (inv.purchasePrice * inv.quantity), 0)
      const depGain = depValue - depCost
      const depGainPct = depCost > 0 ? (depGain / depCost) * 100 : 0

      doc.setFontSize(11)
      doc.setTextColor(100)
      doc.text(`Gesamtwert: ${fmtEur(depValue)} | G/L: ${depGain >= 0 ? '+' : ''}${fmtEur(depGain)} (${depGain >= 0 ? '+' : ''}${depGainPct.toFixed(1)}%)`, 14, 30)

      const tableData = items.sort((a,b) => b.currentValue - a.currentValue).map(inv => {
        const cost = inv.purchasePrice * inv.quantity
        const gain = inv.currentValue - cost
        const gainPct = cost > 0 ? (gain / cost) * 100 : 0
        return [
          inv.name,
          inv.type,
          inv.category,
          inv.quantity.toString(),
          fmtEur(inv.currentValue),
          `${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)} %`
        ]
      })

      autoTable(doc, {
        startY: 36,
        head: [['Asset', 'Typ', 'Kategorie', 'Anzahl', 'Wert', 'G/L (%)']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
      })
    }
  })

  // 2. Render Small Depositories (grouped sequentially)
  let firstSmall = true
  let currentY = 0

  sortedDepGroups.forEach(([depName, items]) => {
    if (items.length <= 3) {
      if (firstSmall) {
        doc.addPage()
        currentY = 20
        firstSmall = false
      } else {
        // Space checking: check if we have at least 55mm of space left on the page
        if (currentY + 55 > 275) {
          doc.addPage()
          currentY = 20
        } else {
          currentY += 15
        }
      }

      doc.setFontSize(16)
      doc.setTextColor(0)
      doc.text(`Detailansicht: ${depName}`, 14, currentY)

      const depValue = items.reduce((s, inv) => s + inv.currentValue, 0)
      const depCost = items.reduce((s, inv) => s + (inv.purchasePrice * inv.quantity), 0)
      const depGain = depValue - depCost
      const depGainPct = depCost > 0 ? (depGain / depCost) * 100 : 0

      doc.setFontSize(11)
      doc.setTextColor(100)
      doc.text(`Gesamtwert: ${fmtEur(depValue)} | G/L: ${depGain >= 0 ? '+' : ''}${fmtEur(depGain)} (${depGain >= 0 ? '+' : ''}${depGainPct.toFixed(1)}%)`, 14, currentY + 8)

      const tableData = items.sort((a,b) => b.currentValue - a.currentValue).map(inv => {
        const cost = inv.purchasePrice * inv.quantity
        const gain = inv.currentValue - cost
        const gainPct = cost > 0 ? (gain / cost) * 100 : 0
        return [
          inv.name,
          inv.type,
          inv.category,
          inv.quantity.toString(),
          fmtEur(inv.currentValue),
          `${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)} %`
        ]
      })

      autoTable(doc, {
        startY: currentY + 14,
        head: [['Asset', 'Typ', 'Kategorie', 'Anzahl', 'Wert', 'G/L (%)']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
      })

      currentY = (doc as any).lastAutoTable.finalY
    }
  })

  doc.save(`Portfolio_Report_${new Date().toISOString().slice(0,10)}.pdf`)
}

export function generateMobileRebalancePDF(
  investments: Investment[],
  allocation: any[],
  activeSubWeights: Record<string, any[]>,
  goldOzPrice: number,
  silverOzPrice: number,
  rebalanceMethod: 'core-first' | 'standard' = 'core-first'
) {
  // Page size: 108mm x 192mm (9:16 portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [108, 192]
  })

  const activeInvestments = investments.filter(inv => inv.currentValue > 0)
  const totalValue = activeInvestments.reduce((sum, inv) => sum + inv.currentValue, 0)

  // Draw Header
  const drawHeader = (pageNum: number) => {
    doc.setFillColor(26, 30, 42) // Dark card bg
    doc.rect(0, 0, 108, 16, 'F')
    
    // Logo / Title
    doc.setTextColor(240, 192, 64) // Gold color
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('PATTY', 10, 10)
    
    doc.setTextColor(232, 234, 240)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Rebalancing Report', 27, 10)

    doc.setFontSize(7)
    doc.setTextColor(139, 144, 160)
    doc.text(new Date().toLocaleDateString('de-DE'), 85, 10)

    doc.setDrawColor(255, 255, 255, 0.1)
    doc.line(0, 16, 108, 16)
  }

  drawHeader(1)

  let y = 24
  let pageCount = 1

  // Summary Metrics Card
  doc.setFillColor(245, 247, 250)
  doc.roundedRect(8, y, 92, 16, 2, 2, 'F')
  
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('PORTFOLIO GESAMTWERT', 12, y + 5.5)

  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(fmtEur(totalValue), 12, y + 12)

  y += 22

  // Categories list
  allocation.forEach((a) => {
    const targetValue = totalValue * a.targetPercentage
    const diff = targetValue - a.value
    const absDiff = Math.abs(diff)
    const catTolerance = totalValue * 0.0025
    const isOk = absDiff < catTolerance

    if (y > 165) {
      doc.addPage([108, 192])
      pageCount++
      drawHeader(pageCount)
      y = 26
    }

    // Category Card Top
    const rHex = parseInt(a.color.slice(1, 3), 16) || 100
    const gHex = parseInt(a.color.slice(3, 5), 16) || 100
    const bHex = parseInt(a.color.slice(5, 7), 16) || 100

    doc.setFillColor(rHex, gHex, bHex)
    doc.circle(10, y - 1, 1.5, 'F')

    doc.setTextColor(20, 20, 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(a.category, 14, y)
    
    // Deviation text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(110, 110, 110)
    doc.text(`Abweichung: ${a.deviation >= 0 ? '+' : ''}${(a.deviation * 100).toFixed(1)} %`, 14, y + 4)

    const subAlloc = computeSubAllocation(activeInvestments, a.category, activeSubWeights[a.category])
    const isStocks = a.category === 'Stocks'
    const coreSub = isStocks ? subAlloc.find(sa => sa.subcategory.toLowerCase() === 'core') : undefined
    const hasCoreRef = isStocks && rebalanceMethod === 'core-first' && !!coreSub && coreSub.targetPercentage > 0
    const stocksIsOk = isOk
    const stocksIsUnder = diff > catTolerance
    const stocksIsOver = diff < -catTolerance

    // In Core-First Stage 2 (Stocks is on target), precompute satellite diffs so Core can absorb them
    let coreStage2NetDiff = 0
    if (hasCoreRef && coreSub && coreSub.value > 0 && stocksIsOk) {
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

    // Recommendation Badge / Text
    let badgeText = ''
    let badgeColor: [number, number, number] = [120, 120, 120]
    if (isOk) {
      badgeText = 'On Target'
      badgeColor = [46, 117, 89]
    } else if (diff > 0) {
      badgeText = hasCoreRef ? `BUY Core ${fmtEur(absDiff)}` : `BUY ${fmtEur(absDiff)}`
      badgeColor = [39, 174, 96]
    } else {
      badgeText = hasCoreRef ? `SELL Core ${fmtEur(absDiff)}` : `SELL ${fmtEur(absDiff)}`
      badgeColor = [192, 57, 43]
    }

    doc.setFillColor(...badgeColor)
    doc.rect(68, y - 3.5, 34, 5.5, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(badgeText, 85, y + 0.25, { align: 'center' })

    // If Safe-Haven Gold and need coin
    if (a.category === 'Safe-Haven Gold' && diff > 0 && goldOzPrice > 0 && absDiff >= goldOzPrice) {
      const ozCount = Math.floor(absDiff / goldOzPrice)
      doc.setTextColor(212, 168, 83) // Gold color
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.text(`Empfehlung: ≥ ${ozCount} oz Gold (${fmtEur(goldOzPrice)}/oz)`, 14, y + 8.5)
      y += 4.5
    }

    y += 10

    // Subcategories
    if (subAlloc.length > 1) {
      const activeSubs = subAlloc.filter(sa => sa.targetPercentage > 0)
      activeSubs.forEach((sa) => {
        const isThisCore = hasCoreRef && sa.subcategory.toLowerCase() === 'core'
        const subAbsTarget = a.targetPercentage * sa.targetPercentage
        const subActualAbs = a.percentage * sa.percentage
        let subTargetValue = totalValue * subAbsTarget
        let subDiff = subTargetValue - sa.value
        let subAbsDiff = Math.abs(subDiff)
        let subIsOk = subAbsDiff < totalValue * 0.005
        let subDev = subActualAbs - subAbsTarget
        let devLabel = `(${subDev >= 0 ? '+' : ''}${(subDev * 100).toFixed(1)}%)`

        if (hasCoreRef) {
          if (isThisCore) {
            if (stocksIsUnder) {
              subDiff = absDiff
              subAbsDiff = absDiff
              subIsOk = false
            } else if (stocksIsOver) {
              subDiff = -absDiff
              subAbsDiff = absDiff
              subIsOk = false
            } else {
              subDiff = coreStage2NetDiff
              subAbsDiff = Math.abs(subDiff)
              subIsOk = subAbsDiff < Math.max(coreSub ? coreSub.value * 0.02 : 0, totalValue * 0.005)
            }
          } else {
            // Satellite in Core-First mode
            if (stocksIsUnder || stocksIsOver) {
              subIsOk = true
              subDiff = 0
              subAbsDiff = 0
              devLabel = '(Halten)'
            } else if (coreSub && coreSub.value > 0) {
              const targetRatioToCore = sa.targetPercentage / coreSub.targetPercentage
              const actualRatioToCore = sa.value / coreSub.value
              subTargetValue = coreSub.value * targetRatioToCore
              subDiff = subTargetValue - sa.value
              subAbsDiff = Math.abs(subDiff)
              subIsOk = subAbsDiff < Math.max(coreSub.value * 0.02, totalValue * 0.005)
              subDev = actualRatioToCore - targetRatioToCore
              devLabel = `(${subDev >= 0 ? '+' : ''}${(subDev * 100).toFixed(1)}% Core)`
            }
          }
        }

        if (y > 175) {
          doc.addPage([108, 192])
          pageCount++
          drawHeader(pageCount)
          y = 26
        }

        const srHex = parseInt(sa.color.slice(1, 3), 16) || 100
        const sgHex = parseInt(sa.color.slice(3, 5), 16) || 100
        const sbHex = parseInt(sa.color.slice(5, 7), 16) || 100
        
        doc.setFillColor(srHex, sgHex, sbHex)
        doc.circle(12, y - 1, 0.8, 'F')

        doc.setTextColor(80, 80, 80)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const subDisplayName = isThisCore ? `${sa.subcategory} [Anker]` : sa.subcategory
        doc.text(subDisplayName, 15, y)

        doc.setTextColor(130, 130, 130)
        doc.setFontSize(7)
        doc.text(devLabel, 44, y)

        let subText = 'On Target'
        let subColor = [100, 100, 100]
        if (hasCoreRef && !isThisCore && !stocksIsOk) {
          subText = 'Halten'
          subColor = [120, 120, 120]
        } else if (!subIsOk) {
          if (subDiff > 0) {
            subText = `Buy ${fmtEur(subAbsDiff)}`
            subColor = [39, 174, 96]
          } else {
            subText = `Sell ${fmtEur(subAbsDiff)}`
            subColor = [192, 57, 43]
          }
        }
        
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...subColor)
        doc.text(subText, 70, y)

        if (sa.subcategory === 'Silber' && subDiff > 0 && silverOzPrice > 0 && subAbsDiff >= silverOzPrice) {
          const ozSilber = Math.floor(subAbsDiff / silverOzPrice)
          doc.setTextColor(140, 140, 140)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.text(`Empfehlung: ≥ ${ozSilber} oz Silber (${fmtEur(silverOzPrice)}/oz)`, 15, y + 3.5)
          y += 3.5
        }

        y += 5.5
      })
      y += 2.5
    }

    if (y < 170) {
      doc.setDrawColor(240, 240, 240)
      doc.line(6, y - 1, 102, y - 1)
      y += 2.5
    }
  })

  doc.save(`Rebalancing_Mobile_${new Date().toISOString().slice(0,10)}.pdf`)
}
