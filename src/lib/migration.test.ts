import { describe, expect, it } from 'vitest';
import { canRetryMove, exportWarning, moveStage, NEW_ORIGIN, newInviteLink, openOnNewSiteLink } from './migration';
import type { MirrorStatus } from './move/provider';
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

describe('moveStage', () => {
	const moved: MirrorStatus = { phase: 'synced', problem: null };

	it('is ready once the new server is current and the old one has finished catching this phone up', () => {
		expect(moveStage(moved, synced)).toBe('ready');
		expect(moveStage(moved, { ...synced, phase: 'syncing' })).toBe('copying');
		expect(moveStage(moved, { ...synced, phase: 'connecting' })).toBe('copying');
		expect(moveStage({ phase: 'syncing', problem: null }, synced)).toBe('copying');
		expect(moveStage({ phase: 'connecting', problem: null }, synced)).toBe('copying');
	});

	it('does not wait forever on an old server that is down', () => {
		expect(moveStage(moved, { ...synced, phase: 'offline' })).toBe('ready');
		expect(moveStage(moved, { ...synced, phase: 'error' })).toBe('ready');
	});

	it('waits while the new site is out of reach and fails on a server error', () => {
		expect(moveStage({ phase: 'offline', problem: null }, synced)).toBe('waiting');
		expect(moveStage({ phase: 'error', problem: 'full' }, synced)).toBe('failed');
	});
});

describe('canRetryMove', () => {
	it('offers Try again only when trying again can help', () => {
		expect(canRetryMove({ phase: 'error', problem: 'timeout' })).toBe(true);
		expect(canRetryMove({ phase: 'error', problem: 'storage' })).toBe(true);
		expect(canRetryMove({ phase: 'error', problem: 'denied' })).toBe(false);
		expect(canRetryMove({ phase: 'error', problem: 'decrypt' })).toBe(false);
	});
});

describe('new site links', () => {
	const v3Secret = 'Iqt5oQ0PyKFW98ffHaY8aA';

	it('shares the plain v3 invite', () => {
		expect(newInviteLink(v3Secret)).toBe(`${NEW_ORIGIN}/join#${v3Secret}`);
	});

	it('opens as the same member, or falls back to the picker when this phone never chose one', () => {
		expect(openOnNewSiteLink(v3Secret, 'a1b2')).toBe(`${NEW_ORIGIN}/join#${v3Secret}&member=a1b2`);
		expect(openOnNewSiteLink(v3Secret, null)).toBe(`${NEW_ORIGIN}/join#${v3Secret}`);
	});
});
