import { describe, it, expect } from 'vitest'
import { parseCSV } from './parser'

describe('Data Parser (CSV)', () => {
  it('parses standard German CSV correctly', () => {
    const csv = `Name,ISIN,WKN,Typ,Anzahl,Kaufpreis,Aktueller Kurs,Aktueller Wert,Währung,Wechselkurs,Region,Sektor
Novo-Nordisk B,DK0062498333,A3EU6F,Aktien,"10,5","30,00","33,30","349,65",EUR,1,Dänemark,Pharmazeutika`

    const parsed = parseCSV(csv)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Novo-Nordisk B')
    expect(parsed[0].isin).toBe('DK0062498333')
    expect(parsed[0].quantity).toBe(10.5)
    expect(parsed[0].purchasePrice).toBe(30)
    expect(parsed[0].currentPrice).toBe(33.3)
    expect(parsed[0].currentValue).toBe(349.65)
  })

  it('handles UTF-8 BOM without breaking column headers', () => {
    const csvWithBOM = `\uFEFFName,ISIN,WKN,Typ,Anzahl,Kaufpreis,Aktueller Kurs,Aktueller Wert,Währung,Wechselkurs,Region,Sektor
Broadcom,US11135F1012,A2JG9Z,Aktien,"0,904","282,016","281,6","254,519",EUR,1,Vereinigte Staaten (USA),Halbleiter`

    const parsed = parseCSV(csvWithBOM)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Broadcom')
    expect(parsed[0].isin).toBe('US11135F1012')
    expect(parsed[0].currentValue).toBe(254.519)
  })

  it('parses semicolon-delimited CSV files', () => {
    const csv = `Name;ISIN;WKN;Typ;Anzahl;Kaufpreis;Aktueller Kurs;Aktueller Wert;Währung;Wechselkurs;Region;Sektor
ASML Holding;NL0010273215;A1J4U4;Aktien;2;750,00;800,00;1.600,00;EUR;1;Niederlande;Halbleiter`

    const parsed = parseCSV(csv)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('ASML Holding')
    expect(parsed[0].currentValue).toBe(1600)
  })

  it('supports alternative German bank header aliases and case-insensitivity', () => {
    const csv = `Wertpapierbezeichnung,isin,wkn,typ,Bestand,Einstandskurs,Kurs,Gesamtwert,Waehrung
Allianz SE,DE0008404005,840400,Aktie,"5,00","200,00","250,00","1.250,00",EUR`

    const parsed = parseCSV(csv)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Allianz SE')
    expect(parsed[0].isin).toBe('DE0008404005')
    expect(parsed[0].quantity).toBe(5)
    expect(parsed[0].purchasePrice).toBe(200)
    expect(parsed[0].currentPrice).toBe(250)
    expect(parsed[0].currentValue).toBe(1250)
  })

  it('calculates currentValue as quantity * currentPrice if currentValue is 0 or missing', () => {
    const csv = `Name,ISIN,Anzahl,Aktueller Kurs,Aktueller Wert
Apple,US0378331005,"10","150,00",0`

    const parsed = parseCSV(csv)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].currentValue).toBe(1500)
  })

  it('returns empty array when no valid positions are present', () => {
    const invalidCSV = `RandomHeader1,RandomHeader2
value1,value2`

    const parsed = parseCSV(invalidCSV)
    expect(parsed).toHaveLength(0)
  })
})
