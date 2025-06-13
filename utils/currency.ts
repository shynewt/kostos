// Currency configuration
export interface CurrencyOption {
  code: string
  symbol: string
  name: string
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'RON', symbol: 'R', name: 'Romanian Leu' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
  { code: 'SGD', symbol: '$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: '$', name: 'Hong Kong Dollar' },
  { code: 'NZD', symbol: '$', name: 'New Zealand Dollar' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
]

/**
 * Get currency information by currency code or symbol
 */
export function getCurrencyByCode(codeOrSymbol: string): CurrencyOption {
  // First try to find by code (case insensitive)
  const byCode = CURRENCY_OPTIONS.find((c) => c.code.toLowerCase() === codeOrSymbol.toLowerCase())

  if (byCode) {
    return byCode
  }

  // If not found by code, try to find by symbol
  const bySymbol = CURRENCY_OPTIONS.find((c) => c.symbol === codeOrSymbol)

  // Return the matching currency or default to USD if not found
  return bySymbol || CURRENCY_OPTIONS[0]
}

/**
 * Format a number as currency with the specified currency code
 */
export function formatCurrency(value: number, currencyCode: string): string {
  const currency = getCurrencyByCode(currencyCode)

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Get just the currency symbol for a specified currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
  const currency = getCurrencyByCode(currencyCode)
  return currency.symbol
}
