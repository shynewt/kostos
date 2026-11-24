/* Turns a parsed Splitwise export into Kostos members and expenses.
 *
 * A Splitwise row only says how much each member's balance moved, not who paid or what each
 * person's share was. Members whose balance went up are taken as the payers and members
 * whose balance went down as the people it was split for. The payers paid the full cost
 * between them, and whatever the cost exceeds the money owed to them is their own share.
 * Every expense therefore moves each member by exactly the row's amount, so the group's
 * balances in each currency come out equal to the file's. */

import { pickMemberColor, pickMemberEmoji } from '$lib/avatar';
import { scaleToTotal, convertCents } from '$lib/currency-convert';
import { splitEvenly } from '$lib/balance';
import { generateId } from '$lib/sync/doc';
import type { Expense, ExpenseSplit, Member, Payment } from '$lib/types';
import type { SplitwiseFile, SplitwiseRow } from './splitwise';

export type SplitwiseConversion = {
	members: Member[];
	expenses: Expense[];
	/** rows that moved nobody's balance; with no payer or share to go on they're left out */
	skippedRows: SplitwiseRow[];
	/** rows whose cost was below what the payers were owed, so the amount owed is used */
	adjustedRows: SplitwiseRow[];
};

export type ConversionOptions = {
	baseCurrency: string;
	/** base-currency units per 1 unit of each other currency in the file */
	rates: Record<string, number>;
	now?: number;
};

const CATEGORY_IDS: Record<string, string> = {
	groceries: 'cat-groceries',
	'dining out': 'cat-restaurants',
	liquor: 'cat-restaurants',
	'food and drink': 'cat-restaurants',
	transportation: 'cat-transport',
	'bus/train': 'cat-transport',
	car: 'cat-transport',
	'gas/fuel': 'cat-transport',
	parking: 'cat-transport',
	plane: 'cat-transport',
	taxi: 'cat-transport',
	bicycle: 'cat-transport',
	hotel: 'cat-lodging',
	entertainment: 'cat-activities',
	games: 'cat-activities',
	movies: 'cat-activities',
	music: 'cat-activities',
	sports: 'cat-activities'
};

export function splitwiseCategoryId(category: string): string | undefined {
	const key = category.trim().toLowerCase();
	return Object.hasOwn(CATEGORY_IDS, key) ? CATEGORY_IDS[key] : undefined;
}

/** The currency most rows use, which makes the fewest expenses need a rate. */
export function mostUsedCurrency(file: SplitwiseFile): string {
	const counts = new Map<string, number>();
	for (const row of file.rows) counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
	return [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

export function buildMembers(names: string[], now = Date.now()): Member[] {
	const members: Member[] = [];
	for (const name of names) {
		members.push({ id: generateId(), name, color: pickMemberColor(members), emoji: pickMemberEmoji(members), createdAt: now });
	}
	return members;
}

export function convertSplitwise(file: SplitwiseFile, members: Member[], options: ConversionOptions): SplitwiseConversion {
	const now = options.now ?? Date.now();
	const expenses: Expense[] = [];
	const skippedRows: SplitwiseRow[] = [];
	const adjustedRows: SplitwiseRow[] = [];

	for (const row of file.rows) {
		const credited = row.nets.flatMap((net, index) => (net > 0 ? [{ memberId: members[index].id, amount: net }] : []));
		const debited = row.nets.flatMap((net, index) => (net < 0 ? [{ memberId: members[index].id, amount: -net }] : []));
		if (credited.length === 0) {
			skippedRows.push(row);
			continue;
		}
		const base = {
			currency: row.currency,
			date: row.date,
			createdAt: now,
			createdBy: credited[0].memberId,
			...rateFields(row, options)
		};
		if (row.isPayment) {
			for (const transfer of pairTransfers(credited, debited)) {
				expenses.push({
					...base,
					id: generateId(),
					amount: transfer.amount,
					...rateFieldsFor(transfer.amount, row.currency, options),
					payments: [{ memberId: transfer.from, amount: transfer.amount }],
					splits: [{ memberId: transfer.to }],
					splitMode: 'even',
					description: row.description || undefined,
					isSettlement: true
				});
			}
			continue;
		}

		const owedToPayers = credited.reduce((total, entry) => total + entry.amount, 0);
		if (row.cost < owedToPayers) adjustedRows.push(row);
		const amount = Math.max(row.cost, owedToPayers);
		const payerShares = scaleToTotal(credited.map((entry) => entry.amount), amount - owedToPayers);
		const payments: Payment[] = credited.map((entry, index) => ({ memberId: entry.memberId, amount: entry.amount + payerShares[index] }));
		const owed = [
			...credited.map((entry, index) => ({ memberId: entry.memberId, amount: payerShares[index] })),
			...debited
		].filter((entry) => entry.amount > 0);

		expenses.push({
			...base,
			id: generateId(),
			amount,
			...rateFieldsFor(amount, row.currency, options),
			payments,
			...splitFor(owed, amount),
			description: row.description || undefined,
			categoryId: splitwiseCategoryId(row.category)
		});
	}

	return { members, expenses, skippedRows, adjustedRows };
}

/** An even split when the shares are what Kostos would compute for an even split anyway,
 *  so the expense stays easy to edit; exact amounts otherwise. */
function splitFor(owed: { memberId: string; amount: number }[], amount: number): { splitMode: 'even' | 'amount'; splits: ExpenseSplit[] } {
	const largestFirst = owed.toSorted((a, b) => b.amount - a.amount);
	const evenShares = splitEvenly(amount, largestFirst.length);
	if (largestFirst.every((entry, index) => entry.amount === evenShares[index])) {
		return { splitMode: 'even', splits: largestFirst.map(({ memberId }) => ({ memberId })) };
	}
	return { splitMode: 'amount', splits: owed.map(({ memberId, amount: share }) => ({ memberId, amount: share })) };
}

/** Greedy pairing; a Splitwise payment is one person paying one other, so this is almost always a single transfer. */
function pairTransfers(credited: Payment[], debited: Payment[]): { from: string; to: string; amount: number }[] {
	const payers = credited.map((entry) => ({ ...entry }));
	const receivers = debited.map((entry) => ({ ...entry }));
	const transfers: { from: string; to: string; amount: number }[] = [];
	let payerIndex = 0;
	let receiverIndex = 0;
	while (payerIndex < payers.length && receiverIndex < receivers.length) {
		const amount = Math.min(payers[payerIndex].amount, receivers[receiverIndex].amount);
		transfers.push({ from: payers[payerIndex].memberId, to: receivers[receiverIndex].memberId, amount });
		payers[payerIndex].amount -= amount;
		receivers[receiverIndex].amount -= amount;
		if (payers[payerIndex].amount === 0) payerIndex++;
		if (receivers[receiverIndex].amount === 0) receiverIndex++;
	}
	return transfers;
}

function rateFields(row: SplitwiseRow, options: ConversionOptions): Pick<Expense, 'exchangeRate' | 'marketRate'> {
	if (row.currency === options.baseCurrency) return {};
	const rate = options.rates[row.currency];
	if (!(rate > 0)) throw new Error(`No exchange rate for ${row.currency}`);
	return { exchangeRate: rate, marketRate: rate };
}

function rateFieldsFor(amount: number, currency: string, options: ConversionOptions): Pick<Expense, 'chargedAmount'> {
	if (currency === options.baseCurrency) return {};
	return { chargedAmount: convertCents(amount, currency, options.baseCurrency, options.rates[currency]) };
}
