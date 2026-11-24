import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { readExpenses, type RoomHandle } from './doc';
import { saveSettlement } from './settlement';
import type { Expense } from '$lib/types';

function handle(): RoomHandle {
	const doc = new Y.Doc();
	return { roomId: 'TEST', doc, project: doc.getMap('project'), members: doc.getArray('members'), expenses: doc.getArray('expenses'), activity: doc.getArray('activity'), ready: Promise.resolve(), legacy: false };
}

function settlement(cents: number): Expense {
	return {
		id: 'settle-1',
		payments: [{ memberId: 'bob', amount: cents }],
		amount: cents,
		currency: 'EUR',
		description: 'Bob → Alice',
		date: Date.parse('2026-05-01'),
		splitMode: 'even',
		splits: [{ memberId: 'alice' }],
		isSettlement: true,
		createdAt: Date.parse('2026-05-01'),
		createdBy: 'bob'
	};
}

describe('saveSettlement', () => {
	it('records a settlement once', () => {
		const room = handle();
		saveSettlement(room, settlement(5000));
		expect(readExpenses(room).map((e) => e.amount)).toEqual([5000]);
	});

	it('corrects the same settlement when a retry changes the amount, instead of adding a second', () => {
		const room = handle();
		saveSettlement(room, settlement(5000));
		saveSettlement(room, settlement(3000));
		const saved = readExpenses(room);
		expect(saved).toHaveLength(1);
		expect(saved[0].amount).toBe(3000);
		expect(saved[0].payments).toEqual([{ memberId: 'bob', amount: 3000 }]);
	});
});
