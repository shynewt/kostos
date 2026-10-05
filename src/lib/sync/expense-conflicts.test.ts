import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addExpense, updateExpense, removeExpense, readExpenses, readExpenseConflicts, expenseVersions, resolveExpenseConflict, assignExpensesToTrip, type RoomHandle } from './doc';
import type { Expense } from '$lib/types';

function handle(doc = new Y.Doc()): RoomHandle {
	return { roomId: 'TEST', doc, project: doc.getMap('project'), members: doc.getArray('members'), expenses: doc.getArray('expenses'), activity: doc.getArray('activity'), ready: Promise.resolve() };
}
const expense = (amount = 1000): Expense => ({ id: 'dinner', amount, payments: [{ memberId: 'a', amount }], currency: 'EUR', date: 0, createdAt: 0, createdBy: 'a', splitMode: 'even', splits: [{ memberId: 'a' }, { memberId: 'b' }] });
function devices() {
	const a = handle(); addExpense(a, expense());
	const b = handle(); Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
	return { a, b };
}
function merge(a: RoomHandle, b: RoomHandle) {
	Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
	Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
}

describe('expense identity and financial conflicts', () => {
	it('keeps simultaneous offline edits as reviewable versions, counted once', () => {
		const { a, b } = devices();
		updateExpense(a, expense(1200)); updateExpense(b, expense(1500));
		merge(a, b);
		expect(readExpenses(a)).toEqual(readExpenses(b));
		expect(a.expenses.length).toBe(1);
		expect(readExpenses(a)).toHaveLength(1);
		expect(readExpenseConflicts(a)[0].versions.map((v) => v.expense.amount).sort()).toEqual([1200, 1500]);
		const chosen = expenseVersions(a, 'dinner').find((v) => v.expense.amount === 1200)!;
		resolveExpenseConflict(a, 'dinner', chosen.id); merge(a, b);
		expect(readExpenses(a)[0].amount).toBe(1200);
		expect(readExpenseConflicts(a)).toEqual([]);
		expect(readExpenseConflicts(b)).toEqual([]);
		expect(a.doc.getMap('expense-revisions:dinner').size).toBe(4);
	});
	it('keeps amount, currency, payments and splits together as one revision', () => {
		const { a, b } = devices();
		const foreign = { ...expense(2300), currency: 'USD', exchangeRate: .9, splits: [{ memberId: 'b' }] };
		updateExpense(a, foreign); updateExpense(b, expense(1800)); merge(a, b);
		expect([foreign, expense(1800)]).toContainEqual(readExpenses(a)[0]);
	});
	it('detects a stale form saved after a remote edit without losing the remote version', () => {
		const { a, b } = devices();
		const parents = expenseVersions(a, 'dinner').map((v) => v.id);
		updateExpense(b, expense(1500)); merge(a, b);
		updateExpense(a, expense(1200), parents); merge(a, b);
		expect(readExpenseConflicts(a)[0].versions).toHaveLength(2);
	});
	it('does not turn sequential edits or trip assignment into conflicts', () => {
		const { a, b } = devices();
		updateExpense(a, expense(1200)); merge(a, b);
		updateExpense(b, expense(1500)); merge(a, b);
		assignExpensesToTrip(a, ['dinner'], 'holiday'); merge(a, b);
		expect(readExpenses(a)[0]).toMatchObject({ amount: 1500, tripId: 'holiday' });
		expect(readExpenseConflicts(a)).toEqual([]);
	});
	it('deletion wins over a concurrent edit without resurrecting an expense', () => {
		const { a, b } = devices();
		removeExpense(a, 'dinner'); updateExpense(b, expense(1200)); merge(a, b);
		expect(readExpenses(a)).toEqual([]);
		expect(readExpenses(b)).toEqual([]);
	});
	it('detects legacy duplicate ids, keeps their values and counts the expense once', () => {
		const { a, b } = devices();
		// The old implementation replaced the array element on each offline device.
		for (const [h, amount] of [[a, 1200], [b, 1500]] as const) {
			const replacement = new Y.Map();
			for (const [key, value] of h.expenses.get(0)) replacement.set(key, value instanceof Y.AbstractType ? value.clone() : value);
			replacement.set('amount', amount);
			h.doc.transact(() => { h.expenses.delete(0, 1); h.expenses.insert(0, [replacement]); });
		}
		merge(a, b);
		expect(a.expenses.length).toBe(2);
		expect(readExpenses(a)).toHaveLength(1);
		expect(readExpenseConflicts(a)[0].versions).toHaveLength(2);
		resolveExpenseConflict(a, 'dinner', expenseVersions(a, 'dinner')[0].id); merge(a, b);
		expect(readExpenseConflicts(a)).toEqual([]);
		expect(readExpenses(a)).toEqual(readExpenses(b));
	});
});
