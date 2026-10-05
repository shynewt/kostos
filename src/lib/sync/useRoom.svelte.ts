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
import type { LocalState } from './persistence';

import type {
	ActivityEvent,
	Category,
	Expense,
	Member,
	PaymentMethodItem,
	Project,
	Trip
} from '$lib/types';

export class RoomState {
	handle: RoomHandle;
	project = $state<Project | null>(null);
	members = $state<Member[]>([]);
	expenses = $state<Expense[]>([]);
	activity = $state<ActivityEvent[]>([]);
	sync = $state<SyncStatus>(LOCAL_STATUS);
	local = $state<LocalState | null>(null);
	conflicts = $state<ReturnType<typeof readExpenseConflicts>>([]);
	checking = $derived(this.sync.checking && ['loading', 'connecting', 'syncing'].includes(this.sync.phase));

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
		this.refresh();
	}

	private refresh = () => {
		this.project = readProject(this.handle);
		this.members = readMembers(this.handle);
		this.expenses = readExpenses(this.handle);
		this.activity = readActivity(this.handle);
		this.conflicts = readExpenseConflicts(this.handle);
	};

	/** Attach Yjs observers + return a teardown function suitable for $effect cleanup. */
	observe(): () => void {
		this.refresh();
		this.handle.doc.on('afterTransaction', this.refresh);
		const offSync = this.handle.syncProvider?.onStatusChange((status) => { this.sync = status; });
		const offLocal = this.handle.persistence?.onChange((state) => { this.local = state; });
		return () => {
			this.handle.doc.off('afterTransaction', this.refresh);
			offSync?.();
			offLocal?.();
		};
	}
}

export function useRoom(roomId: string, secret?: string): RoomState {
	return new RoomState(openRoom(roomId, secret));
}
