import { describe, expect, it } from 'vitest';
import { computeBalances, expenseShares } from './balance';
import { spentInBase } from './currency-convert';
import { entryKind, isIncome, negateExpense } from './income';
import type { Expense, Member } from './types';

const members: Member[] = ['alice', 'bob', 'charlie'].map((id) => ({ id, name: id, createdAt: 0 }));

function expense(partial: Partial<Expense> & Pick<Expense, 'amount' | 'splits'>): Expense {
	return {
		id: 'e1',
		payments: [{ memberId: 'alice', amount: partial.amount }],
		currency: 'EUR',
		date: 0,
		splitMode: 'even',
		createdAt: 0,
		createdBy: 'alice',
		...partial
	};
}

const everyone = members.map((m) => ({ memberId: m.id }));
const netOf = (expenses: Expense[], baseCurrency?: string) =>
	Object.fromEntries(computeBalances(members, expenses, baseCurrency).map((b) => [b.memberId, b.net]));

describe('isIncome', () => {
	it('is a negative amount that is not a settlement', () => {
		expect(isIncome(expense({ amount: -900, splits: everyone }))).toBe(true);
		expect(isIncome(expense({ amount: 900, splits: everyone }))).toBe(false);
		expect(isIncome(expense({ amount: -900, splits: everyone, isSettlement: true }))).toBe(false);
		expect(entryKind(expense({ amount: -1, splits: everyone }))).toBe('income');
	});
});

describe('negateExpense', () => {
	it('flips the total, payments, charged amount and amount splits, and leaves shares alone', () => {
		const flipped = negateExpense(
			expense({
				amount: 900,
				chargedAmount: 1000,
				exchangeRate: 1.1,
				splitMode: 'amount',
				splits: [
					{ memberId: 'alice', amount: 600, shares: 2 },
					{ memberId: 'bob', amount: 300 }
				]
			})
		);
		expect(flipped.amount).toBe(-900);
		expect(flipped.chargedAmount).toBe(-1000);
		expect(flipped.exchangeRate).toBe(1.1);
		expect(flipped.payments).toEqual([{ memberId: 'alice', amount: -900 }]);
		expect(flipped.splits).toEqual([
			{ memberId: 'alice', amount: -600, shares: 2 },
			{ memberId: 'bob', amount: -300 }
		]);
	});

	it('gives back the original when applied twice, without a negative zero', () => {
		const original = expense({ amount: 0, splits: [{ memberId: 'alice', amount: 0 }], splitMode: 'amount' });
		expect(Object.is(negateExpense(original).amount, 0)).toBe(true);
		const priced = expense({ amount: 1234, splits: everyone });
		expect(negateExpense(negateExpense(priced))).toEqual(priced);
	});
});

describe('income in balances', () => {
	it('makes whoever received the money owe the others their share', () => {
		const net = netOf([expense({ amount: -900, splits: everyone })]);
		expect(net).toEqual({ alice: -600, bob: 300, charlie: 300 });
	});

	it('is cancelled out by the expense it refunds', () => {
		const paid = expense({ id: 'paid', amount: 1000, splits: everyone });
		const refunded = expense({ id: 'refund', amount: -1000, splits: everyone });
		expect(netOf([paid, refunded])).toEqual({ alice: 0, bob: 0, charlie: 0 });
	});

	it('splits by shares with nothing lost to rounding', () => {
		const income = expense({
			amount: -1000,
			splitMode: 'shares',
			splits: [
				{ memberId: 'alice', shares: 1 },
				{ memberId: 'bob', shares: 1 },
				{ memberId: 'charlie', shares: 1 }
			]
		});
		const shares = expenseShares(income);
		expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(-1000);
		expect([...shares.values()].every((cents) => cents === -333 || cents === -334)).toBe(true);
	});

	it('honours exact amounts', () => {
		const income = expense({
			amount: -1000,
			splitMode: 'amount',
			splits: [
				{ memberId: 'bob', amount: -700 },
				{ memberId: 'charlie', amount: -300 }
			]
		});
		expect(Object.fromEntries(expenseShares(income))).toEqual({ bob: -700, charlie: -300 });
		expect(netOf([income])).toEqual({ alice: -1000, bob: 700, charlie: 300 });
	});

	it('converts a foreign income through what was actually received', () => {
		const income = expense({
			amount: -1000,
			currency: 'USD',
			exchangeRate: 0.9,
			chargedAmount: -900,
			splits: everyone
		});
		expect(netOf([income], 'EUR')).toEqual({ alice: -600, bob: 300, charlie: 300 });
	});

	it('lowers the spending total', () => {
		const paid = expense({ id: 'paid', amount: 1000, splits: everyone });
		const refunded = expense({ id: 'refund', amount: -400, splits: everyone });
		expect(spentInBase([paid, refunded], 'EUR')).toBe(600);
	});
});
