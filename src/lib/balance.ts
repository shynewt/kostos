/* Balance + settlement engine.
 *
 * All amounts are in minor units (cents) so the math is integer-exact. The settlement
 * planner uses the classic greedy max-creditor / max-debtor pairing; it is what Splitwise
 * and most expense apps use because the true minimum-transactions problem is NP-hard
 * (reduces to subset-sum) and this greedy variant is near-optimal in practice while
 * running in O(n log n).
 */

import { expenseInBase } from './currency-convert';
import type { Expense, Member } from './types';

export type MemberBalance = {
	memberId: string;
	/** Positive: the member is owed money. Negative: the member owes. Zero: settled. */
	net: number;
};

export type Settlement = {
	from: string;
	to: string;
	amount: number;
};

/** Spread an integer total across n parts with no rounding loss. The first `remainder`
 *  parts receive one extra minor unit. Deterministic across runs. */
export function splitEvenly(totalCents: number, parts: number): number[] {
	if (parts <= 0) return [];
	const base = Math.trunc(totalCents / parts);
	const remainder = totalCents - base * parts;
	const out = new Array<number>(parts).fill(base);
	const sign = totalCents >= 0 ? 1 : -1;
	for (let i = 0; i < Math.abs(remainder); i++) out[i] += sign;
	return out;
}

/** Compute the per-member cents owed for one expense.
 *  Returns a Map of memberId → cents. The sum always equals expense.amount exactly. */
export function expenseShares(expense: Expense): Map<string, number> {
	const result = new Map<string, number>();
	if (expense.splits.length === 0) return result;

	if (expense.splitMode === 'even') {
		const ids = expense.splits.map((s) => s.memberId);
		const portions = splitEvenly(expense.amount, ids.length);
		ids.forEach((id, i) => result.set(id, portions[i]));
		return result;
	}

	if (expense.splitMode === 'amount') {
		let assigned = 0;
		for (const s of expense.splits) {
			const amt = Math.max(0, Math.trunc(s.amount ?? 0));
			result.set(s.memberId, amt);
			assigned += amt;
		}
		const drift = expense.amount - assigned;
		if (drift !== 0 && expense.splits.length > 0) {
			const firstId = expense.splits[0].memberId;
			result.set(firstId, (result.get(firstId) ?? 0) + drift);
		}
		return result;
	}

	// shares mode: weighted, then redistribute remainder to highest shares
	const weighted = expense.splits.map((s) => ({
		memberId: s.memberId,
		shares: Math.max(0, s.shares ?? 0)
	}));
	const totalShares = weighted.reduce((acc, s) => acc + s.shares, 0);
	if (totalShares === 0) return result;

	let assigned = 0;
	for (const s of weighted) {
		const cents = Math.trunc((expense.amount * s.shares) / totalShares);
		result.set(s.memberId, cents);
		assigned += cents;
	}
	let drift = expense.amount - assigned;
	const byShares = weighted.toSorted((a, b) => b.shares - a.shares);
	let i = 0;
	while (drift !== 0 && byShares.length > 0) {
		const id = byShares[i % byShares.length].memberId;
		result.set(id, (result.get(id) ?? 0) + Math.sign(drift));
		drift -= Math.sign(drift);
		i++;
	}
	return result;
}

/** Compute net balances. When `baseCurrency` is given, foreign-currency expenses are
 *  converted to it via their stored rate; the per-expense total is converted once and its
 *  payments and shares are rescaled to that total, so each expense still nets to zero in
 *  base. Without `baseCurrency` (or when all expenses share the base) it is a no-op pass. */
export function computeBalances(
	members: Member[],
	expenses: Expense[],
	baseCurrency?: string
): MemberBalance[] {
	const net = new Map<string, number>();
	for (const m of members) net.set(m.id, 0);

	for (const raw of expenses) {
		const expense = baseCurrency ? expenseInBase(raw, baseCurrency) : raw;
		for (const payment of expense.payments) {
			net.set(payment.memberId, (net.get(payment.memberId) ?? 0) + payment.amount);
		}
		const shares = expenseShares(expense);
		for (const [memberId, cents] of shares) {
			net.set(memberId, (net.get(memberId) ?? 0) - cents);
		}
	}

	return [...net.entries()].map(([memberId, value]) => ({ memberId, net: value }));
}

/** Greedy minimum-cashflow planner. Repeatedly pairs the largest creditor with the
 *  largest debtor, settles the overlap, and removes the zeroed party. Near-optimal for
 *  the n-party debt graph; trivially deterministic when amounts tie because the input
 *  ordering breaks ties. */
export function planSettlements(balances: MemberBalance[]): Settlement[] {
	const creditors = balances
		.filter((b) => b.net > 0)
		.map((b) => ({ ...b }))
		.sort((a, b) => b.net - a.net);
	const debtors = balances
		.filter((b) => b.net < 0)
		.map((b) => ({ ...b }))
		.sort((a, b) => a.net - b.net);

	const out: Settlement[] = [];
	let ci = 0;
	let di = 0;
	while (ci < creditors.length && di < debtors.length) {
		const c = creditors[ci];
		const d = debtors[di];
		const amount = Math.min(c.net, -d.net);
		if (amount > 0) {
			out.push({ from: d.memberId, to: c.memberId, amount });
		}
		c.net -= amount;
		d.net += amount;
		if (c.net === 0) ci++;
		if (d.net === 0) di++;
	}
	return out;
}
