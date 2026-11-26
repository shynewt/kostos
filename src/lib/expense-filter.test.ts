import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, NONE, activeFilterCount, applyFilter, filterFromParams, writeFilterParams, type ExpenseFilter } from './expense-filter';
import type { Expense } from './types';

const utc = (year: number, month: number, day: number, hour = 0) => Date.UTC(year, month - 1, day, hour);

let nextId = 0;
function expense(overrides: Partial<Expense> = {}): Expense {
	const amount = overrides.amount ?? 1000;
	return {
		id: `e${nextId++}`,
		payments: [{ memberId: 'alice', amount }],
		amount,
		currency: 'EUR',
		date: utc(2024, 2, 14),
		splitMode: 'even',
		splits: [{ memberId: 'alice' }, { memberId: 'bob' }],
		createdAt: 0,
		createdBy: 'alice',
		...overrides
	};
}

const filter = (changes: Partial<ExpenseFilter>): ExpenseFilter => ({ ...EMPTY_FILTER, ...changes });
const ids = (list: Expense[]) => list.map((e) => e.description);

describe('applyFilter', () => {
	const food = expense({ description: 'food', categoryId: 'food', paymentMethodId: 'card' });
	const taxi = expense({ description: 'taxi', categoryId: 'taxi', payments: [{ memberId: 'bob', amount: 1000 }] });
	const plain = expense({ description: 'plain' });
	const settlement = expense({ description: 'settlement', isSettlement: true });
	const all = [food, taxi, plain, settlement];

	it('returns the same list when nothing is picked', () => {
		expect(applyFilter(all, EMPTY_FILTER, 'EUR')).toBe(all);
	});

	it('matches any picked category, and "none" means no category but not a settlement', () => {
		expect(ids(applyFilter(all, filter({ categoryIds: ['food', 'taxi'] }), 'EUR'))).toEqual(['food', 'taxi']);
		expect(ids(applyFilter(all, filter({ categoryIds: [NONE] }), 'EUR'))).toEqual(['plain']);
	});

	it('filters by payment method the same way', () => {
		expect(ids(applyFilter(all, filter({ methodIds: ['card'] }), 'EUR'))).toEqual(['food']);
		expect(ids(applyFilter(all, filter({ methodIds: [NONE] }), 'EUR'))).toEqual(['taxi', 'plain']);
	});

	it('matches any picked trip, and "none" means no trip', () => {
		const berlin = expense({ description: 'berlin', tripId: 'berlin' });
		const lisbon = expense({ description: 'lisbon', tripId: 'lisbon' });
		expect(ids(applyFilter([berlin, lisbon, plain], filter({ tripIds: ['berlin', 'lisbon'] }), 'EUR'))).toEqual(['berlin', 'lisbon']);
		expect(ids(applyFilter([berlin, lisbon, plain], filter({ tripIds: [NONE] }), 'EUR'))).toEqual(['plain']);
	});

	it('needs every kind of filter to match', () => {
		expect(ids(applyFilter(all, filter({ categoryIds: ['food', 'taxi'], payerIds: ['bob'] }), 'EUR'))).toEqual(['taxi']);
	});

	it('includes both ends of a date range, by UTC day', () => {
		const first = expense({ description: 'first', date: utc(2024, 2, 1) });
		const last = expense({ description: 'last', date: utc(2024, 2, 29, 23) });
		const after = expense({ description: 'after', date: utc(2024, 3, 1) });
		const range = filter({ from: '2024-02-01', to: '2024-02-29' });
		expect(ids(applyFilter([first, last, after], range, 'EUR'))).toEqual(['first', 'last']);
		expect(ids(applyFilter([first, last, after], filter({ from: '2024-03-01' }), 'EUR'))).toEqual(['after']);
	});

	it('compares amounts by size in the base currency, both ends included', () => {
		const small = expense({ description: 'small', amount: 500 });
		const income = expense({ description: 'income', amount: -2000, payments: [{ memberId: 'alice', amount: -2000 }] });
		const dollars = expense({ description: 'dollars', amount: 5000, currency: 'USD', chargedAmount: 4600 });
		const range = filter({ minAmount: 1000, maxAmount: 4600 });
		expect(ids(applyFilter([small, plain, income, dollars], range, 'EUR'))).toEqual(['plain', 'income', 'dollars']);
	});
});

describe('filter params', () => {
	it('round-trips through the URL and counts each kind once', () => {
		const picked = filter({ categoryIds: ['food', NONE], payerIds: ['bob'], tripIds: ['berlin'], from: '2024-02-01', minAmount: 0, maxAmount: 2500 });
		const params = new URLSearchParams('view=me');
		writeFilterParams(picked, params);
		expect(filterFromParams(params)).toEqual(picked);
		expect(params.get('view')).toBe('me');
		expect(activeFilterCount(picked)).toBe(5);
	});

	it('clears its params and ignores junk', () => {
		const params = new URLSearchParams('category=food&from=yesterday&min=-5&max=12.5');
		expect(filterFromParams(params)).toEqual(filter({ categoryIds: ['food'] }));
		writeFilterParams(EMPTY_FILTER, params);
		expect(params.toString()).toBe('');
	});
});
