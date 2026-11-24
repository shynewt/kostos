import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
	addExpense,
	expenseVersions,
	readActivity,
	readExpenseConflicts,
	readExpenses,
	removeExpense,
	restoreExpense,
	updateExpense,
	type ExpenseVersion,
	type RoomHandle
} from './doc';
import type { Expense } from '$lib/types';

function handle(): RoomHandle {
	const doc = new Y.Doc();
	return { roomId: 'TEST', doc, project: doc.getMap('project'), members: doc.getArray('members'), expenses: doc.getArray('expenses'), activity: doc.getArray('activity'), ready: Promise.resolve(), legacy: false };
}

const multiPayerForeign: Expense = {
	id: 'hotel',
	payments: [{ memberId: 'a', amount: 30000 }, { memberId: 'b', amount: 12550 }],
	amount: 42550,
	currency: 'USD',
	exchangeRate: 0.92,
	rateFetchedAt: 1_700_000_000_000,
	chargedAmount: 39400,
	marketRate: 0.91,
	description: 'Hotel, two nights',
	categoryId: 'stay',
	paymentMethodId: 'card',
	tripId: 'weekend',
	date: 1_700_000_000_000,
	splitMode: 'shares',
	splits: [{ memberId: 'a', shares: 2 }, { memberId: 'b', shares: 1 }, { memberId: 'c', shares: 1 }],
	notes: 'Paid at check-in',
	createdAt: 1_700_000_000_000,
	createdBy: 'a'
};

const lunch: Expense = {
	id: 'lunch',
	payments: [{ memberId: 'a', amount: 4200 }],
	amount: 4200,
	currency: 'EUR',
	date: 1000,
	splitMode: 'amount',
	splits: [{ memberId: 'a', amount: 2100 }, { memberId: 'b', amount: 2100 }],
	createdAt: 1000,
	createdBy: 'a'
};

function revisions(h: RoomHandle, id: string): Map<string, ExpenseVersion> {
	return new Map(h.doc.getMap<ExpenseVersion>(`expense-revisions:${id}`));
}

function snapshot(h: RoomHandle, id: string) {
	return {
		expense: readExpenses(h).find((e) => e.id === id),
		others: readExpenses(h).filter((e) => e.id !== id),
		activity: readActivity(h),
		conflicts: readExpenseConflicts(h).map((c) => ({ id: c.id, amounts: c.versions.map((v) => v.expense) })),
		revisions: revisions(h, id)
	};
}

function deleteThenUndo(h: RoomHandle, id: string): void {
	const expense = readExpenses(h).find((e) => e.id === id)!;
	removeExpense(h, id);
	expect(readExpenses(h).some((e) => e.id === id)).toBe(false);
	restoreExpense(h, expense);
}

function expectRoundTrip(h: RoomHandle, id: string, before: ReturnType<typeof snapshot>): void {
	const after = snapshot(h, id);
	expect(after.expense).toEqual(before.expense);
	expect(after.others).toEqual(before.others);
	expect(after.activity).toEqual(before.activity);
	expect(after.conflicts).toEqual(before.conflicts);
	for (const [key, version] of before.revisions) expect(after.revisions.get(key)).toEqual(version);
}

describe('restoring a deleted expense', () => {
	it('brings back a multi-payer foreign-currency expense exactly', () => {
		const h = handle();
		addExpense(h, lunch);
		addExpense(h, multiPayerForeign);
		const before = snapshot(h, 'hotel');
		deleteThenUndo(h, 'hotel');
		expectRoundTrip(h, 'hotel', before);
		expect(readExpenseConflicts(h)).toEqual([]);
	});

	it('keeps the revision history of an edited expense without creating a conflict', () => {
		const h = handle();
		addExpense(h, multiPayerForeign);
		updateExpense(h, { ...multiPayerForeign, amount: 43000, payments: [{ memberId: 'a', amount: 30000 }, { memberId: 'b', amount: 13000 }] });
		updateExpense(h, { ...multiPayerForeign, description: 'Hotel, three nights' });
		const before = snapshot(h, 'hotel');
		deleteThenUndo(h, 'hotel');
		expectRoundTrip(h, 'hotel', before);
		expect(readExpenseConflicts(h)).toEqual([]);
		expect(expenseVersions(h, 'hotel')).toHaveLength(1);

		updateExpense(h, { ...multiPayerForeign, notes: 'Edited after undo' });
		expect(readExpenses(h)[0].notes).toBe('Edited after undo');
		expect(readExpenseConflicts(h)).toEqual([]);
	});

	it('keeps an unresolved conflict and its winning version', () => {
		const a = handle();
		addExpense(a, lunch);
		const b = handle();
		Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
		updateExpense(a, { ...lunch, amount: 5000, payments: [{ memberId: 'a', amount: 5000 }] });
		updateExpense(b, { ...lunch, amount: 6000, payments: [{ memberId: 'a', amount: 6000 }] });
		Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
		const before = snapshot(a, 'lunch');
		expect(before.conflicts).toHaveLength(1);
		deleteThenUndo(a, 'lunch');
		expectRoundTrip(a, 'lunch', before);
	});

	it('syncs the restore to another device', () => {
		const a = handle();
		addExpense(a, multiPayerForeign);
		updateExpense(a, { ...multiPayerForeign, notes: 'Updated' });
		const b = handle();
		Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
		deleteThenUndo(a, 'hotel');
		Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
		expect(readExpenses(b)).toEqual(readExpenses(a));
		expect(readExpenseConflicts(b)).toEqual([]);
	});

	it('does nothing when the expense is still there', () => {
		const h = handle();
		addExpense(h, lunch);
		const before = snapshot(h, 'lunch');
		restoreExpense(h, lunch);
		expect(h.expenses.length).toBe(1);
		expectRoundTrip(h, 'lunch', before);
	});
});
