import { describe, expect, it } from 'vitest';
import { matchRanges, matchesSearch, searchTerms, type SearchLookup } from './expense-search';
import type { Expense } from './types';

const utc = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);

function expense(overrides: Partial<Expense> = {}): Expense {
	const amount = overrides.amount ?? 4280;
	return {
		id: 'e1',
		payments: [{ memberId: 'bob', amount }],
		amount,
		currency: 'EUR',
		date: utc(2024, 2, 14),
		splitMode: 'even',
		splits: [{ memberId: 'alice' }, { memberId: 'bob' }],
		description: 'Taxi to the airport',
		createdAt: 0,
		createdBy: 'bob',
		...overrides
	};
}

const lookup: SearchLookup = {
	memberNames: new Map([
		['alice', 'Alice'],
		['bob', 'Bob']
	]),
	categoryNames: new Map([['cat-transport', 'Transport']]),
	methodNames: new Map([['card', 'Visa card']]),
	tripNames: new Map([['lisbon', 'Lisbon weekend']]),
	baseCurrency: 'EUR',
	locale: 'en-GB'
};

const finds = (query: string, overrides: Partial<Expense> = {}) => matchesSearch(expense(overrides), searchTerms(query), lookup);

describe('searchTerms', () => {
	it('splits on spaces, keeps quoted words together and ignores case and accents', () => {
		expect(searchTerms('  Café "late Taxi" Bob ')).toEqual(['cafe', 'late taxi', 'bob']);
		expect(searchTerms('"unclosed quote')).toEqual(['unclosed quote']);
		expect(searchTerms('   ')).toEqual([]);
	});
});

describe('matchesSearch', () => {
	it('needs every word to match somewhere', () => {
		expect(finds('taxi bob')).toBe(true);
		expect(finds('taxi alice')).toBe(false);
	});

	it('looks through the note, category, payment method, trip and currency', () => {
		const tagged = { notes: 'Split with the neighbours', categoryId: 'cat-transport', paymentMethodId: 'card', tripId: 'lisbon' };
		for (const word of ['neighbours', 'transport', 'visa', 'lisbon', 'eur']) expect(finds(word, tagged)).toBe(true);
	});

	it('does not match people who only shared the expense', () => {
		expect(finds('alice')).toBe(false);
	});

	it('matches accents either way', () => {
		expect(finds('cafe', { description: 'Café Nata' })).toBe(true);
		expect(finds('café', { description: 'Cafe Nata' })).toBe(true);
	});

	it('finds an amount by its whole part, or exactly when cents are given', () => {
		expect(finds('42')).toBe(true);
		expect(finds('€42')).toBe(true);
		expect(finds('42.80')).toBe(true);
		expect(finds('42,8')).toBe(true);
		expect(finds('42.50')).toBe(false);
		expect(finds('4')).toBe(false);
	});

	it('finds an income or a foreign expense by its size in either currency', () => {
		expect(finds('42', { amount: -4280, payments: [{ memberId: 'bob', amount: -4280 }] })).toBe(true);
		const dollars = { amount: 5000, currency: 'USD', chargedAmount: 4612, payments: [{ memberId: 'bob', amount: 5000 }] };
		expect(finds('50', dollars)).toBe(true);
		expect(finds('46.12', dollars)).toBe(true);
	});

	it('finds the month and year the expense is dated', () => {
		expect(finds('feb')).toBe(true);
		expect(finds('february 2024')).toBe(true);
		expect(finds('taxi feb 2024')).toBe(true);
		expect(finds('march')).toBe(false);
		expect(finds('2025')).toBe(false);
	});
});

describe('matchRanges', () => {
	it('marks every term, ignoring case and accents, and merges overlaps', () => {
		expect(matchRanges('Café near the Cafe', ['cafe'])).toEqual([
			[0, 4],
			[14, 18]
		]);
		expect(matchRanges('Airport taxi', ['air', 'irport', 'taxi'])).toEqual([
			[0, 7],
			[8, 12]
		]);
		expect(matchRanges('Taxi', ['bus'])).toEqual([]);
	});
});
