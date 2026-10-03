/* v1 → v2 import mapping.
 *
 * v1 (the old SQLite-backed app) exports a single JSON file per project. This
 * module turns that JSON into v2 domain types (Project, Member[], Expense[])
 * ready to be pushed into a fresh Y.Doc.
 *
 * Notable shape gaps we handle:
 *  - v1 amounts are in major units (JPY 113400, EUR 13.50); v2 stores integer
 *    minor units. Conversion is currency-aware (zero-decimal currencies stay 1:1).
 *  - v1 category names embed a leading emoji ("🍽️ Menjar"); we split them.
 *  - v1 has a single `paidById`; v2 has a `payments[]` array (we wrap it).
 *  - v1 includes a synthetic "All" pseudo-member that we drop.
 *  - v1 stores per-member precomputed `owedAmount` (with sub-cent floats on even
 *    splits); for "amount" mode we use those values directly, for "even" mode
 *    we keep the participant list and let v2 recompute the cents (±1 cent drift
 *    is possible vs v1 but the totals match).
 */

import { currencyDecimals, currencySymbolFor } from '$lib/currencies';
import { generateId } from '$lib/sync/doc';
import {
	type Category,
	type Expense,
	type ExpenseSplit,
	type Member,
	type PaymentMethodItem,
	type Payment,
	type Project,
	type SplitMode
} from '$lib/types';

export type V1PaidFor = {
	memberId: string;
	amount: number | null;
	shares: number | null;
	percent: number | null;
	owedAmount: number | null;
};

export type V1Expense = {
	id: string;
	expenseDate: string;
	title: string;
	categoryId: string | null;
	paymentMethodId: string | null;
	amount: number;
	paidById: string;
	splitType: string;
	paidFor: V1PaidFor[];
};

export type V1Participant = { id: string; name: string; createdAt: string };
export type V1Category = { id: string; name: string; color: string; createdAt: string };
export type V1PaymentMethod = { id: string; name: string; icon: string; createdAt: string };

export type V1Export = {
	id: string;
	name: string;
	currency: string;
	participants: V1Participant[];
	categories: V1Category[];
	paymentMethods: V1PaymentMethod[];
	expenses: V1Expense[];
};

export type ImportResult = {
	project: Project;
	members: Member[];
	expenses: Expense[];
	warnings: string[];
	stats: {
		expenseCount: number;
		memberCount: number;
		droppedMemberCount: number;
		totalCents: number;
		dateRange: { from: number; to: number } | null;
	};
};

/** Names of v1 pseudo-members that should be excluded from the migration. */
const PSEUDO_MEMBER_NAMES = new Set(['All', 'all', 'Tothom', 'tothom', 'Everyone', 'everyone']);

/** Regex catches an emoji at the start of a string (incl. compound/skin-tone runs). */
const LEADING_EMOJI = /^([\p{Extended_Pictographic}‍️]+)\s*(.*)$/u;

export function isV1Export(value: unknown): value is V1Export {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === 'string' &&
		typeof v.name === 'string' &&
		typeof v.currency === 'string' &&
		Array.isArray(v.participants) &&
		Array.isArray(v.categories) &&
		Array.isArray(v.paymentMethods) &&
		Array.isArray(v.expenses)
	);
}

export { splitEmojiName as splitEmojiNameForTests };

function splitEmojiName(raw: string): { emoji: string; name: string } {
	const trimmed = raw.trim();
	const match = trimmed.match(LEADING_EMOJI);
	if (match && match[1] && match[2]) {
		return { emoji: match[1], name: match[2].trim() };
	}
	return { emoji: '🏷️', name: trimmed || 'Untitled' };
}

function toCents(amount: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(amount * factor);
}

function isoToMs(iso: string | null | undefined): number {
	if (!iso) return Date.now();
	const ms = Date.parse(iso);
	return Number.isFinite(ms) ? ms : Date.now();
}

/** Map a v1 splitType string to a v2 SplitMode, falling back to 'even'. */
function mapSplitMode(splitType: string): SplitMode {
	const s = (splitType || '').toLowerCase();
	if (s === 'amount') return 'amount';
	if (s === 'shares' || s === 'share' || s === 'percent') return 'shares';
	return 'even';
}

export function mapV1ToV2(v1: V1Export): ImportResult {
	const warnings: string[] = [];
	const decimals = currencyDecimals(v1.currency);

	// Members: filter out pseudo "All" rows by name and remember their ids so
	// we can ignore their entries in paidFor too.
	const droppedMemberIds = new Set<string>();
	const members: Member[] = v1.participants
		.filter((p) => {
			if (PSEUDO_MEMBER_NAMES.has(p.name)) {
				droppedMemberIds.add(p.id);
				return false;
			}
			return true;
		})
		.map((p) => ({
			id: p.id,
			name: p.name,
			createdAt: isoToMs(p.createdAt)
		}));

	if (members.length === 0) {
		warnings.push('No real members found; project would be empty.');
	}

	const categories: Category[] = v1.categories.map((c) => {
		const { emoji, name } = splitEmojiName(c.name);
		return { id: c.id, name, emoji };
	});

	const paymentMethods: PaymentMethodItem[] = v1.paymentMethods.map((m) => ({
		id: m.id,
		name: m.name,
		emoji: m.icon || '💳'
	}));

	const validMemberIds = new Set(members.map((m) => m.id));
	const validCategoryIds = new Set(categories.map((c) => c.id));
	const validMethodIds = new Set(paymentMethods.map((m) => m.id));

	let totalCents = 0;
	let dateMin: number | null = null;
	let dateMax: number | null = null;

	const expenses: Expense[] = [];
	for (const e of v1.expenses) {
		const amountCents = toCents(e.amount, decimals);
		if (!Number.isFinite(amountCents) || amountCents <= 0) {
			warnings.push(`Skipped expense "${e.title}" — non-positive amount.`);
			continue;
		}

		const splitMode = mapSplitMode(e.splitType);

		// paidFor entries minus dropped pseudo-members and zero-share rows
		const realPaidFor = e.paidFor.filter(
			(pf) => !droppedMemberIds.has(pf.memberId) && validMemberIds.has(pf.memberId)
		);
		const participants = realPaidFor.filter((pf) => (pf.owedAmount ?? 0) > 0);

		if (participants.length === 0) {
			warnings.push(`Skipped expense "${e.title}" — no real participants.`);
			continue;
		}

		const splits: ExpenseSplit[] = participants.map((pf) => {
			if (splitMode === 'amount') {
				return {
					memberId: pf.memberId,
					amount: toCents(pf.owedAmount ?? 0, decimals)
				};
			}
			if (splitMode === 'shares') {
				return {
					memberId: pf.memberId,
					shares: pf.shares ?? pf.percent ?? 1
				};
			}
			return { memberId: pf.memberId };
		});

		// v1 has a single payer; wrap as a one-row payments array.
		const payerId = validMemberIds.has(e.paidById) ? e.paidById : participants[0].memberId;
		const payments: Payment[] = [{ memberId: payerId, amount: amountCents }];

		const categoryId =
			e.categoryId && validCategoryIds.has(e.categoryId) ? e.categoryId : undefined;
		const paymentMethodId =
			e.paymentMethodId && validMethodIds.has(e.paymentMethodId) ? e.paymentMethodId : undefined;

		const date = isoToMs(e.expenseDate);
		if (dateMin === null || date < dateMin) dateMin = date;
		if (dateMax === null || date > dateMax) dateMax = date;
		totalCents += amountCents;

		expenses.push({
			id: e.id || generateId(),
			payments,
			amount: amountCents,
			currency: v1.currency,
			description: e.title || undefined,
			categoryId,
			paymentMethodId,
			date,
			splitMode,
			splits,
			createdAt: date,
			createdBy: payerId
		});
	}

	const project: Project = {
		id: v1.id,
		name: v1.name,
		emoji: '🏖',
		color: 'lime',
		currency: v1.currency,
		currencySymbol: currencySymbolFor(v1.currency.toUpperCase()),
		defaultSplit: 'even',
		categories,
		paymentMethods,
		trips: [],
		createdAt: dateMin ?? Date.now()
	};

	return {
		project,
		members,
		expenses,
		warnings,
		stats: {
			expenseCount: expenses.length,
			memberCount: members.length,
			droppedMemberCount: droppedMemberIds.size,
			totalCents,
			dateRange: dateMin !== null && dateMax !== null ? { from: dateMin, to: dateMax } : null
		}
	};
}
