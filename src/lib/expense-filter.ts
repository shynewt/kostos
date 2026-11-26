/* The expense list's filters, kept in the URL so coming back from an expense restores them.
 * Within one kind of filter any pick matches (Food or Taxi); across kinds all must match. */

import { expenseBaseAmount } from './currency-convert';
import type { Expense } from './types';

/** picks the "no category", "no payment method" and "no trip" options */
export const NONE = 'none';

export type ExpenseFilter = {
	categoryIds: string[];
	methodIds: string[];
	payerIds: string[];
	tripIds: string[];
	/** "YYYY-MM-DD" UTC days, both included */
	from: string | null;
	to: string | null;
	/** base currency, minor units, compared with the amount's size so incomes match too */
	minAmount: number | null;
	maxAmount: number | null;
};

export const EMPTY_FILTER: ExpenseFilter = {
	categoryIds: [],
	methodIds: [],
	payerIds: [],
	tripIds: [],
	from: null,
	to: null,
	minAmount: null,
	maxAmount: null
};

export function activeFilterCount(filter: ExpenseFilter): number {
	return [
		filter.categoryIds.length > 0,
		filter.methodIds.length > 0,
		filter.payerIds.length > 0,
		filter.tripIds.length > 0,
		filter.from !== null || filter.to !== null,
		filter.minAmount !== null || filter.maxAmount !== null
	].filter(Boolean).length;
}

export function applyFilter(expenses: Expense[], filter: ExpenseFilter, baseCurrency: string | undefined): Expense[] {
	if (activeFilterCount(filter) === 0) return expenses;
	return expenses.filter((e) => matchesFilter(e, filter, baseCurrency));
}

function matchesFilter(expense: Expense, filter: ExpenseFilter, baseCurrency: string | undefined): boolean {
	// settlements have no category or method of their own, so "none" leaves them out
	if (filter.categoryIds.length > 0 && !filter.categoryIds.includes(expense.categoryId ?? (expense.isSettlement ? '' : NONE))) {
		return false;
	}
	if (filter.methodIds.length > 0 && !filter.methodIds.includes(expense.paymentMethodId ?? (expense.isSettlement ? '' : NONE))) {
		return false;
	}
	if (filter.payerIds.length > 0 && !expense.payments.some((p) => p.amount !== 0 && filter.payerIds.includes(p.memberId))) {
		return false;
	}
	if (filter.tripIds.length > 0 && !filter.tripIds.includes(expense.tripId ?? NONE)) return false;
	const day = new Date(expense.date).toISOString().slice(0, 10);
	if (filter.from !== null && day < filter.from) return false;
	if (filter.to !== null && day > filter.to) return false;
	if (filter.minAmount !== null || filter.maxAmount !== null) {
		const size = Math.abs(expenseBaseAmount(expense, baseCurrency));
		if (filter.minAmount !== null && size < filter.minAmount) return false;
		if (filter.maxAmount !== null && size > filter.maxAmount) return false;
	}
	return true;
}

const PARAM = {
	categoryIds: 'category',
	methodIds: 'method',
	payerIds: 'payer',
	tripIds: 'trip',
	from: 'from',
	to: 'to',
	minAmount: 'min',
	maxAmount: 'max'
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function filterFromParams(params: URLSearchParams): ExpenseFilter {
	const list = (key: string) => params.get(key)?.split(',').filter(Boolean) ?? [];
	const day = (key: string) => {
		const value = params.get(key);
		return value && DAY.test(value) ? value : null;
	};
	const cents = (key: string) => {
		const value = params.get(key);
		return value !== null && /^\d+$/.test(value) ? Number(value) : null;
	};
	return {
		categoryIds: list(PARAM.categoryIds),
		methodIds: list(PARAM.methodIds),
		payerIds: list(PARAM.payerIds),
		tripIds: list(PARAM.tripIds),
		from: day(PARAM.from),
		to: day(PARAM.to),
		minAmount: cents(PARAM.minAmount),
		maxAmount: cents(PARAM.maxAmount)
	};
}

export function writeFilterParams(filter: ExpenseFilter, params: URLSearchParams): void {
	const set = (key: string, value: string | null) => (value ? params.set(key, value) : params.delete(key));
	set(PARAM.categoryIds, filter.categoryIds.join(','));
	set(PARAM.methodIds, filter.methodIds.join(','));
	set(PARAM.payerIds, filter.payerIds.join(','));
	set(PARAM.tripIds, filter.tripIds.join(','));
	set(PARAM.from, filter.from);
	set(PARAM.to, filter.to);
	set(PARAM.minAmount, filter.minAmount === null ? null : String(filter.minAmount));
	set(PARAM.maxAmount, filter.maxAmount === null ? null : String(filter.maxAmount));
}
