import { describe, expect, it } from 'vitest';
import { LEGACY_GROUP_SUMMARY } from '$lib/legacy';
import { describeSync, syncLine } from './describe';
import { LOCAL_STATUS, type SyncStatus } from './status';

const NOW = new Date('2026-10-05T12:00:00').getTime();
const status = (patch: Partial<SyncStatus>): SyncStatus => ({ ...LOCAL_STATUS, phase: 'synced', lastSyncedAt: NOW, ...patch });

describe('describeSync', () => {
	it('stays quiet when up to date', () => {
		const view = describeSync(status({}), null, NOW);
		expect(view).toMatchObject({ tone: 'ok', label: 'Up to date', banner: null, attention: false, retry: false });
	});

	it('names pending changes while syncing', () => {
		expect(describeSync(status({ phase: 'syncing', pendingChanges: 1 }), null, NOW).label).toBe('Syncing 1 change');
		expect(describeSync(status({ phase: 'syncing', pendingChanges: 3 }), null, NOW).label).toBe('Syncing 3 changes');
		expect(describeSync(status({ phase: 'loading', checking: true }), null, NOW).label).toBe('Checking…');
	});

	it('reports waiting changes when offline and allows a retry', () => {
		const view = describeSync(status({ phase: 'offline', pendingChanges: 2 }), null, NOW);
		expect(view).toMatchObject({ tone: 'offline', label: 'Offline · 2 waiting', retry: true, banner: null, attention: true });
		expect(view.facts.map((f) => f.label)).toEqual(['Last synced', 'Waiting to send']);
	});

	it('shows a banner and retry for sync errors', () => {
		const view = describeSync(status({ phase: 'error', problem: 'decrypt' }), null, NOW);
		expect(view).toMatchObject({ tone: 'warn', state: 'error', retry: true });
		expect(view.banner).toContain('invite link');
	});

	it('gives local save failures priority', () => {
		const local = { phase: 'error', pendingChanges: 1, lastSyncedAt: NOW, unverifiedSince: null } as const;
		expect(describeSync(status({}), local, NOW)).toMatchObject({ state: 'local-error', label: 'Not saved here', banner: null });
	});

	it('words a refused key as a terminal problem with no retry', () => {
		const view = describeSync(status({ phase: 'error', problem: 'denied' }), null, NOW);
		expect(view).toMatchObject({ state: 'error', tone: 'warn', retry: false });
		expect(view.body).toBe('This group belongs to a different key. Ask for a fresh invite link.');
		expect(view.banner).toBe(view.body);
	});

	it('words a plain HTTP origin as terminal and names the fix', () => {
		const view = describeSync(status({ phase: 'error', problem: 'insecure' }), null, NOW);
		expect(view).toMatchObject({ state: 'error', retry: false });
		expect(view.body).toContain('HTTPS');
		expect(view.banner).toBe(view.body);
	});

	it('treats the demo group as plain local storage', () => {
		expect(describeSync(LOCAL_STATUS, null, NOW, { demo: true })).toMatchObject({ tone: 'idle', banner: null, attention: false });
		expect(describeSync(LOCAL_STATUS, null, NOW).banner).toContain('Invite link missing');
	});

	it('labels the demo group as local only', () => {
		expect(describeSync(LOCAL_STATUS, null, NOW, { demo: true }).label).toBe('Only on this phone');
	});

	it('marks an old-format group as not syncing, without a banner or retry', () => {
		const view = describeSync(LOCAL_STATUS, null, NOW, { legacy: true });
		expect(view).toMatchObject({ state: 'legacy', label: 'Not syncing', banner: null, retry: false, attention: true });
		expect(view.body).toBe(LEGACY_GROUP_SUMMARY);
	});

	it('says when nothing has synced yet', () => {
		const view = describeSync(status({ phase: 'offline', lastSyncedAt: null }), null, NOW);
		expect(view.facts[0].value).toBe('Not yet on this phone');
	});
});

describe('syncLine', () => {
	const secret = 'AAECAwQFBgcICQoLDA0ODw';

	it('says when a group last synced', () => {
		expect(syncLine({ secret, lastSyncedAt: NOW - 5 * 60_000 }, NOW)).toBe('Synced 5 minutes ago');
		expect(syncLine({ secret }, NOW)).toBe('Not synced yet');
	});

	it('says a group that cannot sync no longer does, in words short enough for a phone', () => {
		const line = syncLine({ secret: 'x'.repeat(43), lastSyncedAt: NOW }, NOW);
		expect(line).toBe('No longer syncs');
	});
});
