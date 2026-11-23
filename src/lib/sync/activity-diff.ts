/* Pure structural diff for expense edits, feeding the activity log.
 *
 * Returns raw before/after values only; the renderer formats currency, dates, and
 * member names so events stay locale-agnostic. No Yjs or browser dependencies, so
 * it is unit-testable in isolation.
 */

import type { ActivityChange, Expense, ExpenseSplit, Payment } from '$lib/types';

function serializePayments(payments: Payment[]): string {
	return payments
		.toSorted((a, b) => a.memberId.localeCompare(b.memberId))
		.map((p) => `${p.memberId}:${p.amount}`)
		.join(',');
}

function serializeSplits(splits: ExpenseSplit[]): string {
	return splits
		.toSorted((a, b) => a.memberId.localeCompare(b.memberId))
		.map((s) => `${s.memberId}:${s.shares ?? ''}:${s.amount ?? ''}`)
		.join(',');
}

function memberSet(ids: string[]): string {
	return [...new Set(ids)].sort().join(',');
}

// compare by calendar day: the form is date-granular and round-trips the stored
// timestamp through a YYYY-MM-DD string, so a time-of-day delta is not a real edit
function dayKey(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function diffExpense(prev: Expense, next: Expense): ActivityChange[] {
	const changes: ActivityChange[] = [];

	// the form rebuilds payments + split values from the total on every save, so a
	// payer amount or a split value moving usually just tracks a changed total.
	// only treat those as edits when the total itself held steady.
	const totalChanged = prev.amount !== next.amount || prev.currency !== next.currency;

	if (totalChanged) {
		changes.push({
			kind: 'amount',
			from: prev.amount,
			to: next.amount,
			fromCurrency: prev.currency,
			toCurrency: next.currency
		});
	}
	if ((prev.description ?? '') !== (next.description ?? '')) {
		changes.push({ kind: 'text', from: prev.description ?? '', to: next.description ?? '' });
	}

	const prevPayers = memberSet(prev.payments.map((p) => p.memberId));
	const nextPayers = memberSet(next.payments.map((p) => p.memberId));
	if (prevPayers !== nextPayers) {
		changes.push({
			kind: 'paidBy',
			from: [...new Set(prev.payments.map((p) => p.memberId))].sort(),
			to: [...new Set(next.payments.map((p) => p.memberId))].sort()
		});
	} else if (!totalChanged && serializePayments(prev.payments) !== serializePayments(next.payments)) {
		changes.push({ kind: 'paidBy' });
	}

	if (dayKey(prev.date) !== dayKey(next.date)) {
		changes.push({ kind: 'date', from: prev.date, to: next.date });
	}

	if (prev.splitMode !== next.splitMode) {
		changes.push({ kind: 'split', from: prev.splitMode, to: next.splitMode });
	} else if (memberSet(prev.splits.map((s) => s.memberId)) !== memberSet(next.splits.map((s) => s.memberId))) {
		changes.push({ kind: 'split' });
	} else if (!totalChanged && serializeSplits(prev.splits) !== serializeSplits(next.splits)) {
		changes.push({ kind: 'split' });
	}

	return changes;
}
