export function fmtNumber(value: number, digits = 2): string {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function fmtEur(value: number, digits = 2): string {
  return `€ ${fmtNumber(value, digits)}`
}

export function fmtEurSigned(value: number, digits = 0): string {
  return `${value >= 0 ? '+' : '-'}€ ${fmtNumber(Math.abs(value), digits)}`
}

export function fmtPct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)} %`
}
