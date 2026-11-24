import { describe, expect, it } from 'vitest';
import { computeBalances, splitEvenly } from './balance';
import { balanceBreakdown } from './balance-breakdown';
import type { Expense, ExpenseSplit, Member, SplitMode } from './types';

const members: Member[] = ['a', 'b', 'c'].map((id) => ({ id, name: id, createdAt: 0 }));

function expense(partial: Partial<Expense> & Pick<Expense, 'id' | 'amount' | 'payments' | 'splits'>): Expense {
	return {
		currency: 'EUR',
		date: 0,
		splitMode: 'even',
		createdAt: 0,
		createdBy: partial.payments[0]?.memberId ?? '',
		...partial
	};
}

function homeBalance(memberId: string, ledger: Member[], expenses: Expense[], base: string): number {
	return computeBalances(ledger, expenses, base).find((b) => b.memberId === memberId)?.net ?? 0;
}

describe('balanceBreakdown', () => {
	it('splits paid and share for an even expense', () => {
		const expenses = [
			expense({ id: 'e1', amount: 1000, payments: [{ memberId: 'a', amount: 1000 }], splits: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }] })
		];
		expect(balanceBreakdown('a', expenses, 'EUR')).toEqual({
			paid: 1000, share: 334, settlementsPaid: 0, settlementsReceived: 0, net: 666, expenseCount: 1
		});
		expect(balanceBreakdown('b', expenses, 'EUR')).toMatchObject({ paid: 0, share: 333, net: -333, expenseCount: 1 });
	});

	it('counts only the member’s own part of a multi-payer expense', () => {
		const expenses = [
			expense({
				id: 'e1',
				amount: 9000,
				payments: [{ memberId: 'a', amount: 6000 }, { memberId: 'b', amount: 3000 }],
				splits: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]
			})
		];
		expect(balanceBreakdown('b', expenses, 'EUR')).toMatchObject({ paid: 3000, share: 3000, net: 0 });
		expect(balanceBreakdown('a', expenses, 'EUR')).toMatchObject({ paid: 6000, share: 3000, net: 3000 });
	});

	it('uses weighted shares and exact amounts', () => {
		const expenses = [
			expense({
				id: 'shares',
				amount: 1000,
				splitMode: 'shares',
				payments: [{ memberId: 'b', amount: 1000 }],
				splits: [{ memberId: 'a', shares: 2 }, { memberId: 'b', shares: 1 }]
			}),
			expense({
				id: 'exact',
				amount: 2500,
				splitMode: 'amount',
				payments: [{ memberId: 'c', amount: 2500 }],
				splits: [{ memberId: 'a', amount: 2000 }, { memberId: 'c', amount: 500 }]
			})
		];
		// shares: 1000 * 2/3 = 666.67, the leftover cent goes to the larger share
		expect(balanceBreakdown('a', expenses, 'EUR')).toMatchObject({ paid: 0, share: 667 + 2000, net: -2667, expenseCount: 2 });
	});

	it('uses the stored converted amount for foreign-currency expenses', () => {
		const expenses = [
			expense({
				id: 'yen',
				amount: 3000,
				currency: 'JPY',
				exchangeRate: 0.0061,
				chargedAmount: 1850,
				payments: [{ memberId: 'a', amount: 3000 }],
				splits: [{ memberId: 'a' }, { memberId: 'b' }]
			})
		];
		expect(balanceBreakdown('a', expenses, 'EUR')).toMatchObject({ paid: 1850, share: 925, net: 925 });
		expect(balanceBreakdown('b', expenses, 'EUR')).toMatchObject({ paid: 0, share: 925, net: -925 });
	});

	it('keeps settlements apart from spending', () => {
		const expenses = [
			expense({ id: 'e1', amount: 2000, payments: [{ memberId: 'a', amount: 2000 }], splits: [{ memberId: 'a' }, { memberId: 'b' }] }),
			expense({ id: 's1', amount: 400, isSettlement: true, payments: [{ memberId: 'b', amount: 400 }], splits: [{ memberId: 'a' }] })
		];
		expect(balanceBreakdown('a', expenses, 'EUR')).toEqual({
			paid: 2000, share: 1000, settlementsPaid: 0, settlementsReceived: 400, net: 600, expenseCount: 1
		});
		expect(balanceBreakdown('b', expenses, 'EUR')).toEqual({
			paid: 0, share: 1000, settlementsPaid: 400, settlementsReceived: 0, net: -600, expenseCount: 1
		});
	});

	it('is all zero for a member in no expenses', () => {
		const expenses = [
			expense({ id: 'e1', amount: 500, payments: [{ memberId: 'a', amount: 500 }], splits: [{ memberId: 'b' }] })
		];
		expect(balanceBreakdown('c', expenses, 'EUR')).toEqual({
			paid: 0, share: 0, settlementsPaid: 0, settlementsReceived: 0, net: 0, expenseCount: 0
		});
	});
});

function mulberry32(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const POOL: Member[] = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, name: `M${i}`, createdAt: 0 }));
const CURRENCIES = ['EUR', 'USD', 'JPY'];

function randomLedger(rand: () => number): { ledger: Member[]; expenses: Expense[] } {
	const ledger = POOL.slice(0, 2 + Math.floor(rand() * 4));
	const pickMember = () => ledger[Math.floor(rand() * ledger.length)];
	const expenses: Expense[] = [];
	const count = 1 + Math.floor(rand() * 10);
	for (let index = 0; index < count; index++) {
		const amount = 1 + Math.floor(rand() * 100000);
		const currency = CURRENCIES[Math.floor(rand() * CURRENCIES.length)];
		const foreign = currency !== 'EUR';
		const conversion = foreign
			? rand() < 0.5
				? { exchangeRate: 0.005 + rand() * 2 }
				: { exchangeRate: 1, chargedAmount: 1 + Math.floor(rand() * 100000) }
			: {};

		if (rand() < 0.25) {
			const from = pickMember();
			const to = ledger.find((m) => m.id !== from.id) ?? from;
			expenses.push(expense({
				id: `s${index}`, amount, currency, ...conversion, isSettlement: true,
				payments: [{ memberId: from.id, amount }], splits: [{ memberId: to.id }]
			}));
			continue;
		}

		const involved = [...ledger].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * ledger.length));
		const roll = rand();
		const splitMode: SplitMode = roll < 0.34 ? 'even' : roll < 0.67 ? 'shares' : 'amount';
		const splits: ExpenseSplit[] = involved.map((m) => {
			if (splitMode === 'shares') return { memberId: m.id, shares: 1 + Math.floor(rand() * 4) };
			if (splitMode === 'amount') return { memberId: m.id, amount: Math.floor(rand() * amount) };
			return { memberId: m.id };
		});
		const payers = [...ledger].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * Math.min(3, ledger.length)));
		const portions = splitEvenly(amount, payers.length);
		expenses.push(expense({
			id: `e${index}`, amount, currency, ...conversion, splitMode, splits,
			payments: payers.map((m, i) => ({ memberId: m.id, amount: portions[i] }))
		}));
	}
	return { ledger, expenses };
}

describe('balanceBreakdown matches the home balance (fuzz)', () => {
	it('always nets to the balance computeBalances reports', () => {
		for (let seed = 1; seed <= 400; seed++) {
			const { ledger, expenses } = randomLedger(mulberry32(seed));
			for (const m of ledger) {
				const breakdown = balanceBreakdown(m.id, expenses, 'EUR');
				const parts = breakdown.paid - breakdown.share + breakdown.settlementsPaid - breakdown.settlementsReceived;
				expect(breakdown.net, `parts, seed ${seed}, ${m.id}`).toBe(parts);
				expect(breakdown.net, `home balance, seed ${seed}, ${m.id}`).toBe(homeBalance(m.id, ledger, expenses, 'EUR'));
			}
		}
	});

	it('matches for the fixed example group too', () => {
		const expenses = [
			expense({ id: 'e1', amount: 1000, payments: [{ memberId: 'a', amount: 1000 }], splits: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }] }),
			expense({ id: 's1', amount: 333, isSettlement: true, payments: [{ memberId: 'b', amount: 333 }], splits: [{ memberId: 'a' }] })
		];
		for (const m of members) {
			expect(balanceBreakdown(m.id, expenses, 'EUR').net).toBe(homeBalance(m.id, members, expenses, 'EUR'));
		}
	});
});
