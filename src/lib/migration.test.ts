import { describe, expect, it } from 'vitest';
import { exportWarning } from './migration';
import { LOCAL_STATUS, type SyncStatus } from './sync/status';

const synced: SyncStatus = { ...LOCAL_STATUS, phase: 'synced', lastSyncedAt: 1, pendingChanges: 0 };

describe('exportWarning', () => {
	it('stays quiet when the device is fully synced', () => {
		expect(exportWarning(synced, null)).toBeNull();
	});

	it('warns while anything is still syncing or unreachable', () => {
		for (const phase of ['loading', 'connecting', 'syncing', 'offline', 'error', 'local'] as const) {
			expect(exportWarning({ ...synced, phase }, null), phase).toContain('not finished syncing');
		}
	});

	it('warns when changes are waiting, from either the provider or local storage', () => {
		expect(exportWarning({ ...synced, pendingChanges: 2 }, null)).toContain('not finished syncing');
		const local = { phase: 'saved', pendingChanges: 1, lastSyncedAt: 1, unverifiedSince: null } as const;
		expect(exportWarning(synced, local)).toContain('not finished syncing');
	});
});
