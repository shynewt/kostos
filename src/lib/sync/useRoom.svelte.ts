/* Reactive accessor for a room's state.
 *
 * Every route under /p/[roomId] needs the same boilerplate: open the room, observe the
 * project/members/expenses Y collections, and re-sync local $state when anything changes.
 * `useRoom(roomId)` returns a reactive container with `.project`, `.members`, `.expenses`,
 * plus the underlying `handle` (for mutators that need it). The caller wires lifecycle
 * via `$effect(() => room.observe())` so cleanup happens naturally on unmount.
 */

import {
	openRoom,
	readActivity,
	readExpenses,
	readExpenseConflicts,
	readMembers,
	readProject,
	type RoomHandle
} from './doc';
import { LOCAL_STATUS, type SyncStatus } from './status';
import { REMOTE_ORIGIN, type LocalState } from './persistence';

import type {
	ActivityEvent,
	Category,
	Expense,
	Member,
	PaymentMethodItem,
	Project,
	Trip
} from '$lib/types';

/** Rooms whose first freshness check has ended, however it ended. Later reconnects keep
 *  showing the data already on screen instead of bringing the loading placeholder back. */
const checked = new WeakSet<RoomHandle>();

export class RoomState {
	handle: RoomHandle;
	project = $state<Project | null>(null);
	members = $state<Member[]>([]);
	expenses = $state<Expense[]>([]);
	activity = $state<ActivityEvent[]>([]);
	sync = $state<SyncStatus>(LOCAL_STATUS);
	local = $state<LocalState | null>(null);
	conflicts = $state<ReturnType<typeof readExpenseConflicts>>([]);
	private firstCheckDone = $state(false);
	checking = $derived(!this.firstCheckDone && this.sync.checking && ['loading', 'connecting', 'syncing'].includes(this.sync.phase));
	/** Nothing on this phone yet (a fresh join), so a placeholder beats showing an empty group. */
	blank = $derived(this.checking && this.project === null);

	// Lookup maps + display helpers that every route ends up rebuilding. Keeping them on
	// the room itself means each component just consumes them; no per-route boilerplate.
	membersById = $derived(new Map(this.members.map((m) => [m.id, m])));
	categoryById = $derived<Map<string, Category>>(
		new Map((this.project?.categories ?? []).map((c) => [c.id, c]))
	);
	// empty when the group turned payment methods off, so rows and search skip them
	methodById = $derived<Map<string, PaymentMethodItem>>(
		this.project?.paymentMethodsEnabled === false
			? new Map()
			: new Map((this.project?.paymentMethods ?? []).map((m) => [m.id, m]))
	);
	trips = $derived<Trip[]>(this.project?.trips ?? []);
	tripsById = $derived<Map<string, Trip>>(new Map(this.trips.map((t) => [t.id, t])));
	currencySymbol = $derived(this.project?.currencySymbol ?? '€');
	currency = $derived(this.project?.currency ?? 'EUR');

	constructor(handle: RoomHandle) {
		this.handle = handle;
		this.sync = handle.syncProvider?.snapshot ?? LOCAL_STATUS;
		this.local = handle.persistence?.state ?? null;
		this.noteStatus(this.sync);
		this.refresh();
	}

	private noteStatus(status: SyncStatus) {
		if (!status.checking) checked.add(this.handle);
		this.firstCheckDone = checked.has(this.handle);
	}

	private burst: ReturnType<typeof setTimeout> | null = null;

	/** Re-reading every expense after each message of a long history replay is what made big
	 *  groups slow to load, so remote bursts are folded into one read. Local edits stay instant. */
	private onTransaction = (transaction: { origin: unknown }) => {
		if (transaction.origin !== REMOTE_ORIGIN) { this.refresh(); return; }
		if (this.burst) return;
		this.burst = setTimeout(() => { this.burst = null; this.refresh(); }, 200);
	};

	private refresh = () => {
		if (this.burst) { clearTimeout(this.burst); this.burst = null; }
		this.project = readProject(this.handle);
		this.members = readMembers(this.handle);
		this.expenses = readExpenses(this.handle);
		this.activity = readActivity(this.handle);
		this.conflicts = readExpenseConflicts(this.handle);
	};

	/** Attach Yjs observers + return a teardown function suitable for $effect cleanup. */
	observe(): () => void {
		this.refresh();
		this.handle.doc.on('afterTransaction', this.onTransaction);
		const offSync = this.handle.syncProvider?.onStatusChange((status) => { this.sync = status; this.noteStatus(status); });
		const offLocal = this.handle.persistence?.onChange((state) => { this.local = state; });
		return () => {
			this.handle.doc.off('afterTransaction', this.onTransaction);
			if (this.burst) { clearTimeout(this.burst); this.burst = null; }
			offSync?.();
			offLocal?.();
		};
	}
}

export function useRoom(roomId: string, secret?: string): RoomState {
	return new RoomState(openRoom(roomId, secret));
}
