import type { Expense, ExpenseSplit, Member, SplitDefault, SplitMode } from './types';

export const MAX_SPLIT_WEIGHT = 99;

export type SplitSeed = { splitMode: SplitMode; splits: ExpenseSplit[] };

export function splitWeight(member: Member): number {
	const weight = Math.round(member.splitWeight ?? 1);
	if (!Number.isFinite(weight) || weight < 1) return 1;
	return Math.min(weight, MAX_SPLIT_WEIGHT);
}

/** The split a new expense starts with, or null to keep the plain even split. It only seeds
 *  the form; the creator can still change everything before saving. */
export function defaultSplitSeed(
	mode: SplitDefault | undefined,
	members: Member[],
	expenses: Expense[],
	currentMemberId: string | null
): SplitSeed | null {
	if (mode === 'ratio') return ratioSeed(members);
	if (mode === 'last') return lastSplitSeed(members, expenses, currentMemberId);
	return null;
}

function ratioSeed(members: Member[]): SplitSeed | null {
	const weights = members.map(splitWeight);
	if (weights.every((weight) => weight === weights[0])) return null;
	return {
		splitMode: 'shares',
		splits: members.map((member, i) => ({ memberId: member.id, shares: weights[i] }))
	};
}

function lastSplitSeed(
	members: Member[],
	expenses: Expense[],
	currentMemberId: string | null
): SplitSeed | null {
	if (!currentMemberId) return null;
	let last: Expense | null = null;
	for (const expense of expenses) {
		if (expense.isSettlement || expense.createdBy !== currentMemberId) continue;
		if (!last || expense.createdAt > last.createdAt) last = expense;
	}
	// exact amounts belong to that expense's total, so they can't carry over
	if (!last || last.splitMode === 'amount') return null;

	const known = new Set(members.map((member) => member.id));
	const splits = last.splits.filter((split) => known.has(split.memberId)).map((split) => ({ ...split }));
	return splits.length > 0 ? { splitMode: last.splitMode, splits } : null;
}
