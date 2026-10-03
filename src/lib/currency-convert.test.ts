import { describe, expect, it } from 'vitest';
import {
	convertCents,
	expenseBaseAmount,
	expenseInBase,
	rateFromAmounts,
	spentInBase,
	scaleToTotal
} from './currency-convert';
import type { Expense } from './types';

function expense(partial: Partial<Expense> & Pick<Expense, 'amount' | 'splits'>): Expense {
	const payments = partial.payments ?? [{ memberId: 'a', amount: partial.amount }];
	return {
		id: partial.id ?? 'e1',
		payments,
		amount: partial.amount,
		currency: partial.currency ?? 'USD',
		exchangeRate: partial.exchangeRate,
		date: 0,
		splitMode: partial.splitMode ?? 'even',
		splits: partial.splits,
		createdAt: 0,
		createdBy: payments[0]?.memberId ?? ''
	};
}

describe('convertCents', () => {
	it('converts two-decimal to two-decimal', () => {
		expect(convertCents(5000, 'USD', 'EUR', 0.9)).toBe(4500);
	});

	it('handles a zero-decimal source currency', () => {
		// ¥5000 at 0.0062 EUR/¥ = €31.00
		expect(convertCents(5000, 'JPY', 'EUR', 0.0062)).toBe(3100);
	});

	it('handles a zero-decimal target currency', () => {
		// $50.00 at 150 JPY/$ = ¥7500
		expect(convertCents(5000, 'USD', 'JPY', 150)).toBe(7500);
	});

	it('rounds to the nearest minor unit', () => {
		expect(convertCents(1234, 'USD', 'EUR', 0.913)).toBe(Math.round((1234 / 100) * 0.913 * 100));
	});
});

describe('scaleToTotal', () => {
	it('is a no-op when the parts already sum to the total', () => {
		expect(scaleToTotal([334, 333, 333], 1000)).toEqual([334, 333, 333]);
	});

	it('scales proportionally and preserves the new total', () => {
		const out = scaleToTotal([600, 300], 4500);
		expect(out).toEqual([3000, 1500]);
		expect(out.reduce((a, b) => a + b, 0)).toBe(4500);
	});

	it('hands leftover units to the largest fractional parts', () => {
		const out = scaleToTotal([1, 1, 1], 10);
		expect(out.reduce((a, b) => a + b, 0)).toBe(10);
		expect(out).toEqual([4, 3, 3]);
	});

	it('dumps the whole total on the first part when the source sums to zero', () => {
		expect(scaleToTotal([0, 0], 100)).toEqual([100, 0]);
	});
});

describe('expenseBaseAmount', () => {
	it('returns the native amount when already in base', () => {
		expect(expenseBaseAmount(expense({ amount: 5000, currency: 'EUR', splits: [] }), 'EUR')).toBe(
			5000
		);
	});

	it('converts a foreign amount via the stored rate', () => {
		expect(
			expenseBaseAmount(
				expense({ amount: 5000, currency: 'USD', exchangeRate: 0.9, splits: [] }),
				'EUR'
			)
		).toBe(4500);
	});

	it('falls back to the native amount when no rate is stored', () => {
		expect(
			expenseBaseAmount(expense({ amount: 5000, currency: 'USD', splits: [] }), 'EUR')
		).toBe(5000);
	});
});

describe('expenseInBase', () => {
	it('rescales payments and shares so the expense still nets to zero', () => {
		const e = expense({
			amount: 5000,
			currency: 'USD',
			exchangeRate: 0.9,
			payments: [{ memberId: 'a', amount: 5000 }],
			splitMode: 'even',
			splits: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]
		});
		const base = expenseInBase(e, 'EUR');
		expect(base.amount).toBe(4500);
		expect(base.payments.reduce((s, p) => s + p.amount, 0)).toBe(4500);
		expect(base.currency).toBe('EUR');
	});

	it('rescales amount-mode splits to the base total', () => {
		const e = expense({
			amount: 2000,
			currency: 'USD',
			exchangeRate: 0.5,
			splitMode: 'amount',
			splits: [
				{ memberId: 'a', amount: 1500 },
				{ memberId: 'b', amount: 500 }
			]
		});
		const base = expenseInBase(e, 'EUR');
		expect(base.amount).toBe(1000);
		const total = base.splits.reduce((s, sp) => s + (sp.amount ?? 0), 0);
		expect(total).toBe(1000);
	});
});

describe('rateFromAmounts', () => {
	it('converts back to exactly the charged amount', () => {
		const cases: [number, string, number, string][] = [
			[10000, 'USD', 9387, 'EUR'],
			[123456, 'JPY', 77713, 'EUR'],
			[4999, 'CVE', 47, 'EUR'],
			[1, 'GBP', 999999, 'JPY'],
			[987654321, 'KRW', 66001234, 'USD']
		];
		for (const [amount, from, charged, to] of cases) {
			const rate = rateFromAmounts(amount, from, charged, to);
			expect(rate).not.toBeNull();
			expect(convertCents(amount, from, to, rate!)).toBe(charged);
		}
	});

	it('returns null for empty amounts', () => {
		expect(rateFromAmounts(0, 'USD', 100, 'EUR')).toBeNull();
		expect(rateFromAmounts(100, 'USD', 0, 'EUR')).toBeNull();
	});
});

describe('spentInBase', () => {
	it('converts foreign expenses and skips settlements', () => {
		const list = [
			expense({ amount: 1000, currency: 'EUR', splits: [] }),
			expense({ amount: 2000, currency: 'JPY', exchangeRate: 0.006, splits: [] }),
			{ ...expense({ amount: 500, currency: 'EUR', splits: [] }), isSettlement: true }
		];
		expect(spentInBase(list, 'EUR')).toBe(1000 + 1200);
	});
});
