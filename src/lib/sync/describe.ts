import type { LocalState } from './persistence';
import { PROBLEM_LABELS, relativeTime, type SyncProblem, type SyncStatus } from './status';

export type SyncTone = 'ok' | 'busy' | 'warn' | 'offline' | 'idle';

export type SyncView = {
	tone: SyncTone;
	/** Machine-readable state, exposed as data-sync-state. */
	state: string;
	/** Short text for the app bar line; null means "show the room code". */
	label: string | null;
	headline: string;
	body: string;
	facts: { label: string; value: string }[];
	retry: boolean;
	/** Text for the banner under the app bar; null means no banner. */
	banner: string | null;
	/** Whether this state deserves a visible marker on screens with no status line. */
	attention: boolean;
};

const BANNER_TEXT: Record<SyncProblem, string> = {
	network: 'Can’t reach the group. Your changes are saved here.',
	timeout: 'The server is slow to answer. Your changes are saved here.',
	storage: 'The server couldn’t store your latest changes. They’re saved here.',
	decrypt: 'Some group data couldn’t be read. Check that your invite link is the right one.',
	protocol: 'This server needs an update before it can sync.',
	history: 'Older server history is incomplete. Export a backup from Settings.',
	size: 'This group is too large to sync. Export a backup from Settings.'
};

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

export function formatClock(at: number, now: number): string {
	const date = new Date(at);
	const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	if (new Date(now).toDateString() === date.toDateString()) return time;
	return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function describeSync(
	sync: SyncStatus,
	local: LocalState | null,
	now: number,
	options: { demo?: boolean } = {}
): SyncView {
	const pending = Math.max(sync.pendingChanges, local?.pendingChanges ?? 0);
	const facts: SyncView['facts'] = [];
	const lastSynced = sync.lastSyncedAt;
	facts.push({
		label: 'Last synced',
		value: lastSynced ? `${formatClock(lastSynced, now)} · ${relativeTime(lastSynced, now)}` : 'Not yet on this phone'
	});
	if (pending > 0) facts.push({ label: 'Waiting to send', value: plural(pending, 'change', 'changes') });

	const base = { facts, retry: false, banner: null, attention: false };

	if (local?.phase === 'error') {
		return {
			...base,
			tone: 'warn', state: 'local-error', label: 'Not saved here', attention: true,
			headline: 'Not saved on this phone',
			body: 'Your changes may be lost if the app closes. Keep it open and try again, or export a backup from Settings.',
			facts: []
		};
	}
	switch (sync.phase) {
		case 'local':
			if (options.demo) {
				return { ...base, tone: 'idle', state: 'local', label: null, headline: 'Only on this phone', body: 'The demo group never leaves your device.', facts: [] };
			}
			return {
				...base, tone: 'warn', state: 'local', label: 'Invite needed', attention: true, facts: [],
				headline: 'Not connected to the group',
				body: 'Open the full invite link to reconnect this phone with your group.',
				banner: 'Invite link missing. Open the full link to reconnect.'
			};
		case 'synced':
			return {
				...base, tone: 'ok', state: 'synced', label: null,
				headline: 'Up to date',
				body: 'This phone has everything the group has sent. Changes made offline on other phones appear when they reconnect.'
			};
		case 'offline':
			return {
				...base, tone: 'offline', state: 'offline', attention: true,
				label: pending ? `Offline · ${pending} waiting` : 'Offline',
				headline: 'You’re offline',
				body: pending
					? 'Your changes are saved on this phone and will send when you’re back online.'
					: 'You can keep working. New expenses from others appear when you reconnect.',
				retry: true
			};
		case 'error':
			return {
				...base, tone: 'warn', state: 'error', label: 'Sync paused', attention: true, retry: true,
				headline: 'Couldn’t sync',
				body: PROBLEM_LABELS[sync.problem ?? 'network'],
				banner: BANNER_TEXT[sync.problem ?? 'network']
			};
		default: {
			const saving = local?.phase === 'saving';
			return {
				...base, tone: 'busy', state: sync.phase,
				label: saving ? 'Saving…' : pending ? `Syncing ${plural(pending, 'change', 'changes')}` : 'Checking…',
				headline: pending ? 'Sending your changes' : 'Checking for new expenses',
				body: pending
					? 'Saved on this phone. The group gets them once the server confirms.'
					: 'Balances show up as soon as this phone has the latest expenses.'
			};
		}
	}
}
