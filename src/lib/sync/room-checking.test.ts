import { describe, expect, it } from 'vitest';
import { openRoom } from './doc';
import { RoomState } from './useRoom.svelte';
import { LOCAL_STATUS, type SyncStatus } from './status';

const status = (patch: Partial<SyncStatus>): SyncStatus => ({ ...LOCAL_STATUS, phase: 'loading', checking: true, ...patch });

function roomWith(id: string) {
	const handle = openRoom(id);
	let current = status({});
	const listeners = new Set<(s: SyncStatus) => void>();
	handle.syncProvider = {
		get snapshot() { return current; },
		onStatusChange(fn: (s: SyncStatus) => void) { listeners.add(fn); fn(current); return () => listeners.delete(fn); }
	} as unknown as typeof handle.syncProvider;
	const push = (s: SyncStatus) => { current = s; listeners.forEach((fn) => fn(s)); };
	const room = new RoomState(handle);
	const stop = room.observe();
	return { room, push, stop };
}

describe('loading placeholder', () => {
	it('shows once, then never returns after a failure or reconnect', () => {
		const { room, push, stop } = roomWith('CHECK1');
		expect(room.checking).toBe(true);
		push(status({ phase: 'error', checking: false, problem: 'timeout' }));
		expect(room.checking).toBe(false);
		push(status({ phase: 'connecting', checking: true }));
		expect(room.checking).toBe(false);
		stop();
	});
	it('stays hidden for a later page on the same room', () => {
		const first = roomWith('CHECK2');
		first.push(status({ phase: 'synced', checking: false }));
		first.stop();
		first.push(status({ phase: 'connecting', checking: true }));
		const second = new RoomState(openRoom('CHECK2'));
		expect(second.checking).toBe(false);
	});
});

describe('replaying a long history', () => {
	it('re-reads the room once per burst of remote updates, but immediately for local edits', async () => {
		const { vi } = await import('vitest');
		const { addExpense } = await import('./doc');
		const { REMOTE_ORIGIN } = await import('./persistence');
		vi.useFakeTimers();
		const { room, stop } = roomWith('BURST');
		const expense = (id: string) => ({ id, amount: 100, currency: 'EUR', date: 0, payments: [{ memberId: 'a', amount: 100 }], splitMode: 'even', splits: [{ memberId: 'a' }], createdAt: 0, createdBy: 'a' }) as never;
		for (let i = 0; i < 20; i++) room.handle.doc.transact(() => addExpense(room.handle, expense('r' + i)), REMOTE_ORIGIN);
		expect(room.expenses).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(300);
		expect(room.expenses).toHaveLength(20);
		addExpense(room.handle, expense('mine'));
		expect(room.expenses).toHaveLength(21);
		stop(); vi.useRealTimers();
	});
});
