import type { LocalState } from './sync/persistence';
import type { SyncStatus } from './sync/status';

/** Both placeholders must be replaced before release; release-legacy.yml refuses to deploy otherwise. */
export const APP_HOST = 'kostos.app';
export const RETIREMENT_DATE = '1 March 2027';
export const NEW_ORIGIN = `https://${APP_HOST}`;

export const UPDATE_NOTICE_TEXT = 'Update to see an important notice about Kostos moving.';

/** A backup taken before the device is current can miss recent changes, so say so first. */
export function exportWarning(sync: SyncStatus, local: LocalState | null): string | null {
	const pending = Math.max(sync.pendingChanges, local?.pendingChanges ?? 0);
	if (sync.phase === 'synced' && pending === 0) return null;
	return 'This phone has not finished syncing, so the backup could miss recent changes. Open the group online and wait for a solid dot under the group name (tap it to see “Up to date”), then export.';
}
