import { describe, expect, it } from 'vitest';
import { canRetryMove, exportWarning, isLockedHere, newSiteJoinLink, moveStage, RETIREMENT_LABEL, retirementNotice, NEW_ORIGIN, newInviteLink, openOnNewSiteLink } from './migration';
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

describe('retirementNotice', () => {
	it('stays calm until 30 days before the switch-off', () => {
		expect(retirementNotice(new Date(2026, 10, 23, 15))).toEqual({ urgent: false, daysLeft: 98 });
		expect(retirementNotice(new Date(2027, 0, 29, 23))).toEqual({ urgent: false, daysLeft: 31 });
	});

	it('warns for the last 30 days and counts down by calendar day', () => {
		expect(retirementNotice(new Date(2027, 0, 30, 0, 1))).toEqual({ urgent: true, daysLeft: 30 });
		expect(retirementNotice(new Date(2027, 1, 28, 23, 59))).toEqual({ urgent: true, daysLeft: 1 });
		expect(retirementNotice(new Date(2027, 2, 1, 9))).toEqual({ urgent: true, daysLeft: 0 });
		expect(retirementNotice(new Date(2027, 2, 5))).toEqual({ urgent: true, daysLeft: 0 });
	});

	it('shows the date the way people write it', () => {
		expect(RETIREMENT_LABEL).toBe('1 March 2027');
	});
});

describe('isLockedHere', () => {
	it('locks a moved group from the freeze date on', () => {
		expect(isLockedHere(true, new Date(2027, 0, 30, 23, 59))).toBe(false);
		expect(isLockedHere(true, new Date(2027, 0, 31, 0, 0))).toBe(true);
	});

	it('never locks a group that has not moved', () => {
		expect(isLockedHere(false, new Date(2027, 1, 20))).toBe(false);
	});
});

describe('newSiteJoinLink', () => {
	const v3Secret = 'Iqt5oQ0PyKFW98ffHaY8aA';

	it('sends new-site invites, as a link or a bare key, to the new site', () => {
		expect(newSiteJoinLink(`https://kostos.app/join#${v3Secret}`)).toBe(`${NEW_ORIGIN}/join#${v3Secret}`);
		expect(newSiteJoinLink(`  ${v3Secret}  `)).toBe(`${NEW_ORIGIN}/join#${v3Secret}`);
		expect(newSiteJoinLink(`https://kostos.app/join#${v3Secret}&member=anna`)).toBe(`${NEW_ORIGIN}/join#${v3Secret}`);
	});

	it('leaves old invites to this site', () => {
		const oldSecret = Buffer.alloc(32, 2).toString('base64url');
		expect(newSiteJoinLink(`https://kostos.shynewt.com/join?room=PRT-AB12-CD34#${oldSecret}`)).toBeNull();
		expect(newSiteJoinLink(`PRT-AB12-CD34.${oldSecret}`)).toBeNull();
		expect(newSiteJoinLink(oldSecret)).toBeNull();
	});
});
