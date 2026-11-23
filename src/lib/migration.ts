import type { LocalState } from './sync/persistence';
import type { SyncStatus } from './sync/status';
import type { MirrorStatus } from './move/provider';

/** Both placeholders must be replaced before release; release-legacy.yml refuses to deploy otherwise. */
export const APP_HOST = 'kostos.app';
/** The day the old site is switched off, as YYYY-MM-DD. */
export const RETIREMENT_DATE = '2027-03-01';
/** From this day, YYYY-MM-DD, a group that has moved can only be viewed and exported here. */
export const FREEZE_DATE = '2027-01-31';
// a local v3 server stands in for the real one in development and the cross-version e2e run
export const NEW_ORIGIN = (import.meta.env.VITE_NEW_ORIGIN as string | undefined) || `https://${APP_HOST}`;

const DAY_MS = 86_400_000;
/** How long before the switch-off the banner turns into a warning. */
const URGENT_DAYS = 30;
const retirementDay = new Date(`${RETIREMENT_DATE}T00:00:00`);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// spelled out by hand: a runtime without full locale data ignores 'en-GB' and prints "March 1, 2027"
export const RETIREMENT_LABEL = `${retirementDay.getDate()} ${MONTHS[retirementDay.getMonth()]} ${retirementDay.getFullYear()}`;

const freezeDay = new Date(`${FREEZE_DATE}T00:00:00`);

/** Groups that haven't moved stay editable, so a failed copy never strands anyone. */
export function isLockedHere(moved: boolean, now: Date): boolean {
	return moved && now.getTime() >= freezeDay.getTime();
}

export type RetirementNotice = { urgent: boolean; daysLeft: number };

/** Days counted in the viewer's own calendar, so "in 1 day" means tomorrow wherever they are. */
export function retirementNotice(now: Date): RetirementNotice {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const daysLeft = Math.max(0, Math.round((retirementDay.getTime() - today.getTime()) / DAY_MS));
	return { urgent: daysLeft <= URGENT_DAYS, daysLeft };
}

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
