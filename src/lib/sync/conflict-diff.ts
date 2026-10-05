import { currencySymbolFor } from '$lib/currencies';
import { formatAmount } from '$lib/money';
import type { Category, Expense, PaymentMethodItem, Trip } from '$lib/types';
import type { ExpenseVersion } from './doc';

export type DiffContext = {
	memberName: (id: string) => string;
	categoryById: Map<string, Category>;
	methodById: Map<string, PaymentMethodItem>;
	tripsById: Map<string, Trip>;
	baseSymbol: string;
	baseCurrency: string;
};

export type VersionDiff = {
	id: string;
	title: string;
	byline: string;
	/** Only the fields that differ between versions, with this version's value. */
	fields: { label: string; value: string }[];
};

const money = (cents: number, currency: string) => formatAmount(cents, currencySymbolFor(currency), currency);
const list = (items: string[]) => items.join(', ');

function describeSplit(expense: Expense, ctx: DiffContext): string {
	const parts = expense.splits.map((s) => {
		const name = ctx.memberName(s.memberId);
		if (expense.splitMode === 'amount' && s.amount !== undefined) return `${name} ${money(s.amount, expense.currency)}`;
		if (expense.splitMode === 'shares' && s.shares !== undefined) return `${name} ×${s.shares}`;
		return name;
	});
	return `${expense.splitMode === 'even' ? 'Evenly' : expense.splitMode === 'shares' ? 'By shares' : 'By amount'}: ${list(parts)}`;
}

function describePayers(expense: Expense, ctx: DiffContext): string {
	if (expense.payments.length === 1) return ctx.memberName(expense.payments[0].memberId);
	return list(expense.payments.map((p) => `${ctx.memberName(p.memberId)} ${money(p.amount, expense.currency)}`));
}

function fieldsOf(expense: Expense, ctx: DiffContext): [string, string][] {
	const fields: [string, string][] = [
		['Amount', money(expense.amount, expense.currency)],
		['Title', expense.description || 'Untitled'],
		['Paid by', describePayers(expense, ctx)],
		['Split', describeSplit(expense, ctx)],
		['Date', new Date(expense.date).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })],
		['Category', (expense.categoryId && ctx.categoryById.get(expense.categoryId)?.name) || 'None'],
		['Payment method', (expense.paymentMethodId && ctx.methodById.get(expense.paymentMethodId)?.name) || 'None'],
		['Trip', (expense.tripId && ctx.tripsById.get(expense.tripId)?.name) || 'None'],
		['Charged', expense.chargedAmount !== undefined ? formatAmount(expense.chargedAmount, ctx.baseSymbol, ctx.baseCurrency) : 'Not set'],
		['Notes', expense.notes || 'None']
	];
	return fields;
}

export function describeAuthor(version: ExpenseVersion, memberName: (id: string) => string, now = Date.now()): string {
	const when = new Date(version.at);
	const sameDay = new Date(now).toDateString() === when.toDateString();
	const time = sameDay
		? when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
		: when.toLocaleDateString([], { month: 'short', day: 'numeric' });
	return version.by ? `${memberName(version.by)} · ${time}` : `Another phone · ${time}`;
}

export function diffVersions(versions: ExpenseVersion[], ctx: DiffContext): VersionDiff[] {
	const all = versions.map((v) => fieldsOf(v.expense, ctx));
	const differing = new Set<string>();
	for (let i = 0; i < all[0].length; i++) {
		if (all.some((fields) => fields[i][1] !== all[0][i][1])) differing.add(all[0][i][0]);
	}
	return versions.map((v, index) => ({
		id: v.id,
		title: v.expense.description || 'Expense',
		byline: describeAuthor(v, ctx.memberName),
		fields: all[index].filter(([label]) => differing.has(label)).map(([label, value]) => ({ label, value }))
	}));
}
