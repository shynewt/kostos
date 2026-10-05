import { describe, expect, it } from 'vitest';
import { describeSync } from './describe';
import { LOCAL_STATUS, type SyncStatus } from './status';

const NOW = new Date('2026-10-05T12:00:00').getTime();
const status = (patch: Partial<SyncStatus>): SyncStatus => ({ ...LOCAL_STATUS, phase: 'synced', lastSyncedAt: NOW, ...patch });

describe('describeSync', () => {
	it('stays quiet when up to date', () => {
		const view = describeSync(status({}), null, NOW);
		expect(view).toMatchObject({ tone: 'ok', label: null, banner: null, attention: false, retry: false });
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

	it('treats the demo group as plain local storage', () => {
		expect(describeSync(LOCAL_STATUS, null, NOW, { demo: true })).toMatchObject({ tone: 'idle', banner: null, attention: false });
		expect(describeSync(LOCAL_STATUS, null, NOW).banner).toContain('Invite link missing');
	});

	it('says when nothing has synced yet', () => {
		const view = describeSync(status({ phase: 'offline', lastSyncedAt: null }), null, NOW);
		expect(view.facts[0].value).toBe('Not yet on this phone');
	});
});
