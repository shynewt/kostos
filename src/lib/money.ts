/* Money formatting for minor-units (cents) amounts.
 *
 * Display always renders with the project currency symbol and tabular-num figures.
 * Zero-decimal currencies (JPY, KRW, etc.) format as whole units with no decimal
 * point; everything else uses two fractional digits.
 */

import { currencyDecimals } from './currencies';

const MINUS = '−';

function formatBase(cents: number, decimals: number): string {
	const factor = 10 ** decimals;
	const abs = Math.abs(cents);
	const whole = Math.trunc(abs / factor);
	if (decimals === 0) return whole.toLocaleString('en-US');
	const fraction = (abs % factor).toString().padStart(decimals, '0');
	return `${whole.toLocaleString('en-US')}.${fraction}`;
}

export function formatAmount(cents: number, symbol: string, currency?: string): string {
	const decimals = currencyDecimals(currency);
	const sign = cents < 0 ? MINUS : '';
	return `${sign}${symbol}${formatBase(cents, decimals)}`;
}

/** Rounded to whole units, for rough figures like a daily average. */
export function formatWholeAmount(cents: number, symbol: string, currency?: string): string {
	const whole = Math.round(cents / 10 ** currencyDecimals(currency));
	return `${whole < 0 ? MINUS : ''}${symbol}${formatBase(whole, 0)}`;
}

export function formatSigned(cents: number, symbol: string, currency?: string): string {
	const decimals = currencyDecimals(currency);
	if (cents === 0) return `${symbol}${formatBase(0, decimals)}`;
	const sign = cents < 0 ? MINUS : '+';
	return `${sign}${symbol}${formatBase(cents, decimals)}`;
}

/** Render a cents value for a numeric input. Negatives use the keyboard hyphen because
 *  inputs reject the Unicode minus. Used to pre-fill amount fields on edit. */
export function toInputValue(cents: number, currency?: string): string {
	const decimals = currencyDecimals(currency);
	return (cents / 10 ** decimals).toFixed(decimals);
}
