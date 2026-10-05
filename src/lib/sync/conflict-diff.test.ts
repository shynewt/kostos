import { describe, expect, it } from 'vitest';
import { diffVersions, type DiffContext } from './conflict-diff';
import type { ExpenseVersion } from './doc';
import type { Expense } from '$lib/types';

const names: Record<string, string> = { a: 'Anna', m: 'Marco' };
const ctx: DiffContext = {
	memberName: (id) => names[id] ?? 'Unknown member',
	categoryById: new Map(), methodById: new Map(), tripsById: new Map(), baseSymbol: '€', baseCurrency: 'EUR'
};
const expense = (patch: Partial<Expense> = {}): Expense => ({
	id: 'e', amount: 9000, currency: 'EUR', description: 'Dinner', date: Date.UTC(2026, 9, 5, 12),
	payments: [{ memberId: 'm', amount: 9000 }], splitMode: 'even', splits: [{ memberId: 'a' }, { memberId: 'm' }],
	createdAt: 0, createdBy: 'a', ...patch
});
const version = (id: string, e: Expense, by: string | null = 'a'): ExpenseVersion => ({ id, expense: e, parents: [], at: Date.UTC(2026, 9, 5, 12), by });

describe('diffVersions', () => {
	it('lists only the fields that differ', () => {
		const [one, two] = diffVersions([version('1', expense()), version('2', expense({ amount: 9600, payments: [{ memberId: 'm', amount: 9600 }] }))], ctx);
		expect(one.fields.map((f) => f.label)).toEqual(['Amount']);
		expect(one.fields[0].value).toBe('€90.00');
		expect(two.fields[0].value).toBe('€96.00');
	});

	it('shows who edited and falls back for unknown authors', () => {
		const [one, two] = diffVersions([version('1', expense(), 'm'), version('2', expense({ description: 'Seafood' }), null)], ctx);
		expect(one.byline).toMatch(/^Marco · /);
		expect(two.byline).toMatch(/^Another phone · /);
		expect(one.fields).toEqual([{ label: 'Title', value: 'Dinner' }]);
	});

	it('describes split and payer differences', () => {
		const [one, two] = diffVersions([
			version('1', expense()),
			version('2', expense({ splitMode: 'shares', splits: [{ memberId: 'a', shares: 2 }, { memberId: 'm', shares: 1 }], payments: [{ memberId: 'a', amount: 4500 }, { memberId: 'm', amount: 4500 }] }))
		], ctx);
		expect(one.fields.find((f) => f.label === 'Split')?.value).toBe('Evenly: Anna, Marco');
		expect(two.fields.find((f) => f.label === 'Split')?.value).toBe('By shares: Anna ×2, Marco ×1');
		expect(two.fields.find((f) => f.label === 'Paid by')?.value).toBe('Anna €45.00, Marco €45.00');
	});

	it('returns no fields when versions look identical', () => {
		const result = diffVersions([version('1', expense()), version('2', expense())], ctx);
		expect(result.every((v) => v.fields.length === 0)).toBe(true);
	});
});
