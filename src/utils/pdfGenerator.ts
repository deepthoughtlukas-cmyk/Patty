import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Investment } from './parser'
import { investmentKey } from './userRules'
import type { DepositoryMap } from './depositories'
import type { AllocationSummary, SubWeight } from './categorizer'
import { fmtEur } from '../shared/lib/format'
import { computeRebalancePlan, type RebalanceMethod } from '../domain/rebalancing/rebalanceEngine'

type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } }

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

      currentY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY
    }
  })

  doc.save(`Portfolio_Report_${new Date().toISOString().slice(0,10)}.pdf`)
}

export function generateMobileRebalancePDF(
  investments: Investment[],
  allocation: AllocationSummary[],
  activeSubWeights: Record<string, SubWeight[]>,
  goldOzPrice: number,
  silverOzPrice: number,
  rebalanceMethod: RebalanceMethod = 'core-first'
) {
  // Page size: 108mm x 192mm (9:16 portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [108, 192]
  })

  const activeInvestments = investments.filter(inv => inv.currentValue > 0)
  const totalValue = activeInvestments.reduce((sum, inv) => sum + inv.currentValue, 0)
  const rebalancePlan = computeRebalancePlan({
    activeInvestments,
    allocation,
    activeSubWeights,
    totalValue,
    goldOzPrice,
    silverOzPrice,
    rebalanceMethod,
    sortByDeviationDesc: false,
  })

  // Draw Header
  const drawHeader = (_pageNum: number) => {
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
  rebalancePlan.forEach((catPlan) => {
    if (y > 165) {
      doc.addPage([108, 192])
      pageCount++
      drawHeader(pageCount)
      y = 26
    }

    // Category Card Top
    const rHex = parseInt(catPlan.color.slice(1, 3), 16) || 100
    const gHex = parseInt(catPlan.color.slice(3, 5), 16) || 100
    const bHex = parseInt(catPlan.color.slice(5, 7), 16) || 100

    doc.setFillColor(rHex, gHex, bHex)
    doc.circle(10, y - 1, 1.5, 'F')

    doc.setTextColor(20, 20, 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(catPlan.category, 14, y)
    
    // Deviation text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(110, 110, 110)
    doc.text(`Abweichung: ${catPlan.deviation >= 0 ? '+' : ''}${(catPlan.deviation * 100).toFixed(1)} %`, 14, y + 4)

    const badgeColor: [number, number, number] =
      catPlan.action === 'ok'
        ? [46, 117, 89]
        : catPlan.action === 'buy'
          ? [39, 174, 96]
          : [192, 57, 43]

    doc.setFillColor(...badgeColor)
    doc.rect(68, y - 3.5, 34, 5.5, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(catPlan.pdfBadgeText, 85, y + 0.25, { align: 'center' })

    if (catPlan.goldCoinCount > 0) {
      doc.setTextColor(212, 168, 83)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.text(`Empfehlung: ≥ ${catPlan.goldCoinCount} oz Gold (${fmtEur(goldOzPrice)}/oz)`, 14, y + 8.5)
      y += 4.5
    }

    y += 10

    // Subcategories
    if (catPlan.subcategories.length > 0) {
      catPlan.subcategories.forEach((sa) => {
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
        const subDisplayName = sa.isCoreAnchor ? `${sa.subcategory} [Anker]` : sa.subcategory
        doc.text(subDisplayName, 15, y)

        doc.setTextColor(130, 130, 130)
        doc.setFontSize(7)
        doc.text(sa.devLabel, 44, y)

        const subColor: [number, number, number] =
          sa.action === 'hold'
            ? [120, 120, 120]
            : sa.action === 'ok'
              ? [100, 100, 100]
              : sa.action === 'buy'
                ? [39, 174, 96]
                : [192, 57, 43]
        
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...subColor)
        doc.text(sa.pdfBadgeText, 70, y)

        if (sa.silverCoinCount > 0) {
          doc.setTextColor(140, 140, 140)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.text(`Empfehlung: ≥ ${sa.silverCoinCount} oz Silber (${fmtEur(silverOzPrice)}/oz)`, 15, y + 3.5)
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
