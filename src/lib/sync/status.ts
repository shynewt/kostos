export type SyncPhase = 'local' | 'loading' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
export type SyncProblem = 'network' | 'timeout' | 'storage' | 'decrypt' | 'protocol' | 'history' | 'size';

export type SyncStatus = {
	phase: SyncPhase;
	checking: boolean;
	problem: SyncProblem | null;
	lastSyncedAt: number | null;
	unverifiedSince: number | null;
	pendingChanges: number;
};

export const LOCAL_STATUS: SyncStatus = {
	phase: 'local', checking: false, problem: null, lastSyncedAt: null, unverifiedSince: null, pendingChanges: 0
};

export const PROBLEM_LABELS: Record<SyncProblem, string> = {
	network: 'The sync server could not be reached. We’ll keep trying.',
	timeout: 'The sync server is taking too long to respond. We’ll keep trying.',
	storage: 'The server couldn’t save your changes. They still need to sync.',
	decrypt: 'Some group data couldn’t be read. Check that you have the correct invite link.',
	protocol: 'This server needs an update before sync can be verified.',
	history: 'Older server history is incomplete. Keep your existing devices and export a backup in Settings.',
	size: 'This group is too large to sync in one message. Export a backup from Settings.'
};

export function relativeTime(at: number | null, now: number): string {
	if (at === null) return 'never';
	const minutes = Math.floor(Math.max(0, now - at) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
	const days = Math.floor(hours / 24);
	return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
