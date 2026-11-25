/* Balance + settlement engine.
 *
 * All amounts are in minor units (cents) so the math is integer-exact. Finding the fewest
 * payments is NP-hard in general (it reduces to subset-sum), but a group of friends is small
 * enough to search exhaustively, so the planner is exact up to EXACT_SEARCH_LIMIT people
 * with an open balance and falls back to largest-creditor / largest-debtor pairing beyond.
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
		// an income's parts are negative like its total; a part against the total's sign counts as 0
		const sign = expense.amount < 0 ? -1 : 1;
		let assigned = 0;
		for (const s of expense.splits) {
			const amt = sign * Math.max(0, sign * Math.trunc(s.amount ?? 0));
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

/** Past this many people with an open balance, trying every grouping (2^n of them) is too
 *  slow to rerun on a phone each time a balance changes. */
const EXACT_SEARCH_LIMIT = 16;

/** Who pays whom to bring everyone to zero, in as few payments as possible.
 *
 *  People who cancel out among themselves can settle without anyone else, and a group of k
 *  such people needs k - 1 payments. So the fewest payments overall come from splitting the
 *  members into as many of those groups as possible. Pairs that cancel exactly are taken
 *  first, which is always part of some best split; the rest is searched exhaustively up to
 *  EXACT_SEARCH_LIMIT people and settled as one group beyond that.
 *
 *  Every device has to show the same plan, so ties always go to the earlier member. */
export function planSettlements(balances: MemberBalance[]): Settlement[] {
	const open = balances.filter((b) => b.net !== 0);
	const { pairs, unpaired } = takeExactPairs(open);
	const groups = unpaired.length <= EXACT_SEARCH_LIMIT ? cancellingGroups(unpaired) : [unpaired];
	return [...pairs, ...groups]
		.flatMap(settleGroup)
		.sort((a, b) => b.amount - a.amount);
}

function takeExactPairs(open: MemberBalance[]): { pairs: MemberBalance[][]; unpaired: MemberBalance[] } {
	const pairs: MemberBalance[][] = [];
	const taken = new Set<MemberBalance>();
	for (const debtor of open) {
		if (debtor.net > 0) continue;
		const creditor = open.find((b) => b.net === -debtor.net && !taken.has(b));
		if (!creditor) continue;
		taken.add(debtor).add(creditor);
		pairs.push([debtor, creditor]);
	}
	return { pairs, unpaired: open.filter((b) => !taken.has(b)) };
}

/** Splits the members into the most groups whose balances each sum to zero.
 *
 *  Each subset of members is a bitmask. `groupsIn[mask]` is the most cancelling groups a
 *  chain of subsets can pass through on its way up to `mask`, adding one member at a time:
 *  the best of the subsets one member smaller, plus one if `mask` itself sums to zero.
 *  Walking that chain back down, the members removed between two zero sums are one group. */
function cancellingGroups(members: MemberBalance[]): MemberBalance[][] {
	const count = members.length;
	if (count === 0) return [];
	const subsets = 1 << count;
	const sums = new Float64Array(subsets);
	const groupsIn = new Uint8Array(subsets);
	for (let mask = 1; mask < subsets; mask++) {
		const lowest = 31 - Math.clz32(mask & -mask);
		sums[mask] = sums[mask & (mask - 1)] + members[lowest].net;
		let best = 0;
		for (let i = 0; i < count; i++) {
			if (mask & (1 << i)) best = Math.max(best, groupsIn[mask ^ (1 << i)]);
		}
		groupsIn[mask] = best + (sums[mask] === 0 ? 1 : 0);
	}

	const groups: MemberBalance[][] = [];
	let group: MemberBalance[] = [];
	let mask = subsets - 1;
	while (mask !== 0) {
		const wanted = groupsIn[mask] - (sums[mask] === 0 ? 1 : 0);
		let next = 0;
		while (!(mask & (1 << next)) || groupsIn[mask ^ (1 << next)] !== wanted) next++;
		group.push(members[next]);
		mask ^= 1 << next;
		if (sums[mask] === 0) {
			groups.push(group);
			group = [];
		}
	}
	return groups;
}

/** Largest creditor against largest debtor, down both lists. Each payment clears at least
 *  one person and the last clears two, so k people take at most k - 1 payments. */
function settleGroup(group: MemberBalance[]): Settlement[] {
	const creditors = group
		.filter((b) => b.net > 0)
		.map((b) => ({ ...b }))
		.sort((a, b) => b.net - a.net);
	const debtors = group
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
