import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findProject, type ProjectRef } from '$lib/storage';
import { initProject, openRoom, readProject } from './doc';
import { createSyncProvider } from './provider';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('./provider', () => ({ createSyncProvider: vi.fn(() => ({ destroy: vi.fn() })) }));
vi.mock('./persistence', () => ({
	RoomPersistence: class {
		ready = Promise.resolve();
		state = {};
		onChange() { return () => {}; }
		async destroy() {}
		async clearData() {}
	}
}));
vi.mock('$lib/storage', () => ({ findProject: vi.fn(), getCurrentMember: vi.fn() }));

const legacySecret = Buffer.alloc(32, 7).toString('base64url');
const currentSecret = Buffer.alloc(16, 7).toString('base64url');
const stored = (roomId: string, secret: string) => vi.mocked(findProject).mockReturnValue({ roomId, secret, name: 'Group' } as ProjectRef);

beforeEach(() => vi.mocked(createSyncProvider).mockClear());

describe('openRoom with an old-format secret', () => {
	it('never starts a sync provider for a stored legacy group', () => {
		stored('PRT-OLD1', legacySecret);
		const handle = openRoom('PRT-OLD1');
		expect(handle.legacy).toBe(true);
		expect(handle.syncProvider).toBeUndefined();
		expect(createSyncProvider).not.toHaveBeenCalled();
	});

	it('does not let a join link with an old secret start one either', () => {
		const handle = openRoom('PRT-OLD2', legacySecret);
		expect(handle.legacy).toBe(true);
		expect(createSyncProvider).not.toHaveBeenCalled();
	});

	it('still opens the group from local data', async () => {
		stored('PRT-OLD3', legacySecret);
		const handle = openRoom('PRT-OLD3');
		await handle.ready;
		initProject(handle, {
			id: 'PRT-OLD3', name: 'Old group', emoji: '🏖', color: 'lime', currency: 'EUR', currencySymbol: '€',
			defaultSplit: 'even', categories: [], paymentMethods: [], trips: [], createdAt: 1
		}, []);
		expect(readProject(handle)?.name).toBe('Old group');
	});

	it('syncs a group with a current secret', () => {
		stored('current-1', currentSecret);
		const handle = openRoom('current-1');
		expect(handle.legacy).toBe(false);
		expect(createSyncProvider).toHaveBeenCalledTimes(1);
	});

	it('flags any stored secret that is not a current one', () => {
		for (const length of [0, 23, 42, 44]) {
			const roomId = `PRT-ODD${length}`;
			stored(roomId, 'a'.repeat(length));
			const handle = openRoom(roomId);
			expect(handle.legacy).toBe(true);
			expect(handle.syncProvider).toBeUndefined();
		}
		expect(createSyncProvider).not.toHaveBeenCalled();
	});

	it('re-evaluates a cached handle when the secret becomes known', () => {
		vi.mocked(findProject).mockReturnValue(null);
		expect(openRoom('PRT-LATE').legacy).toBe(false);
		expect(openRoom('PRT-LATE', legacySecret).legacy).toBe(true);
		expect(createSyncProvider).not.toHaveBeenCalled();
	});
});
