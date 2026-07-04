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
  silverOzPrice: number
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
    doc.setFillColor(26, 30, 42) // #1a1e2a
    doc.rect(0, 0, 108, 18, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Rebalancing Report', 6, 8)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Mobile Ansicht · Seite ${pageNum}`, 6, 13)
  }

  drawHeader(1)
  
  let y = 26
  
  // Title / Date info
  doc.setTextColor(80, 80, 80)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'})}`, 6, y)
  y += 4
  
  doc.setTextColor(26, 30, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`Gesamtwert: ${fmtEur(totalValue)}`, 6, y)
  y += 6

  // Separator Line
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.2)
  doc.line(6, y, 102, y)
  y += 6

  let pageCount = 1

  // Sort by absolute deviation descending
  const sortedAlloc = [...allocation].sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))

  sortedAlloc.forEach((a) => {
    const targetValue = totalValue * a.targetPercentage
    const diff = targetValue - a.value
    const absDiff = Math.abs(diff)
    const isOk = absDiff < totalValue * 0.01

    if (y > 175) {
      doc.addPage([108, 192])
      pageCount++
      drawHeader(pageCount)
      y = 26
    }

    // Category Color Dot/Bar
    const rHex = parseInt(a.color.slice(1, 3), 16) || 100
    const gHex = parseInt(a.color.slice(3, 5), 16) || 100
    const bHex = parseInt(a.color.slice(5, 7), 16) || 100
    
    doc.setFillColor(rHex, gHex, bHex)
    doc.rect(6, y - 3, 2, 4.5, 'F')

    // Category Name
    doc.setTextColor(26, 30, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(a.category, 10, y)
    
    // Deviation text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(110, 110, 110)
    doc.text(`Abweichung: ${a.deviation >= 0 ? '+' : ''}${(a.deviation * 100).toFixed(1)} %`, 10, y + 4)

    // Recommendation Badge / Text
    let badgeText = ''
    let badgeColor: [number, number, number] = [120, 120, 120]
    if (isOk) {
      badgeText = 'On Target'
      badgeColor = [46, 117, 89]
    } else if (diff > 0) {
      badgeText = `BUY ${fmtEur(absDiff)}`
      badgeColor = [39, 174, 96]
    } else {
      badgeText = `SELL ${fmtEur(absDiff)}`
      badgeColor = [192, 57, 43]
    }

    doc.setFillColor(...badgeColor)
    doc.rect(70, y - 3.5, 32, 5.5, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text(badgeText, 86, y + 0.25, { align: 'center' })

    // If Safe-Haven Gold and need coin
    if (a.category === 'Safe-Haven Gold' && diff > 0 && goldOzPrice > 0 && absDiff >= goldOzPrice) {
      const ozCount = Math.floor(absDiff / goldOzPrice)
      doc.setTextColor(212, 168, 83) // Gold color
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.text(`Empfehlung: ≥ ${ozCount} oz Gold (${fmtEur(goldOzPrice)}/oz)`, 10, y + 8.5)
      y += 4.5
    }

    y += 10

    // Subcategories
    const subAlloc = computeSubAllocation(activeInvestments, a.category, activeSubWeights[a.category])
    if (subAlloc.length > 1) {
      const activeSubs = subAlloc.filter(sa => sa.targetPercentage > 0)
      activeSubs.forEach((sa) => {
        const subAbsTarget = a.targetPercentage * sa.targetPercentage
        const subActualAbs = a.percentage * sa.percentage
        const subTargetValue = totalValue * subAbsTarget
        const subDiff = subTargetValue - sa.value
        const subAbsDiff = Math.abs(subDiff)
        const subIsOk = subAbsDiff < totalValue * 0.005
        const subDev = subActualAbs - subAbsTarget

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
        doc.text(sa.subcategory, 15, y)

        doc.setTextColor(130, 130, 130)
        doc.setFontSize(7.5)
        doc.text(`(${subDev >= 0 ? '+' : ''}${(subDev * 100).toFixed(1)}%)`, 42, y)

        let subText = 'On Target'
        let subColor = [100, 100, 100]
        if (!subIsOk) {
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
