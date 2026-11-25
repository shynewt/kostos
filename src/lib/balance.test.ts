import { describe, expect, it } from 'vitest';
import {
	computeBalances,
	expenseShares,
	planSettlements,
	splitEvenly,
	type MemberBalance
} from './balance';
import type { Expense, Member } from './types';

function member(id: string, name = id): Member {
	return { id, name, createdAt: 0 };
}

type ExpenseInit = Partial<Expense> & Pick<Expense, 'amount' | 'splits'> & { payerId?: string };

function expense(partial: ExpenseInit): Expense {
	const payments = partial.payments ?? (partial.payerId
		? [{ memberId: partial.payerId, amount: partial.amount }]
		: []);
	return {
		id: partial.id ?? 'e1',
		payments,
		amount: partial.amount,
		currency: partial.currency ?? 'EUR',
		exchangeRate: partial.exchangeRate,
		date: partial.date ?? 0,
		splitMode: partial.splitMode ?? 'even',
		splits: partial.splits,
		createdAt: partial.createdAt ?? 0,
		createdBy: partial.createdBy ?? payments[0]?.memberId ?? ''
	};
}

function sumOf(map: Map<string, number>): number {
	let total = 0;
	for (const v of map.values()) total += v;
	return total;
}

function netZero(balances: MemberBalance[]): boolean {
	return balances.reduce((acc, b) => acc + b.net, 0) === 0;
}

function ledger(nets: Record<string, number>): MemberBalance[] {
	return Object.entries(nets).map(([memberId, net]) => ({ memberId, net }));
}

function leftAfter(balances: MemberBalance[], plan: { from: string; to: string; amount: number }[]): number[] {
	const left = new Map(balances.map((b) => [b.memberId, b.net]));
	for (const tx of plan) {
		left.set(tx.from, (left.get(tx.from) ?? 0) + tx.amount);
		left.set(tx.to, (left.get(tx.to) ?? 0) - tx.amount);
	}
	return [...left.values()];
}

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

/** The true minimum, worked out the slow way: people minus the most groups that each cancel
 *  out among themselves, trying every way to form the group the first person is in. */
function fewestPayments(nets: number[]): number {
	const open = nets.filter((net) => net !== 0);
	const mostGroups = (left: number[]): number => {
		if (left.length === 0) return 0;
		const [first, ...others] = left;
		let best = -Infinity;
		for (let pick = 0; pick < 1 << others.length; pick++) {
			let sum = first;
			const remaining: number[] = [];
			others.forEach((net, i) => {
				if (pick & (1 << i)) sum += net;
				else remaining.push(net);
			});
			if (sum === 0) best = Math.max(best, 1 + mostGroups(remaining));
		}
		return best;
	};
	return open.length - mostGroups(open);
}

describe('splitEvenly', () => {
	it('divides evenly when total is divisible', () => {
		expect(splitEvenly(900, 3)).toEqual([300, 300, 300]);
	});

	it('distributes remainder to leading parts', () => {
		expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
	});

	it('preserves total under irregular splits', () => {
		const parts = splitEvenly(8420, 7);
		expect(parts.reduce((a, b) => a + b, 0)).toBe(8420);
		expect(parts.length).toBe(7);
	});

	it('handles a single recipient', () => {
		expect(splitEvenly(1234, 1)).toEqual([1234]);
	});

	it('returns empty for zero parts', () => {
		expect(splitEvenly(100, 0)).toEqual([]);
	});

	it('handles negative totals symmetrically', () => {
		const parts = splitEvenly(-1000, 3);
		expect(parts.reduce((a, b) => a + b, 0)).toBe(-1000);
		expect(parts).toEqual([-334, -333, -333]);
	});
});

describe('expenseShares', () => {
	it('splits evenly across involved members', () => {
		const result = expenseShares(
			expense({
				amount: 1000,
				payerId: 'a',
				splitMode: 'even',
				splits: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]
			})
		);
		expect(result.get('a')).toBe(334);
		expect(result.get('b')).toBe(333);
		expect(result.get('c')).toBe(333);
		expect(sumOf(result)).toBe(1000);
	});

	it('respects amount mode with exact assignments', () => {
		const result = expenseShares(
			expense({
				amount: 2000,
				payerId: 'a',
				splitMode: 'amount',
				splits: [
					{ memberId: 'a', amount: 1500 },
					{ memberId: 'b', amount: 500 }
				]
			})
		);
		expect(result.get('a')).toBe(1500);
		expect(result.get('b')).toBe(500);
	});

	it('absorbs drift into the first split in amount mode', () => {
		const result = expenseShares(
			expense({
				amount: 2000,
				payerId: 'a',
				splitMode: 'amount',
				splits: [
					{ memberId: 'a', amount: 1499 },
					{ memberId: 'b', amount: 500 }
				]
			})
		);
		expect(result.get('a')).toBe(1500);
		expect(result.get('b')).toBe(500);
		expect(sumOf(result)).toBe(2000);
	});

	it('distributes by shares with no rounding loss', () => {
		const result = expenseShares(
			expense({
				amount: 11655,
				payerId: 'a',
				splitMode: 'shares',
				splits: [
					{ memberId: 'a', shares: 2 },
					{ memberId: 'b', shares: 2 },
					{ memberId: 'c', shares: 3 },
					{ memberId: 'd', shares: 1 },
					{ memberId: 'e', shares: 2 }
				]
			})
		);
		expect(sumOf(result)).toBe(11655);
		expect(result.get('c')).toBeGreaterThan(result.get('a')!);
		expect(result.get('d')).toBeLessThan(result.get('a')!);
	});

	it('returns an empty map when shares mode totals to zero shares', () => {
		const result = expenseShares(
			expense({
				amount: 1000,
				payerId: 'a',
				splitMode: 'shares',
				splits: [
					{ memberId: 'a', shares: 0 },
					{ memberId: 'b', shares: 0 }
				]
			})
		);
		expect(result.size).toBe(0);
	});
});

describe('computeBalances', () => {
	it('credits payer and debits each beneficiary', () => {
		const members = [member('a'), member('b'), member('c')];
		const expenses: Expense[] = [
			expense({
				amount: 900,
				payerId: 'a',
				splits: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]
			})
		];
		const balances = computeBalances(members, expenses);
		const byId = Object.fromEntries(balances.map((b) => [b.memberId, b.net]));
		expect(byId.a).toBe(600);
		expect(byId.b).toBe(-300);
		expect(byId.c).toBe(-300);
	});

	it('zeroes out a debt when a settlement expense is applied', () => {
		const members = [member('a'), member('b')];
		const debt: Expense = expense({
			id: 'e1',
			amount: 5000,
			payerId: 'a',
			splits: [{ memberId: 'a' }, { memberId: 'b' }]
		});
		const settlement: Expense = expense({
			id: 's1',
			amount: 2500,
			payerId: 'b',
			splits: [{ memberId: 'a' }]
		});
		const balances = computeBalances(members, [debt, settlement]);
		const byId = Object.fromEntries(balances.map((b) => [b.memberId, b.net]));
		expect(byId.a).toBe(0);
		expect(byId.b).toBe(0);
	});

	it('credits multiple payers in proportion to what they paid', () => {
		const members = [member('a'), member('b'), member('c')];
		const expenses: Expense[] = [
			expense({
				amount: 900,
				payments: [
					{ memberId: 'a', amount: 600 },
					{ memberId: 'b', amount: 300 }
				],
				splits: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]
			})
		];
		const balances = computeBalances(members, expenses);
		const byId = Object.fromEntries(balances.map((b) => [b.memberId, b.net]));
		expect(byId.a).toBe(300);
		expect(byId.b).toBe(0);
		expect(byId.c).toBe(-300);
		expect(netZero(balances)).toBe(true);
	});

	it('converts a foreign-currency expense to base before laddering', () => {
		const members = [member('a'), member('b')];
		const expenses: Expense[] = [
			expense({
				amount: 5000, // $50.00
				currency: 'USD',
				exchangeRate: 0.9, // 0.90 EUR per USD
				payerId: 'a',
				splits: [{ memberId: 'a' }, { memberId: 'b' }]
			})
		];
		const balances = computeBalances(members, expenses, 'EUR');
		const byId = Object.fromEntries(balances.map((b) => [b.memberId, b.net]));
		// base total €45.00, split evenly => b owes a €22.50
		expect(byId.a).toBe(2250);
		expect(byId.b).toBe(-2250);
		expect(netZero(balances)).toBe(true);
	});

	it('keeps a mixed-currency ledger net-zero', () => {
		const members = [member('a'), member('b'), member('c')];
		const expenses: Expense[] = [
			expense({
				id: 'eur',
				amount: 9001,
				payerId: 'a',
				splits: members.map((m) => ({ memberId: m.id }))
			}),
			expense({
				id: 'usd',
				amount: 4999,
				currency: 'USD',
				exchangeRate: 0.913,
				payerId: 'b',
				splitMode: 'shares',
				splits: [
					{ memberId: 'a', shares: 1 },
					{ memberId: 'b', shares: 2 },
					{ memberId: 'c', shares: 3 }
				]
			})
		];
		const balances = computeBalances(members, expenses, 'EUR');
		expect(netZero(balances)).toBe(true);
	});

	it('produces a net-zero ledger across many expenses', () => {
		const members = [member('a'), member('b'), member('c'), member('d')];
		const expenses: Expense[] = [
			expense({
				id: 'x1',
				amount: 8420,
				payerId: 'a',
				splitMode: 'even',
				splits: members.map((m) => ({ memberId: m.id }))
			}),
			expense({
				id: 'x2',
				amount: 4250,
				payerId: 'b',
				splitMode: 'shares',
				splits: [
					{ memberId: 'a', shares: 1 },
					{ memberId: 'b', shares: 1 },
					{ memberId: 'c', shares: 2 }
				]
			}),
			expense({
				id: 'x3',
				amount: 1500,
				payerId: 'd',
				splitMode: 'amount',
				splits: [
					{ memberId: 'a', amount: 700 },
					{ memberId: 'b', amount: 400 },
					{ memberId: 'd', amount: 400 }
				]
			})
		];
		const balances = computeBalances(members, expenses);
		expect(netZero(balances)).toBe(true);
	});
});

describe('planSettlements', () => {
	it('returns the empty plan when nobody owes anyone', () => {
		const plan = planSettlements([
			{ memberId: 'a', net: 0 },
			{ memberId: 'b', net: 0 }
		]);
		expect(plan).toEqual([]);
	});

	it('pairs one debtor with one creditor in a single transaction', () => {
		const plan = planSettlements([
			{ memberId: 'a', net: 1000 },
			{ memberId: 'b', net: -1000 }
		]);
		expect(plan).toEqual([{ from: 'b', to: 'a', amount: 1000 }]);
	});

	it('settles a 4-way circle in three payments, the fewest there are', () => {
		const plan = planSettlements([
			{ memberId: 'a', net: 1500 },
			{ memberId: 'b', net: -500 },
			{ memberId: 'c', net: 200 },
			{ memberId: 'd', net: -1200 }
		]);
		expect(plan.length).toBe(3);
		expect(plan.reduce((sum, s) => sum + s.amount, 0)).toBe(1700);
	});

	it('pairs people whose balances cancel exactly instead of chaining through everyone', () => {
		const balances = ledger({ alice: -10000, bob: -6000, charlie: 7000, dana: 6000, erin: 3000 });
		const plan = planSettlements(balances);
		expect(plan).toEqual([
			{ from: 'alice', to: 'charlie', amount: 7000 },
			{ from: 'bob', to: 'dana', amount: 6000 },
			{ from: 'alice', to: 'erin', amount: 3000 }
		]);
	});

	it('finds groups of three that cancel among themselves', () => {
		const balances = ledger({ a: 300, b: 200, c: -500, d: 400, e: 100, f: -500 });
		const plan = planSettlements(balances);
		expect(plan.length).toBe(4);
		expect(leftAfter(balances, plan).every((net) => net === 0)).toBe(true);
	});

	it('never needs more payments than the proven minimum', () => {
		const random = seededRandom(20261125);
		for (let round = 0; round < 400; round++) {
			const size = 2 + Math.floor(random() * 8);
			const nets = Array.from({ length: size - 1 }, () => Math.floor(random() * 41) - 20);
			nets.push(-nets.reduce((a, b) => a + b, 0));
			const balances = nets.map((net, i) => ({ memberId: `m${i}`, net }));
			const plan = planSettlements(balances);
			expect(plan.length, `balances ${nets.join(', ')}`).toBe(fewestPayments(nets));
			expect(leftAfter(balances, plan).every((net) => net === 0)).toBe(true);
			expect(plan.every((tx) => tx.amount > 0 && tx.from !== tx.to)).toBe(true);
		}
	});

	it('still settles a group too big for the exact search', () => {
		const random = seededRandom(7);
		const nets = Array.from({ length: 39 }, () => Math.floor(random() * 20001) - 10000);
		nets.push(-nets.reduce((a, b) => a + b, 0));
		const balances = nets.map((net, i) => ({ memberId: `m${i}`, net }));
		const plan = planSettlements(balances);
		expect(leftAfter(balances, plan).every((net) => net === 0)).toBe(true);
		expect(plan.length).toBeLessThan(balances.filter((b) => b.net !== 0).length);
	});

	it('gives the same plan every time for the same balances', () => {
		const balances = ledger({ a: 700, b: -300, c: -400, d: 250, e: -250, f: 900, g: -900 });
		expect(planSettlements(balances)).toEqual(planSettlements(balances.map((b) => ({ ...b }))));
	});

	it('produces a plan that zeroes out the ledger', () => {
		const balances: MemberBalance[] = [
			{ memberId: 'a', net: 1234 },
			{ memberId: 'b', net: -567 },
			{ memberId: 'c', net: 89 },
			{ memberId: 'd', net: -756 }
		];
		const plan = planSettlements(balances);
		const settled = new Map(balances.map((b) => [b.memberId, b.net]));
		for (const tx of plan) {
			settled.set(tx.from, (settled.get(tx.from) ?? 0) + tx.amount);
			settled.set(tx.to, (settled.get(tx.to) ?? 0) - tx.amount);
		}
		for (const v of settled.values()) expect(v).toBe(0);
	});

	it('never instructs a member to pay themselves', () => {
		const plan = planSettlements([
			{ memberId: 'a', net: 500 },
			{ memberId: 'b', net: -500 }
		]);
		for (const tx of plan) expect(tx.from).not.toBe(tx.to);
	});
});
