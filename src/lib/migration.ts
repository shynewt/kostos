import type { LocalState } from './sync/persistence';
import type { SyncStatus } from './sync/status';
import type { MirrorStatus } from './move/provider';

/** Both placeholders must be replaced before release; release-legacy.yml refuses to deploy otherwise. */
export const APP_HOST = 'kostos.app';
export const RETIREMENT_DATE = '1 March 2027';
// a local v3 server stands in for the real one in development and the cross-version e2e run
export const NEW_ORIGIN = (import.meta.env.VITE_NEW_ORIGIN as string | undefined) || `https://${APP_HOST}`;

export const UPDATE_NOTICE_TEXT = 'Update to see an important notice about Kostos moving.';

/** The v3 invite for a moved group, the same for every member. */
export function newInviteLink(v3Secret: string): string {
	return `${NEW_ORIGIN}/join#${v3Secret}`;
}

/** v3's join page signs this phone in as the same member it uses here, skipping the picker. */
export function openOnNewSiteLink(v3Secret: string, memberId: string | null): string {
	const invite = newInviteLink(v3Secret);
	return memberId ? `${invite}&member=${encodeURIComponent(memberId)}` : invite;
}

export type MoveStage = 'copying' | 'waiting' | 'ready' | 'failed';

const OLD_SITE_STILL_CHECKING: SyncStatus['phase'][] = ['loading', 'connecting', 'syncing'];

/** Ready waits for the old server to finish catching this phone up, so the copy holds the whole group.
 *  If the old server can't be reached, what this phone has is already on the new site. */
export function moveStage(move: MirrorStatus, oldSync: SyncStatus): MoveStage {
	if (move.phase === 'error') return 'failed';
	if (move.phase === 'offline') return 'waiting';
	if (move.phase === 'synced' && !OLD_SITE_STILL_CHECKING.includes(oldSync.phase)) return 'ready';
	return 'copying';
}

/** A refused key or an unreadable group won't change by retrying. */
export function canRetryMove(move: MirrorStatus): boolean {
	return move.problem !== 'denied' && move.problem !== 'decrypt';
}

/** A backup taken before the device is current can miss recent changes, so say so first. */
export function exportWarning(sync: SyncStatus, local: LocalState | null): string | null {
	const pending = Math.max(sync.pendingChanges, local?.pendingChanges ?? 0);
	if (sync.phase === 'synced' && pending === 0) return null;
	return 'This phone has not finished syncing, so the backup could miss recent changes. Open the group online and wait for a solid dot under the group name (tap it to see “Up to date”), then export.';
}
