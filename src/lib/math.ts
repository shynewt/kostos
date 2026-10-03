/* Safe inline-math evaluator for currency inputs.
 *
 * The amount fields accept arithmetic like `50/20-2` or `(120 + 5) / 3`. We restrict
 * the input to digits, whitespace, decimal separators, and the operators + - * / ( ),
 * then let the JS engine evaluate. No identifiers means no global access; no quotes
 * means no string injection. The validating regex is the security boundary.
 */

const ALLOWED = /^[\d\s+\-*/().,]+$/;
const SINGLE_MATH_CHAR = /^[\d\s+\-*/().,]$/;
const NON_MATH_CHAR = /[^\d\s+\-*/().,]/g;

/** Whether a single character is one of the math-input alphabet members. */
export function isAllowedMathChar(c: string): boolean {
	return SINGLE_MATH_CHAR.test(c);
}

/** Drop every character that isn't part of the math-input alphabet. Useful for
 *  sanitising a paste payload before it lands in an amount field. */
export function stripDisallowedMathChars(s: string): string {
	return s.replace(NON_MATH_CHAR, '');
}

/** Evaluate a math expression like `50/20-2`. Returns the numeric result, or null
 *  if the input is empty, malformed, non-numeric, or contains disallowed characters.
 *  Commas are accepted as decimal separators (European convention).
 */
export function evalExpression(input: string): number | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (!ALLOWED.test(trimmed)) return null;
	if (/^[+\-*/.,]+$/.test(trimmed)) return null;

	const normalized = trimmed.replace(/,/g, '.');
	try {
		const value = new Function(`"use strict"; return (${normalized})`)();
		if (typeof value !== 'number' || !Number.isFinite(value)) return null;
		return value;
	} catch {
		return null;
	}
}

/** Convert a decimal amount to integer minor units. Rounds away from zero at 0.5 to
 *  mirror what users typing currency see. `decimals` defaults to 2; pass 0 for
 *  zero-decimal currencies like JPY so 2000 means ¥2000, not ¥20.00. */
export function toMinorUnits(value: number, decimals = 2): number {
	const scaled = value * 10 ** decimals;
	return scaled >= 0 ? Math.floor(scaled + 0.5) : -Math.floor(-scaled + 0.5);
}

/** Evaluate then convert to minor units in one call. Returns null on invalid input. */
export function evalToCents(input: string, decimals = 2): number | null {
	const result = evalExpression(input);
	if (result === null) return null;
	return toMinorUnits(result, decimals);
}

/** Does storing this value at `decimals` places drop precision (1.234 at 2, 10/3)? Float
 *  noise like 0.1 + 0.2 doesn't count. */
export function dropsPrecision(value: number, decimals = 2): boolean {
	const scaled = value * 10 ** decimals;
	return Math.abs(scaled - Math.round(scaled)) > 1e-6;
}
