/* Number crunching for the stats screen. Every function is pure, so the screen stays a thin
 * view over it.
 *
 * Calendar maths runs in UTC on purpose: the expense form stores a picked day as that day's
 * UTC midnight and shows a saved expense's day in UTC, so an expense dated 1 October must
 * land in October here too, whatever the device's time zone. */

import { expenseShares } from './balance';
import { exchangeFee, expenseInBase } from './currency-convert';
import type { Expense } from './types';

const DAY_MS = 86_400_000;

export type Period =
	| { kind: 'all' }
	| { kind: 'year'; year: number }
	| { kind: 'month'; year: number; month: number };

export const ALL_TIME: Period = { kind: 'all' };

export function monthOf(timestamp: number): Period {
	const date = new Date(timestamp);
	return { kind: 'month', year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function previousMonthOf(timestamp: number): Period {
	const date = new Date(timestamp);
	return monthOf(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

export function yearOf(timestamp: number): Period {
	return { kind: 'year', year: new Date(timestamp).getUTCFullYear() };
}

/** Start inclusive, end exclusive; null for all time. */
export function periodBounds(period: Period): { start: number; end: number } | null {
	if (period.kind === 'all') return null;
	if (period.kind === 'year') {
		return { start: Date.UTC(period.year, 0, 1), end: Date.UTC(period.year + 1, 0, 1) };
	}
	return {
		start: Date.UTC(period.year, period.month, 1),
		end: Date.UTC(period.year, period.month + 1, 1)
	};
}

/** A stable text form for URLs and file names: "all", "2026" or "2026-10". */
export function periodKey(period: Period): string {
	if (period.kind === 'all') return 'all';
	if (period.kind === 'year') return String(period.year);
	return `${period.year}-${String(period.month + 1).padStart(2, '0')}`;
}

export function parsePeriodKey(key: string | null): Period {
	const match = key?.match(/^(\d{4})(?:-(\d{2}))?$/);
	if (!match) return ALL_TIME;
	const year = Number(match[1]);
	if (match[2] === undefined) return { kind: 'year', year };
	const month = Number(match[2]) - 1;
	return month >= 0 && month < 12 ? { kind: 'month', year, month } : ALL_TIME;
}

export function isSamePeriod(a: Period, b: Period): boolean {
	return periodKey(a) === periodKey(b);
}

export function periodLabel(period: Period, locale?: string): string {
	if (period.kind === 'all') return 'All time';
	if (period.kind === 'year') return String(period.year);
	return new Date(Date.UTC(period.year, period.month, 1)).toLocaleDateString(locale, {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

export function inPeriod(expenses: Expense[], period: Period): Expense[] {
	const bounds = periodBounds(period);
	if (!bounds) return expenses;
	return expenses.filter((e) => e.date >= bounds.start && e.date < bounds.end);
}

/** Newest first. */
export function monthsWithExpenses(expenses: Expense[]): Period[] {
	const keys = new Set<string>();
	const months: Period[] = [];
	for (const e of expenses.toSorted((a, b) => b.date - a.date)) {
		const month = monthOf(e.date);
		const key = periodKey(month);
		if (keys.has(key)) continue;
		keys.add(key);
		months.push(month);
	}
	return months;
}

export type Viewpoint = { kind: 'group' } | { kind: 'member'; memberId: string };

/** One expense as the stats count it: `amount` is the whole bill for the group, or one
 *  member's share of it, in the base currency. */
export type SpendLine = { expense: Expense; base: Expense; amount: number };

/** Settlements move money between members rather than spend it, so they never count. A
 *  member's view leaves out expenses they had no share in. */
export function spendLines(
	expenses: Expense[],
	baseCurrency: string | undefined,
	viewpoint: Viewpoint
): SpendLine[] {
	const lines: SpendLine[] = [];
	for (const expense of expenses) {
		if (expense.isSettlement) continue;
		const base = expenseInBase(expense, baseCurrency);
		const amount =
			viewpoint.kind === 'group' ? base.amount : (expenseShares(base).get(viewpoint.memberId) ?? 0);
		if (viewpoint.kind === 'member' && amount === 0) continue;
		lines.push({ expense, base, amount });
	}
	return lines;
}

export type SpendSummary = {
	total: number;
	count: number;
	firstDate: number;
	lastDate: number;
	/** calendar days from the first expense to the last, both included */
	days: number;
};

export function summarize(lines: SpendLine[]): SpendSummary | null {
	if (lines.length === 0) return null;
	let total = 0;
	let firstDate = Infinity;
	let lastDate = -Infinity;
	for (const line of lines) {
		total += line.amount;
		firstDate = Math.min(firstDate, line.expense.date);
		lastDate = Math.max(lastDate, line.expense.date);
	}
	const days = (utcDayStart(lastDate) - utcDayStart(firstDate)) / DAY_MS + 1;
	return { total, count: lines.length, firstDate, lastDate, days };
}

export type BucketSize = 'day' | 'week' | 'month';
export type SpendBucket = { start: number; total: number };
export type SpendSeries = { size: BucketSize; buckets: SpendBucket[] };

export const DAY_BUCKETS_UP_TO_DAYS = 31;
export const WEEK_BUCKETS_UP_TO_DAYS = 122;

export function bucketSizeFor(days: number): BucketSize {
	if (days <= DAY_BUCKETS_UP_TO_DAYS) return 'day';
	if (days <= WEEK_BUCKETS_UP_TO_DAYS) return 'week';
	return 'month';
}

/** Buckets run from the first expense to the last, so a quiet stretch before or after the
 *  spending never stretches the chart. Gaps in between stay as empty buckets. */
export function spendOverTime(lines: SpendLine[]): SpendSeries {
	const summary = summarize(lines);
	if (!summary) return { size: 'day', buckets: [] };
	const size = bucketSizeFor(summary.days);
	const bucketStart = BUCKET_START[size];

	const buckets: SpendBucket[] = [];
	const indexByStart = new Map<number, number>();
	const last = bucketStart(summary.lastDate);
	for (let start = bucketStart(summary.firstDate); start <= last; start = nextBucket(start, size)) {
		indexByStart.set(start, buckets.length);
		buckets.push({ start, total: 0 });
	}
	for (const line of lines) {
		const index = indexByStart.get(bucketStart(line.expense.date));
		if (index !== undefined) buckets[index].total += line.amount;
	}
	return { size, buckets };
}

function utcDayStart(timestamp: number): number {
	return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

function utcWeekStart(timestamp: number): number {
	const day = utcDayStart(timestamp);
	const daysSinceMonday = (new Date(day).getUTCDay() + 6) % 7;
	return day - daysSinceMonday * DAY_MS;
}

function utcMonthStart(timestamp: number): number {
	const date = new Date(timestamp);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

const BUCKET_START: Record<BucketSize, (timestamp: number) => number> = {
	day: utcDayStart,
	week: utcWeekStart,
	month: utcMonthStart
};

function nextBucket(start: number, size: BucketSize): number {
	if (size === 'day') return start + DAY_MS;
	if (size === 'week') return start + 7 * DAY_MS;
	const date = new Date(start);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export type SpendShare = { id: string | null; amount: number; percent: number };

/** Largest first. `id` is null for lines with no value for the key. */
function rollUp(lines: SpendLine[], keyOf: (expense: Expense) => string | undefined): SpendShare[] {
	const totals = new Map<string | null, number>();
	let total = 0;
	for (const line of lines) {
		const id = keyOf(line.expense) ?? null;
		totals.set(id, (totals.get(id) ?? 0) + line.amount);
		total += line.amount;
	}
	return [...totals.entries()]
		.map(([id, amount]) => ({ id, amount, percent: total > 0 ? Math.round((amount / total) * 100) : 0 }))
		.sort((a, b) => b.amount - a.amount);
}

export function spendByCategory(lines: SpendLine[]): SpendShare[] {
	return rollUp(lines, (e) => e.categoryId);
}

export function spendByPaymentMethod(lines: SpendLine[]): SpendShare[] {
	return rollUp(lines, (e) => e.paymentMethodId);
}

export type PersonTotals = {
	memberId: string;
	/** their share of the expenses */
	cost: number;
	paid: number;
	/** paid minus cost: positive when they put in more than their share */
	difference: number;
};

/** Each member's share, what they paid, and the gap between the two. Across members the
 *  differences sum to zero, because every expense's shares and payments both add up to its
 *  base total. Members untouched by these expenses are left out. Most ahead first. */
export function perPerson(expenses: Expense[], baseCurrency: string | undefined): PersonTotals[] {
	const byMember = new Map<string, PersonTotals>();
	const totalsFor = (memberId: string) => {
		let totals = byMember.get(memberId);
		if (!totals) {
			totals = { memberId, cost: 0, paid: 0, difference: 0 };
			byMember.set(memberId, totals);
		}
		return totals;
	};
	for (const { base } of spendLines(expenses, baseCurrency, { kind: 'group' })) {
		for (const payment of base.payments) totalsFor(payment.memberId).paid += payment.amount;
		for (const [memberId, cents] of expenseShares(base)) totalsFor(memberId).cost += cents;
	}
	return [...byMember.values()]
		.filter((totals) => totals.cost !== 0 || totals.paid !== 0)
		.map((totals) => ({ ...totals, difference: totals.paid - totals.cost }))
		.sort((a, b) => b.difference - a.difference || b.cost - a.cost);
}

/** Income lines are negative, so they're left out rather than listed as the smallest expenses. */
export function biggestExpenses(lines: SpendLine[], limit = 5): SpendLine[] {
	return lines
		.filter((line) => line.amount > 0)
		.toSorted((a, b) => b.amount - a.amount)
		.slice(0, limit);
}

export type FeeSummary = { fee: number; atMarket: number; count: number; percent: number };

/** What paying in foreign currency cost over the market rate. A member's view takes their
 *  share of each fee. Expenses saved before market rates were stored can't say, so they're
 *  left out rather than counted as free. */
export function exchangeFees(lines: SpendLine[], baseCurrency: string | undefined): FeeSummary | null {
	let fee = 0;
	let atMarket = 0;
	let count = 0;
	for (const line of lines) {
		const expenseFee = exchangeFee(line.expense, baseCurrency);
		if (!expenseFee || line.base.amount === 0) continue;
		const portion = line.amount / line.base.amount;
		fee += Math.round(expenseFee.fee * portion);
		atMarket += Math.round(expenseFee.atMarket * portion);
		count++;
	}
	if (count === 0 || atMarket === 0) return null;
	return { fee, atMarket, count, percent: (fee / atMarket) * 100 };
}
