/* Free-text search over expenses. Every word has to match somewhere, so "taxi bob" narrows
 * to Bob's taxis. A word matches the title, note, payer, category, payment method, trip or
 * currency; a number also matches the amount ("42" finds €42.80, "42.5" only €42.50); a
 * month name or a year also matches the date ("rent feb 2024"). Quotes keep words together. */

import { currencyDecimals } from './currencies';
import { expenseBaseAmount } from './currency-convert';
import type { Expense } from './types';

export type SearchLookup = {
	memberNames: Map<string, string>;
	categoryNames: Map<string, string>;
	methodNames: Map<string, string>;
	tripNames: Map<string, string>;
	baseCurrency: string | undefined;
	locale?: string;
};

export function foldText(text: string): string {
	return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function searchTerms(query: string): string[] {
	const terms: string[] = [];
	for (const match of query.matchAll(/"([^"]*)"?|(\S+)/g)) {
		const term = foldText((match[1] ?? match[2]).trim());
		if (term) terms.push(term);
	}
	return terms;
}

export function matchesSearch(expense: Expense, terms: string[], lookup: SearchLookup): boolean {
	if (terms.length === 0) return true;
	const haystack = foldText(searchableText(expense, lookup));
	return terms.every(
		(term) => haystack.includes(term) || matchesAmount(expense, term, lookup.baseCurrency) || matchesDate(expense, term, lookup.locale)
	);
}

function searchableText(expense: Expense, lookup: SearchLookup): string {
	const parts = [expense.description, expense.notes, expense.currency];
	for (const payment of expense.payments) parts.push(lookup.memberNames.get(payment.memberId));
	if (expense.categoryId) parts.push(lookup.categoryNames.get(expense.categoryId));
	if (expense.paymentMethodId) parts.push(lookup.methodNames.get(expense.paymentMethodId));
	if (expense.tripId) parts.push(lookup.tripNames.get(expense.tripId));
	return parts.filter(Boolean).join('\n');
}

const AMOUNT_TERM = /^[^\d\s]{0,3}(\d+)(?:[.,](\d{1,2}))?$/;

function matchesAmount(expense: Expense, term: string, baseCurrency: string | undefined): boolean {
	const match = term.match(AMOUNT_TERM);
	if (!match) return false;
	const whole = Number(match[1]);
	const fraction = match[2];
	const candidates: [number, string | undefined][] = [[expense.amount, expense.currency]];
	if (baseCurrency && expense.currency !== baseCurrency) {
		candidates.push([expenseBaseAmount(expense, baseCurrency), baseCurrency]);
	}
	return candidates.some(([minor, currency]) => {
		const scale = 10 ** currencyDecimals(currency);
		const major = Math.abs(minor) / scale;
		if (fraction === undefined) return Math.trunc(major) === whole;
		return Math.round(Math.abs(minor)) === Math.round((whole + Number(`0.${fraction}`)) * scale);
	});
}

function matchesDate(expense: Expense, term: string, locale: string | undefined): boolean {
	const date = new Date(expense.date);
	if (/^\d{4}$/.test(term)) return date.getUTCFullYear() === Number(term);
	if (term.length < 3 || /\d/.test(term)) return false;
	return monthNames(locale)[date.getUTCMonth()].some((name) => name.startsWith(term));
}

const monthNameCache = new Map<string, string[][]>();

/** Each month's names in the reader's language and in English, folded for matching. */
function monthNames(locale: string | undefined): string[][] {
	const key = locale ?? '';
	const cached = monthNameCache.get(key);
	if (cached) return cached;
	const names = Array.from({ length: 12 }, (_, month) => {
		const day = Date.UTC(2000, month, 15);
		return [locale, 'en'].flatMap((lang) =>
			(['long', 'short'] as const).map((style) =>
				foldText(new Intl.DateTimeFormat(lang, { month: style, timeZone: 'UTC' }).format(day)).replace(/\.$/, '')
			)
		);
	});
	monthNameCache.set(key, names);
	return names;
}

/** Where the terms appear in `text`, as merged [start, end) ranges in its own characters. */
export function matchRanges(text: string, terms: string[]): [number, number][] {
	let folded = '';
	const origin: number[] = [];
	for (let i = 0; i < text.length; i++) {
		for (const char of foldText(text[i])) {
			folded += char;
			origin.push(i);
		}
	}
	const ranges: [number, number][] = [];
	for (const term of terms) {
		for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
			ranges.push([origin[at], origin[at + term.length - 1] + 1]);
		}
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];
	for (const range of ranges) {
		const last = merged.at(-1);
		if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
		else merged.push([...range]);
	}
	return merged;
}
