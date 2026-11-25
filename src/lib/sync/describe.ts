import { isLegacySecret, LEGACY_GROUP_SUMMARY } from '$lib/legacy';
import { plural } from '$lib/plural';
import type { LocalState } from './persistence';
import { PROBLEM_LABELS, relativeTime, type SyncProblem, type SyncStatus } from './status';

export type SyncTone = 'ok' | 'busy' | 'warn' | 'offline' | 'idle';

export type SyncView = {
	tone: SyncTone;
	/** Machine-readable state, exposed as data-sync-state. */
	state: string;
	/** Short text for the app bar line under the group name. */
	label: string;
	headline: string;
	body: string;
	facts: { label: string; value: string }[];
	retry: boolean;
	/** Text for the banner under the app bar; null means no banner. */
	banner: string | null;
	/** Whether this state deserves a visible marker on screens with no status line. */
	attention: boolean;
};

// problems missing here read the same in the banner as in the status sheet
const BANNER_TEXT: Record<SyncProblem, string> = {
	...PROBLEM_LABELS,
	network: 'Can’t reach the group. Your changes are saved here.',
	timeout: 'The server is slow to answer. Your changes are saved here.',
	storage: 'The server couldn’t store your latest changes. They’re saved here. If this keeps happening, export a backup from the Group tab.',
	decrypt: 'Some group data couldn’t be read. Check that your invite link is the right one.',
	protocol: 'This server needs an update before it can sync.',
	history: 'Older server history is incomplete. Export a backup from the Group tab.',
	size: 'This group is too large to sync. Export a backup from the Group tab.'
};

/** Retrying cannot change these, so the status offers no retry button. */
const TERMINAL_PROBLEMS: SyncProblem[] = ['denied', 'insecure'];

function formatClock(at: number, now: number): string {
	const date = new Date(at);
	const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	if (new Date(now).toDateString() === date.toDateString()) return time;
	return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

/** The home list's sync line for one saved group. */
export function syncLine(project: { secret: string; lastSyncedAt?: number | null }, now: number = Date.now()): string {
	if (isLegacySecret(project.secret)) return 'No longer syncs';
	return project.lastSyncedAt ? `Synced ${relativeTime(project.lastSyncedAt, now)}` : 'Not synced yet';
}

function syncFacts(lastSynced: number | null, pending: number, now: number): SyncView['facts'] {
	const facts: SyncView['facts'] = [{
		label: 'Last synced',
		value: lastSynced ? `${formatClock(lastSynced, now)} · ${relativeTime(lastSynced, now)}` : 'Not yet on this phone'
	}];
	if (pending > 0) facts.push({ label: 'Waiting to send', value: plural(pending, 'change', 'changes') });
	return facts;
}

export function describeSync(
	sync: SyncStatus,
	local: LocalState | null,
	now: number,
	options: { demo?: boolean; legacy?: boolean } = {}
): SyncView {
	const pending = Math.max(sync.pendingChanges, local?.pendingChanges ?? 0);
	const base = { facts: [], retry: false, banner: null, attention: false };
	const connectedFacts = () => syncFacts(sync.lastSyncedAt, pending, now);

	if (local?.phase === 'error') {
		return {
			...base,
			tone: 'warn', state: 'local-error', label: 'Not saved here', attention: true,
			headline: 'Not saved on this phone',
			body: 'Your changes may be lost if the app closes. Keep it open and try again, or export a backup from the Group tab.'
		};
	}
	if (options.legacy) {
		return {
			...base, tone: 'warn', state: 'legacy', label: 'Not syncing', attention: true,
			headline: 'This group no longer syncs',
			body: LEGACY_GROUP_SUMMARY
		};
	}
	switch (sync.phase) {
		case 'local':
			if (options.demo) {
				return { ...base, tone: 'idle', state: 'local', label: 'Only on this phone', headline: 'Only on this phone', body: 'The demo group never leaves your device.' };
			}
			return {
				...base, tone: 'warn', state: 'local', label: 'Invite needed', attention: true,
				headline: 'Not connected to the group',
				body: 'Open the full invite link to reconnect this phone with your group.',
				banner: 'Invite link missing. Open the full link to reconnect.'
			};
		case 'synced':
			return {
				...base, tone: 'ok', state: 'synced', label: 'Up to date', facts: connectedFacts(),
				headline: 'Up to date',
				body: 'This phone has everything the group has sent. Changes made offline on other phones appear when they reconnect.'
			};
		case 'offline':
			return {
				...base, tone: 'offline', state: 'offline', attention: true, facts: connectedFacts(),
				label: pending ? `Offline · ${pending} waiting` : 'Offline',
				headline: 'Offline',
				body: pending
					? 'This phone can’t reach the group right now. Your changes are saved here and send automatically once it reconnects.'
					: 'This phone can’t reach the group right now. You can keep working; new expenses from others appear once it reconnects.',
				retry: true
			};
		case 'error':
			return {
				...base, tone: 'warn', state: 'error', label: 'Sync paused', attention: true, facts: connectedFacts(), retry: !TERMINAL_PROBLEMS.includes(sync.problem ?? 'network'),
				headline: 'Couldn’t sync',
				body: PROBLEM_LABELS[sync.problem ?? 'network'],
				banner: BANNER_TEXT[sync.problem ?? 'network']
			};
		default: {
			const saving = local?.phase === 'saving';
			return {
				...base, tone: 'busy', state: sync.phase, facts: connectedFacts(),
				label: saving ? 'Saving…' : pending ? `Syncing ${plural(pending, 'change', 'changes')}` : 'Checking…',
				headline: pending ? 'Sending your changes' : 'Checking for new expenses',
				body: pending
					? 'Saved on this phone. The group gets them once the server confirms.'
					: 'Balances show up as soon as this phone has the latest expenses.'
			};
		}
	}
}
