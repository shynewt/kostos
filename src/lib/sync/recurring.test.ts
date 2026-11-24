import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
	addExpense,
	readActivity,
	readExpenseConflicts,
	readExpenses,
	removeExpense,
	restoreExpense,
	updateExpense,
	type RoomHandle
} from './doc';
import {
	archiveRules,
	copyId,
	generateDueCopies,
	readRule,
	readRules,
	restoreRules,
	saveRepeat,
	stopRule
} from './recurring';
import type { Expense, RepeatFrequency } from '$lib/types';

function handle(): RoomHandle {
	const doc = new Y.Doc();
	return { roomId: 'TEST', doc, project: doc.getMap('project'), members: doc.getArray('members'), expenses: doc.getArray('expenses'), activity: doc.getArray('activity'), ready: Promise.resolve(), legacy: false };
}

function sync(from: RoomHandle, to: RoomHandle): void {
	Y.applyUpdate(to.doc, Y.encodeStateAsUpdate(from.doc, Y.encodeStateVector(to.doc)));
}

function syncBoth(a: RoomHandle, b: RoomHandle): void {
	sync(a, b);
	sync(b, a);
}

const rent: Expense = {
	id: 'rent',
	payments: [{ memberId: 'alice', amount: 120000 }],
	amount: 120000,
	currency: 'EUR',
	description: 'Rent',
	categoryId: 'cat-lodging',
	tripId: 'flat',
	date: Date.parse('2026-01-31'),
	splitMode: 'shares',
	splits: [{ memberId: 'alice', shares: 2 }, { memberId: 'bob', shares: 1 }],
	createdAt: Date.parse('2026-01-31'),
	createdBy: 'alice'
};

function addRepeating(room: RoomHandle, expense: Expense, repeat: RepeatFrequency = 'monthly'): Expense {
	let saved = expense;
	room.doc.transact(() => {
		saved = saveRepeat(room, expense, repeat, '2026-01-31');
		addExpense(room, saved);
	});
	return saved;
}

function copies(room: RoomHandle): Expense[] {
	return readExpenses(room).filter((e) => e.id !== 'rent').sort((a, b) => a.date - b.date);
}

describe('generateDueCopies', () => {
	it('copies payers, split, category, trip and currency onto each period day', () => {
		const room = handle();
		const source = addRepeating(room, rent);
		expect(generateDueCopies(room, '2026-04-30')).toBe(3);
		const made = copies(room);
		expect(made.map((e) => new Date(e.date).toISOString().slice(0, 10))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
		for (const copy of made) {
			expect(copy).toMatchObject({
				payments: rent.payments,
				splits: rent.splits,
				splitMode: 'shares',
				categoryId: 'cat-lodging',
				tripId: 'flat',
				currency: 'EUR',
				amount: 120000,
				recurrenceId: source.recurrenceId
			});
		}
	});

	it('is idempotent', () => {
		const room = handle();
		addRepeating(room, rent);
		generateDueCopies(room, '2026-03-31');
		expect(generateDueCopies(room, '2026-03-31')).toBe(0);
		expect(copies(room)).toHaveLength(2);
	});

	it('stays silent in the activity log', () => {
		const room = handle();
		addRepeating(room, rent);
		const before = readActivity(room).length;
		generateDueCopies(room, '2026-03-31');
		expect(readActivity(room)).toHaveLength(before);
	});

	it('leaves a deleted copy deleted', () => {
		const room = handle();
		const source = addRepeating(room, rent);
		generateDueCopies(room, '2026-03-31');
		removeExpense(room, copyId(source.recurrenceId!, 1));
		expect(generateDueCopies(room, '2026-05-31')).toBe(2);
		expect(copies(room).map((e) => e.id)).toEqual([2, 3, 4].map((n) => copyId(source.recurrenceId!, n)));
	});

	it('brings an undone deletion back as the same expense', () => {
		const room = handle();
		const source = addRepeating(room, rent);
		generateDueCopies(room, '2026-02-28');
		const copy = readExpenses(room).find((e) => e.id === copyId(source.recurrenceId!, 1))!;
		removeExpense(room, copy.id);
		restoreExpense(room, copy);
		expect(copies(room)).toHaveLength(1);
		expect(readExpenseConflicts(room)).toEqual([]);
	});

	it('makes nothing after the rule stops, and keeps the copies already made', () => {
		const room = handle();
		const source = addRepeating(room, rent);
		generateDueCopies(room, '2026-03-31');
		stopRule(room, source.recurrenceId!, '2026-04-02');
		expect(generateDueCopies(room, '2026-12-31')).toBe(0);
		expect(copies(room)).toHaveLength(2);
	});
});

describe('two phones', () => {
	it('end with one copy and no conflict when both create the same period offline', () => {
		const alice = handle();
		const bob = handle();
		const source = addRepeating(alice, rent);
		syncBoth(alice, bob);

		generateDueCopies(alice, '2026-03-31');
		generateDueCopies(bob, '2026-03-31');
		syncBoth(alice, bob);

		for (const room of [alice, bob]) {
			expect(copies(room).map((e) => e.id)).toEqual([1, 2].map((n) => copyId(source.recurrenceId!, n)));
			expect(readExpenseConflicts(room)).toEqual([]);
		}
		expect(readExpenses(alice)).toEqual(readExpenses(bob));
	});

	it('drop the duplicate entries the next time either one generates', () => {
		const alice = handle();
		const bob = handle();
		addRepeating(alice, rent);
		syncBoth(alice, bob);
		generateDueCopies(alice, '2026-02-28');
		generateDueCopies(bob, '2026-02-28');
		syncBoth(alice, bob);
		expect(alice.expenses.length).toBe(3);

		generateDueCopies(alice, '2026-02-28');
		generateDueCopies(bob, '2026-02-28');
		syncBoth(alice, bob);
		expect(alice.expenses.length).toBe(2);
		expect(bob.expenses.length).toBe(2);
		expect(readExpenses(alice)).toEqual(readExpenses(bob));
	});

	it('keep an edit made on one phone to a copy the other also created', () => {
		const alice = handle();
		const bob = handle();
		const source = addRepeating(alice, rent);
		syncBoth(alice, bob);
		generateDueCopies(alice, '2026-02-28');
		generateDueCopies(bob, '2026-02-28');
		const id = copyId(source.recurrenceId!, 1);
		const copy = readExpenses(bob).find((e) => e.id === id)!;
		updateExpense(bob, { ...copy, amount: 125000, payments: [{ memberId: 'alice', amount: 125000 }] });
		syncBoth(alice, bob);

		for (const room of [alice, bob]) {
			expect(readExpenses(room).find((e) => e.id === id)?.amount).toBe(125000);
			expect(readExpenseConflicts(room)).toEqual([]);
		}
	});

	it('do not bring back a copy one phone deleted', () => {
		const alice = handle();
		const bob = handle();
		const source = addRepeating(alice, rent);
		generateDueCopies(alice, '2026-02-28');
		syncBoth(alice, bob);
		removeExpense(alice, copyId(source.recurrenceId!, 1));
		syncBoth(alice, bob);
		expect(generateDueCopies(bob, '2026-02-28')).toBe(0);
		syncBoth(alice, bob);
		expect(copies(alice)).toEqual([]);
		expect(copies(bob)).toEqual([]);
	});

	it('stop creating copies on both once one phone stops the rule', () => {
		const alice = handle();
		const bob = handle();
		const source = addRepeating(alice, rent);
		syncBoth(alice, bob);
		stopRule(alice, source.recurrenceId!, '2026-01-31');
		syncBoth(alice, bob);
		expect(generateDueCopies(bob, '2026-06-30')).toBe(0);
		expect(copies(bob)).toEqual([]);
	});
});

describe('saveRepeat', () => {
	it('sends a later edit to future copies only', () => {
		const room = handle();
		const source = addRepeating(room, rent);
		generateDueCopies(room, '2026-02-28');
		room.doc.transact(() => {
			const edited = saveRepeat(room, { ...source, amount: 130000, payments: [{ memberId: 'alice', amount: 130000 }] }, 'monthly', '2026-03-01');
			updateExpense(room, edited);
		});
		generateDueCopies(room, '2026-03-31');
		expect(copies(room).map((e) => e.amount)).toEqual([120000, 130000]);
	});

	it('stops the rule when set to never', () => {
		const room = handle();
		const source = addRepeating(room, rent);
		room.doc.transact(() => updateExpense(room, saveRepeat(room, source, null, '2026-03-05')));
		expect(readRule(room, source.recurrenceId!)?.endDay).toBe('2026-03-05');
		expect(generateDueCopies(room, '2026-06-30')).toBe(1);
	});

	it('replaces the rule when the frequency changes, without repeating covered periods', () => {
		const room = handle();
		const source = addRepeating(room, rent);
		generateDueCopies(room, '2026-03-31');
		let edited = source;
		room.doc.transact(() => {
			edited = saveRepeat(room, source, 'weekly', '2026-04-01');
			updateExpense(room, edited);
		});
		expect(edited.recurrenceId).not.toBe(source.recurrenceId);
		expect(readRule(room, source.recurrenceId!)?.endDay).toBe('2026-04-01');
		generateDueCopies(room, '2026-04-12');
		const weekly = readExpenses(room).filter((e) => e.recurrenceId === edited.recurrenceId && e.id !== 'rent');
		expect(weekly.map((e) => new Date(e.date).toISOString().slice(0, 10))).toEqual(['2026-04-04', '2026-04-11']);
	});
});

describe('backups', () => {
	it('carry rules and the periods they handled', () => {
		const room = handle();
		const source = addRepeating(room, rent);
		generateDueCopies(room, '2026-03-31');
		removeExpense(room, copyId(source.recurrenceId!, 2));

		const restored = handle();
		restoreRules(restored, archiveRules(room));
		for (const expense of readExpenses(room)) addExpense(restored, expense, { silent: true });
		expect(readRules(restored)).toEqual(readRules(room));
		expect(generateDueCopies(restored, '2026-03-31')).toBe(0);
		expect(generateDueCopies(restored, '2026-04-30')).toBe(1);
	});
});
