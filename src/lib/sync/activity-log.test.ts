import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addExpense, addMember, readActivity, removeExpense, updateExpense, type RoomHandle } from './doc';
import type { Expense } from '$lib/types';

function handle(): RoomHandle {
	const doc = new Y.Doc();
	return {
		roomId: 'ROOM',
		doc,
		project: doc.getMap('project'),
		members: doc.getArray('members'),
		expenses: doc.getArray('expenses'),
		activity: doc.getArray('activity'),
		ready: Promise.resolve()
	};
}

function expense(over: Partial<Expense> = {}): Expense {
	return {
		id: 'e1',
		payments: [{ memberId: 'a', amount: 1000 }],
		amount: 1000,
		currency: 'EUR',
		date: 1000,
		splitMode: 'even',
		splits: [{ memberId: 'a' }, { memberId: 'b' }],
		createdAt: 0,
		createdBy: 'a',
		...over
	};
}

describe('activity logging', () => {
	it('logs an add, then one event per edit change', () => {
		const h = handle();
		addExpense(h, expense({ description: 'A' }));
		updateExpense(h, expense({ description: 'B', amount: 2000, payments: [{ memberId: 'a', amount: 2000 }] }));

		const log = readActivity(h);
		expect(log.map((e) => e.kind)).toEqual(['expense.add', 'expense.edit', 'expense.edit']);
		// amount + title, and the payer amount that just tracks the new total is suppressed
		expect(
			log
				.filter((e) => e.kind === 'expense.edit')
				.map((e) => e.change?.kind)
				.sort()
		).toEqual(['amount', 'text']);
	});

	it('round-trips a change through storage', () => {
		const h = handle();
		addExpense(h, expense({ description: 'A' }));
		updateExpense(h, expense({ description: 'A', amount: 2000, payments: [{ memberId: 'a', amount: 2000 }] }));

		const edit = readActivity(h).find((e) => e.kind === 'expense.edit');
		expect(edit?.change).toEqual({
			kind: 'amount',
			from: 1000,
			to: 2000,
			fromCurrency: 'EUR',
			toCurrency: 'EUR'
		});
	});

	it('tags settlements and deletions distinctly', () => {
		const h = handle();
		addExpense(h, expense({ id: 's1', isSettlement: true, splits: [{ memberId: 'b' }] }));
		removeExpense(h, 's1');
		addMember(h, { id: 'm1', name: 'Bob' } as Parameters<typeof addMember>[1]);

		expect(readActivity(h).map((e) => e.kind)).toEqual(['settle.add', 'expense.remove', 'member.add']);
	});

	it('prefixes the category emoji onto add and remove labels', () => {
		const h = handle();
		addExpense(h, expense({ id: 'e2', description: 'Dinner', categoryId: 'cat-restaurants' }));
		removeExpense(h, 'e2');

		const log = readActivity(h);
		expect(log.find((e) => e.kind === 'expense.add')?.label).toBe('🍽️ Dinner');
		expect(log.find((e) => e.kind === 'expense.remove')?.label).toBe('🍽️ Dinner');
	});
});
