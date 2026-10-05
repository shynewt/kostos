import * as Y from 'yjs';
import { RoomPersistence } from './persistence';
import { browser } from '$app/environment';
import { findProject, getCurrentMember } from '$lib/storage';
import {
	DEFAULT_CATEGORIES,
	DEFAULT_PAYMENT_METHODS,
	type ActivityChange,
	type ActivityEvent,
	type Category,
	type Expense,
	type ExpenseSplit,
	type Member,
	type Payment,
	type PaymentMethodItem,
	type Project,
	type Trip
} from '$lib/types';
import { diffExpense } from './activity-diff';
import { createSyncProvider, type EncryptedSyncProvider } from './provider';

function syncUrl(): string {
	const env = (import.meta.env.VITE_SYNC_URL as string | undefined) ?? '';
	if (env) return env;
	if (typeof location === 'undefined') return '';
	const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
	return `${scheme}://${location.host}/sync`;
}

export type RoomHandle = {
	roomId: string;
	doc: Y.Doc;
	project: Y.Map<unknown>;
	members: Y.Array<Y.Map<unknown>>;
	expenses: Y.Array<Y.Map<unknown>>;
	activity: Y.Array<Y.Map<unknown>>;
	ready: Promise<void>;
	syncProvider?: EncryptedSyncProvider;
	persistence?: RoomPersistence;
};

type CacheEntry = {
	handle: RoomHandle;
	persistence?: RoomPersistence;
	secret?: string;
};

const cache = new Map<string, CacheEntry>();

export function openRoom(roomId: string, secret?: string): RoomHandle {
	const cached = cache.get(roomId);
	if (cached) {
		// A corrected invite must replace the provider using the previous key.
		const effectiveSecret = secret ?? secretFromStorage(roomId);
		if (browser && effectiveSecret && (!cached.handle.syncProvider || cached.secret !== effectiveSecret)) {
			cached.handle.syncProvider?.destroy();
			cached.handle.syncProvider = createSyncProvider(cached.handle.doc, syncUrl(), roomId, effectiveSecret, cached.persistence) ?? undefined;
			cached.secret = effectiveSecret;
		}
		return cached.handle;
	}

	const doc = new Y.Doc();
	const project = doc.getMap('project');
	const members = doc.getArray<Y.Map<unknown>>('members');
	const expenses = doc.getArray<Y.Map<unknown>>('expenses');
	const activity = doc.getArray<Y.Map<unknown>>('activity');

	let persistence: RoomPersistence | undefined;
	let ready: Promise<void>;
	if (browser) {
		persistence = new RoomPersistence(`kostos:${roomId}`, doc);
		ready = persistence.ready;
	} else {
		ready = Promise.resolve();
	}

	let syncProvider: EncryptedSyncProvider | undefined;
	if (browser) {
		const effectiveSecret = secret ?? secretFromStorage(roomId);
		if (effectiveSecret) {
			syncProvider =
				createSyncProvider(doc, syncUrl(), roomId, effectiveSecret, persistence) ?? undefined;
		}
	}

	const handle: RoomHandle = {
		roomId,
		doc,
		project,
		members,
		expenses,
		activity,
		ready,
		syncProvider,
		persistence
	};
	cache.set(roomId, { handle, persistence, secret: secret ?? secretFromStorage(roomId) });
	return handle;
}

function secretFromStorage(roomId: string): string | undefined {
	return findProject(roomId)?.secret;
}

export async function destroyRoom(roomId: string): Promise<void> {
	const entry = cache.get(roomId);
	if (!entry) return;
	if (entry.handle.syncProvider) entry.handle.syncProvider.destroy();
	if (entry.persistence) {
		await entry.persistence.destroy();
		await entry.persistence.clearData();
	}
	entry.handle.doc.destroy();
	cache.delete(roomId);
}

export function readProject(handle: RoomHandle): Project | null {
	const p = handle.project;
	if (!p.has('id')) return null;
	const rawCategories = p.get('categories') as Y.Array<Y.Map<unknown>> | undefined;
	// Projects created before categories existed return the curated default set so the
	// picker isn't empty; the Y.Array gets materialised the first time addCategory fires.
	const categories: Category[] = rawCategories
		? rawCategories.toArray().map((c) => ({
				id: c.get('id') as string,
				name: c.get('name') as string,
				emoji: c.get('emoji') as string
			}))
		: DEFAULT_CATEGORIES;
	const rawMethods = p.get('paymentMethods') as Y.Array<Y.Map<unknown>> | undefined;
	const paymentMethods: PaymentMethodItem[] = rawMethods
		? rawMethods.toArray().map((m) => ({
				id: m.get('id') as string,
				name: m.get('name') as string,
				emoji: m.get('emoji') as string
			}))
		: DEFAULT_PAYMENT_METHODS;
	const rawTrips = p.get('trips') as Y.Array<Y.Map<unknown>> | undefined;
	const trips: Trip[] = rawTrips ? rawTrips.toArray().map(tripFromMap) : [];
	return {
		id: p.get('id') as string,
		name: p.get('name') as string,
		description: p.get('description') as string | undefined,
		emoji: (p.get('emoji') as string | undefined) ?? '🏖',
		color: (p.get('color') as Project['color']) ?? 'lime',
		currency: p.get('currency') as string,
		currencySymbol: p.get('currencySymbol') as string,
		defaultSplit: p.get('defaultSplit') as Project['defaultSplit'],
		// default on for projects created before the flag existed
		autoFetchRates: (p.get('autoFetchRates') as boolean | undefined) ?? true,
		paymentMethodsEnabled: (p.get('paymentMethodsEnabled') as boolean | undefined) ?? true,
		categories,
		paymentMethods,
		trips,
		createdAt: p.get('createdAt') as number
	};
}

export function readMembers(handle: RoomHandle): Member[] {
	return handle.members.toArray().map((m) => ({
		id: m.get('id') as string,
		name: m.get('name') as string,
		color: (m.get('color') as string | undefined) || undefined,
		emoji: (m.get('emoji') as string | undefined) || undefined,
		createdAt: m.get('createdAt') as number
	}));
}

export function initProject(handle: RoomHandle, project: Project, members: Member[]): void {
	if (handle.project.has('id')) return; // idempotent: never overwrite an existing project header
	handle.doc.transact(() => {
		handle.project.set('id', project.id);
		handle.project.set('name', project.name);
		if (project.description) handle.project.set('description', project.description);
		handle.project.set('emoji', project.emoji);
		handle.project.set('color', project.color);
		handle.project.set('currency', project.currency);
		handle.project.set('currencySymbol', project.currencySymbol);
		handle.project.set('defaultSplit', project.defaultSplit);
		if (project.autoFetchRates !== undefined) {
			handle.project.set('autoFetchRates', project.autoFetchRates);
		}
		if (project.paymentMethodsEnabled !== undefined) {
			handle.project.set('paymentMethodsEnabled', project.paymentMethodsEnabled);
		}
		handle.project.set('createdAt', project.createdAt);
		handle.project.set('categories', yArrayOf(project.categories, categoryMap));
		handle.project.set('paymentMethods', yArrayOf(project.paymentMethods, paymentMethodMap));
		if (project.trips && project.trips.length > 0) {
			handle.project.set('trips', yArrayOf(project.trips, tripMap));
		}

		for (const m of members) handle.members.push([memberMap(m)]);
	});
}

export function addCategory(handle: RoomHandle, category: Category): void {
	handle.doc.transact(() => {
		let arr = handle.project.get('categories') as Y.Array<Y.Map<unknown>> | undefined;
		if (!arr) {
			arr = new Y.Array<Y.Map<unknown>>();
			handle.project.set('categories', arr);
			for (const c of DEFAULT_CATEGORIES) arr.push([categoryMap(c)]);
		}
		arr.push([categoryMap(category)]);
	});
}

export function addPaymentMethod(handle: RoomHandle, method: PaymentMethodItem): void {
	handle.doc.transact(() => {
		let arr = handle.project.get('paymentMethods') as Y.Array<Y.Map<unknown>> | undefined;
		if (!arr) {
			arr = new Y.Array<Y.Map<unknown>>();
			handle.project.set('paymentMethods', arr);
			for (const m of DEFAULT_PAYMENT_METHODS) arr.push([paymentMethodMap(m)]);
		}
		arr.push([paymentMethodMap(method)]);
	});
}

function categoryMap(c: Category): Y.Map<unknown> {
	const ym = new Y.Map<unknown>();
	ym.set('id', c.id);
	ym.set('name', c.name);
	ym.set('emoji', c.emoji);
	return ym;
}

function paymentMethodMap(p: PaymentMethodItem): Y.Map<unknown> {
	const ym = new Y.Map<unknown>();
	ym.set('id', p.id);
	ym.set('name', p.name);
	ym.set('emoji', p.emoji);
	return ym;
}

function tripMap(t: Trip): Y.Map<unknown> {
	const ym = new Y.Map<unknown>();
	ym.set('id', t.id);
	ym.set('name', t.name);
	ym.set('emoji', t.emoji);
	ym.set('startDate', t.startDate);
	if (t.endDate !== undefined) ym.set('endDate', t.endDate);
	if (t.closedAt !== undefined) ym.set('closedAt', t.closedAt);
	ym.set('createdAt', t.createdAt);
	return ym;
}

function tripFromMap(m: Y.Map<unknown>): Trip {
	return {
		id: m.get('id') as string,
		name: m.get('name') as string,
		emoji: m.get('emoji') as string,
		startDate: m.get('startDate') as number,
		endDate: m.get('endDate') as number | undefined,
		closedAt: m.get('closedAt') as number | undefined,
		createdAt: m.get('createdAt') as number
	};
}

function yArrayOf<T>(items: T[], toMap: (item: T) => Y.Map<unknown>): Y.Array<Y.Map<unknown>> {
	const arr = new Y.Array<Y.Map<unknown>>();
	for (const item of items) arr.push([toMap(item)]);
	return arr;
}

export function addMember(handle: RoomHandle, member: Member): void {
	handle.doc.transact(() => {
		handle.members.push([memberMap(member)]);
		logActivity(handle, { kind: 'member.add', memberId: member.id, label: member.name });
	});
}

export function updateMember(handle: RoomHandle, id: string, updates: Partial<Omit<Member, 'id'>>): void {
	for (let i = 0; i < handle.members.length; i++) {
		const entry = handle.members.get(i);
		if (entry.get('id') !== id) continue;
		const prevName = entry.get('name') as string;
		handle.doc.transact(() => {
			if (updates.name !== undefined) entry.set('name', updates.name);
			if (updates.color !== undefined) entry.set('color', updates.color);
			// empty string clears the emoji back to the name-initial glyph
			if (updates.emoji !== undefined) entry.set('emoji', updates.emoji);
			if (updates.name !== undefined && updates.name !== prevName) {
				logActivity(handle, {
					kind: 'member.rename',
					memberId: id,
					label: updates.name,
					change: { kind: 'text', from: prevName, to: updates.name }
				});
			}
		});
		return;
	}
}

export function removeMember(handle: RoomHandle, id: string): void {
	for (let i = 0; i < handle.members.length; i++) {
		const entry = handle.members.get(i);
		if (entry.get('id') === id) {
			const name = entry.get('name') as string;
			handle.doc.transact(() => {
				handle.members.delete(i, 1);
				logActivity(handle, { kind: 'member.remove', memberId: id, label: name });
			});
			return;
		}
	}
}

export function updateProject(
	handle: RoomHandle,
	updates: Partial<
		Pick<
			Project,
			| 'name'
			| 'description'
			| 'emoji'
			| 'color'
			| 'currency'
			| 'currencySymbol'
			| 'defaultSplit'
			| 'autoFetchRates'
			| 'paymentMethodsEnabled'
		>
	>
): void {
	handle.doc.transact(() => {
		for (const [key, value] of Object.entries(updates)) {
			if (value === undefined) continue;
			if (value === '' && key === 'description') {
				handle.project.delete('description');
			} else {
				handle.project.set(key, value);
			}
		}
	});
}

export function updateCategory(handle: RoomHandle, id: string, updates: Partial<Omit<Category, 'id'>>): void {
	const arr = handle.project.get('categories') as Y.Array<Y.Map<unknown>> | undefined;
	if (!arr) return;
	for (let i = 0; i < arr.length; i++) {
		const entry = arr.get(i);
		if (entry.get('id') !== id) continue;
		handle.doc.transact(() => {
			if (updates.name !== undefined) entry.set('name', updates.name);
			if (updates.emoji !== undefined) entry.set('emoji', updates.emoji);
		});
		return;
	}
}

export function removeCategory(handle: RoomHandle, id: string): void {
	const arr = handle.project.get('categories') as Y.Array<Y.Map<unknown>> | undefined;
	if (!arr) return;
	for (let i = 0; i < arr.length; i++) {
		if (arr.get(i).get('id') === id) {
			handle.doc.transact(() => arr.delete(i, 1));
			return;
		}
	}
}

export function updatePaymentMethod(
	handle: RoomHandle,
	id: string,
	updates: Partial<Omit<PaymentMethodItem, 'id'>>
): void {
	const arr = handle.project.get('paymentMethods') as Y.Array<Y.Map<unknown>> | undefined;
	if (!arr) return;
	for (let i = 0; i < arr.length; i++) {
		const entry = arr.get(i);
		if (entry.get('id') !== id) continue;
		handle.doc.transact(() => {
			if (updates.name !== undefined) entry.set('name', updates.name);
			if (updates.emoji !== undefined) entry.set('emoji', updates.emoji);
		});
		return;
	}
}

export function removePaymentMethod(handle: RoomHandle, id: string): void {
	const arr = handle.project.get('paymentMethods') as Y.Array<Y.Map<unknown>> | undefined;
	if (!arr) return;
	for (let i = 0; i < arr.length; i++) {
		if (arr.get(i).get('id') === id) {
			handle.doc.transact(() => arr.delete(i, 1));
			return;
		}
	}
}

export function addTrip(handle: RoomHandle, trip: Trip): void {
	handle.doc.transact(() => {
		let arr = handle.project.get('trips') as Y.Array<Y.Map<unknown>> | undefined;
		if (!arr) {
			arr = new Y.Array<Y.Map<unknown>>();
			handle.project.set('trips', arr);
		}
		arr.push([tripMap(trip)]);
	});
}

export function updateTrip(
	handle: RoomHandle,
	id: string,
	updates: Partial<Omit<Trip, 'id' | 'createdAt'>>
): void {
	const arr = handle.project.get('trips') as Y.Array<Y.Map<unknown>> | undefined;
	if (!arr) return;
	for (let i = 0; i < arr.length; i++) {
		const entry = arr.get(i);
		if (entry.get('id') !== id) continue;
		handle.doc.transact(() => {
			if (updates.name !== undefined) entry.set('name', updates.name);
			if (updates.emoji !== undefined) entry.set('emoji', updates.emoji);
			if (updates.startDate !== undefined) entry.set('startDate', updates.startDate);
			if (updates.endDate === undefined && 'endDate' in updates) entry.delete('endDate');
			else if (updates.endDate !== undefined) entry.set('endDate', updates.endDate);
			if (updates.closedAt === undefined && 'closedAt' in updates) entry.delete('closedAt');
			else if (updates.closedAt !== undefined) entry.set('closedAt', updates.closedAt);
		});
		return;
	}
}

/** Tag existing expenses with a trip in one transaction; used when a trip is created after
 *  the fact. Not logged: it moves no money and the activity feed would just fill up. */
export function assignExpensesToTrip(handle: RoomHandle, expenseIds: string[], tripId: string): void {
	const ids = new Set(expenseIds);
	handle.doc.transact(() => {
		for (const expense of readExpenses(handle)) {
			if (ids.has(expense.id)) writeExpenseVersion(handle, { ...expense, tripId });
		}
	});
}

/** Removing a trip leaves any expenses tagged with it as orphans. Their tripId still
 *  serializes but readers should treat unknown trip IDs as untagged. */
export function removeTrip(handle: RoomHandle, id: string): void {
	const arr = handle.project.get('trips') as Y.Array<Y.Map<unknown>> | undefined;
	if (!arr) return;
	for (let i = 0; i < arr.length; i++) {
		if (arr.get(i).get('id') === id) {
			handle.doc.transact(() => arr.delete(i, 1));
			return;
		}
	}
}

/** How many expenses reference this member (as payer, as split target, or as createdBy). */
export function memberHistoryCount(handle: RoomHandle, memberId: string): number {
	const expenses = readExpenses(handle);
	let count = 0;
	for (const e of expenses) {
		if (e.createdBy === memberId) count += 1;
		else if (e.payments.some((p) => p.memberId === memberId)) count += 1;
		else if (e.splits.some((s) => s.memberId === memberId)) count += 1;
	}
	return count;
}

export type ExpenseVersion = { id: string; expense: Expense; parents: string[]; at: number; by: string | null };

function legacyVersion(entry: Y.Map<unknown>): ExpenseVersion {
	const item = entry._item;
	return {
		id: `legacy:${item?.id.client}:${item?.id.clock}`,
		expense: readExpenseEntry(entry), parents: [], at: entry.get('createdAt') as number, by: null
	};
}

/** Retain all revision branches. One atomic expense snapshot wins deterministically;
 * competing heads remain available for review, never counted as extra spending. */
export function expenseVersions(handle: RoomHandle, id: string): ExpenseVersion[] {
	return versionHeads(handle, id, handle.expenses.toArray().filter((entry) => entry.get('id') === id));
}

function versionHeads(handle: RoomHandle, id: string, entries: Y.Map<unknown>[]): ExpenseVersion[] {
	const versions = new Map(handle.doc.getMap<ExpenseVersion>(`expense-revisions:${id}`));
	for (const entry of entries) {
		const key = `legacy:${entry._item?.id.client}:${entry._item?.id.clock}`;
		if (!versions.has(key)) versions.set(key, legacyVersion(entry));
	}
	const parents = new Set([...versions.values()].flatMap((v) => v.parents));
	return [...versions.values()].filter((v) => !parents.has(v.id)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function groupedExpenses(handle: RoomHandle): Map<string, Y.Map<unknown>[]> {
	const groups = new Map<string, Y.Map<unknown>[]>();
	for (const entry of handle.expenses.toArray()) {
		const id = entry.get('id') as string;
		const group = groups.get(id);
		if (group) group.push(entry); else groups.set(id, [entry]);
	}
	return groups;
}

export function readExpenses(handle: RoomHandle): Expense[] {
	return [...groupedExpenses(handle)].flatMap(([id, entries]) => {
		const heads = versionHeads(handle, id, entries);
		return heads.length ? [structuredClone(heads[heads.length - 1].expense)] : [];
	});
}

export function readExpenseConflicts(handle: RoomHandle): { id: string; versions: ExpenseVersion[] }[] {
	return [...groupedExpenses(handle)].flatMap(([id, entries]) => {
		const versions = versionHeads(handle, id, entries);
		return versions.length > 1 ? [{ id, versions }] : [];
	});
}

function writeExpenseVersion(handle: RoomHandle, expense: Expense, parents?: string[]): void {
	const entries = handle.expenses.toArray().filter((entry) => entry.get('id') === expense.id);
	const entry = entries[0];
	if (!entry) return;
	const heads = expenseVersions(handle, expense.id);
	const revisions = handle.doc.getMap<ExpenseVersion>(`expense-revisions:${expense.id}`);
	for (const head of heads) if (!revisions.has(head.id)) revisions.set(head.id, head);
	const id = generateId();
	revisions.set(id, { id, expense: JSON.parse(JSON.stringify(expense)), parents: parents ?? heads.map((v) => v.id), at: Date.now(), by: getCurrentMember(handle.roomId) });
	// Mirror fields for pre-revision clients without deleting the stable record.
	for (const key of [...entry.keys()]) if (!(key in expense)) entry.delete(key);
	expenseMap(expense, entry);
}

export function resolveExpenseConflict(handle: RoomHandle, id: string, versionId: string): void {
	const chosen = expenseVersions(handle, id).find((v) => v.id === versionId);
	if (!chosen) return;
	handle.doc.transact(() => {
		updateExpense(handle, chosen.expense);
		logActivity(handle, { kind: 'expense.resolve', expenseId: id, label: expenseLabel(handle, chosen.expense), amount: chosen.expense.amount, currency: chosen.expense.currency });
	});
}

const ACTIVITY_CAP = 500;

function parseChange(raw: string | undefined): ActivityChange | undefined {
	if (!raw) return undefined;
	// a corrupt entry from a buggy/hostile peer must not break the whole log
	try {
		return JSON.parse(raw) as ActivityChange;
	} catch {
		return undefined;
	}
}

export function readActivity(handle: RoomHandle): ActivityEvent[] {
	return handle.activity.toArray().map((m) => ({
		id: m.get('id') as string,
		at: m.get('at') as number,
		by: (m.get('by') as string | null) ?? null,
		kind: m.get('kind') as ActivityEvent['kind'],
		expenseId: m.get('expenseId') as string | undefined,
		memberId: m.get('memberId') as string | undefined,
		label: m.get('label') as string | undefined,
		amount: m.get('amount') as number | undefined,
		currency: m.get('currency') as string | undefined,
		change: parseChange(m.get('change') as string | undefined)
	}));
}

/** Append an event to the room log. Call inside the mutating transaction so the
 *  log entry syncs atomically with the change it describes. */
function logActivity(handle: RoomHandle, ev: Omit<ActivityEvent, 'id' | 'at' | 'by'>): void {
	const map = new Y.Map<unknown>();
	map.set('id', generateId());
	map.set('at', Date.now());
	map.set('by', getCurrentMember(handle.roomId) ?? null);
	map.set('kind', ev.kind);
	if (ev.expenseId) map.set('expenseId', ev.expenseId);
	if (ev.memberId) map.set('memberId', ev.memberId);
	if (ev.label !== undefined) map.set('label', ev.label);
	if (ev.amount !== undefined) map.set('amount', ev.amount);
	if (ev.currency !== undefined) map.set('currency', ev.currency);
	if (ev.change) map.set('change', JSON.stringify(ev.change));
	handle.activity.push([map]);
	const over = handle.activity.length - ACTIVITY_CAP;
	if (over > 0) handle.activity.delete(0, over);
}

/** Snapshot label for an expense in the activity log: the category emoji (if any)
 *  prefixed to the description, e.g. "🍕 Dinner". Reads the live category set so the
 *  glyph matches what the user saw when the event fired. */
function expenseLabel(handle: RoomHandle, expense: Expense): string {
	const name = expense.description || 'Expense';
	if (!expense.categoryId) return name;
	const raw = handle.project.get('categories') as Y.Array<Y.Map<unknown>> | undefined;
	const list = raw
		? raw.toArray().map((c) => ({ id: c.get('id') as string, emoji: c.get('emoji') as string }))
		: DEFAULT_CATEGORIES;
	const emoji = list.find((c) => c.id === expense.categoryId)?.emoji;
	return emoji ? `${emoji} ${name}` : name;
}

export function addExpense(handle: RoomHandle, expense: Expense): void {
	if (handle.expenses.toArray().some((e) => e.get('id') === expense.id)) return;
	handle.doc.transact(() => {
		handle.expenses.push([expenseMap(expense)]);
		logActivity(
			handle,
			expense.isSettlement
				? {
						kind: 'settle.add',
						expenseId: expense.id,
						memberId: expense.splits[0]?.memberId,
						amount: expense.amount,
						currency: expense.currency
					}
				: {
						kind: 'expense.add',
						expenseId: expense.id,
						label: expenseLabel(handle, expense),
						amount: expense.amount,
						currency: expense.currency
					}
		);
	});
}

export function removeExpense(handle: RoomHandle, id: string): void {
	const expense = readExpenses(handle).find((e) => e.id === id);
	if (!expense) return;
	handle.doc.transact(() => {
		for (let i = handle.expenses.length - 1; i >= 0; i--) {
			if (handle.expenses.get(i).get('id') === id) handle.expenses.delete(i, 1);
		}
		logActivity(handle, { kind: 'expense.remove', expenseId: id, label: expenseLabel(handle, expense) });
	});
}

export function updateExpense(handle: RoomHandle, expense: Expense, parents?: string[]): void {
	const prev = readExpenses(handle).find((e) => e.id === expense.id);
	if (!prev) return;
	const changes = diffExpense(prev, expense);
	handle.doc.transact(() => {
		writeExpenseVersion(handle, expense, parents);
		for (const change of changes) logActivity(handle, { kind: 'expense.edit', expenseId: expense.id, label: expenseLabel(handle, expense), change });
	});
}

function readExpenseEntry(entry: Y.Map<unknown>): Expense {
	const rawSplits = entry.get('splits') as Y.Array<Y.Map<unknown>> | undefined;
	const splits: ExpenseSplit[] = rawSplits
		? rawSplits.toArray().map((s) => ({
				memberId: s.get('memberId') as string,
				shares: s.get('shares') as number | undefined,
				amount: s.get('amount') as number | undefined
			}))
		: [];
	const rawPayments = entry.get('payments') as Y.Array<Y.Map<unknown>> | undefined;
	const payments: Payment[] = rawPayments
		? rawPayments.toArray().map((p) => ({
				memberId: p.get('memberId') as string,
				amount: p.get('amount') as number
			}))
		: [];
	return {
		id: entry.get('id') as string,
		payments,
		amount: entry.get('amount') as number,
		currency: entry.get('currency') as string,
		exchangeRate: entry.get('exchangeRate') as number | undefined,
		rateFetchedAt: entry.get('rateFetchedAt') as number | undefined,
		chargedAmount: entry.get('chargedAmount') as number | undefined,
		marketRate: entry.get('marketRate') as number | undefined,
		description: entry.get('description') as string | undefined,
		categoryId: entry.get('categoryId') as string | undefined,
		paymentMethodId: entry.get('paymentMethodId') as string | undefined,
		tripId: entry.get('tripId') as string | undefined,
		date: entry.get('date') as number,
		splitMode: entry.get('splitMode') as Expense['splitMode'],
		splits,
		notes: entry.get('notes') as string | undefined,
		isSettlement: entry.get('isSettlement') as boolean | undefined,
		createdAt: entry.get('createdAt') as number,
		createdBy: entry.get('createdBy') as string
	};
}

function expenseMap(e: Expense, ym = new Y.Map<unknown>()): Y.Map<unknown> {
	ym.set('id', e.id);
	const ypayments = new Y.Array<Y.Map<unknown>>();
	for (const p of e.payments) {
		const yp = new Y.Map<unknown>();
		yp.set('memberId', p.memberId);
		yp.set('amount', p.amount);
		ypayments.push([yp]);
	}
	ym.set('payments', ypayments);
	ym.set('amount', e.amount);
	ym.set('currency', e.currency);
	if (e.exchangeRate !== undefined) ym.set('exchangeRate', e.exchangeRate);
	if (e.rateFetchedAt !== undefined) ym.set('rateFetchedAt', e.rateFetchedAt);
	if (e.chargedAmount !== undefined) ym.set('chargedAmount', e.chargedAmount);
	if (e.marketRate !== undefined) ym.set('marketRate', e.marketRate);
	if (e.description) ym.set('description', e.description);
	if (e.categoryId) ym.set('categoryId', e.categoryId);
	if (e.paymentMethodId) ym.set('paymentMethodId', e.paymentMethodId);
	if (e.tripId) ym.set('tripId', e.tripId);
	ym.set('date', e.date);
	ym.set('splitMode', e.splitMode);
	const ysplits = new Y.Array<Y.Map<unknown>>();
	for (const s of e.splits) {
		const ys = new Y.Map<unknown>();
		ys.set('memberId', s.memberId);
		if (s.shares !== undefined) ys.set('shares', s.shares);
		if (s.amount !== undefined) ys.set('amount', s.amount);
		ysplits.push([ys]);
	}
	ym.set('splits', ysplits);
	if (e.notes) ym.set('notes', e.notes);
	if (e.isSettlement) ym.set('isSettlement', true);
	ym.set('createdAt', e.createdAt);
	ym.set('createdBy', e.createdBy);
	return ym;
}

function memberMap(m: Member): Y.Map<unknown> {
	const ym = new Y.Map<unknown>();
	ym.set('id', m.id);
	ym.set('name', m.name);
	if (m.color) ym.set('color', m.color);
	if (m.emoji) ym.set('emoji', m.emoji);
	ym.set('createdAt', m.createdAt);
	return ym;
}

export function generateId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	let hex = '';
	for (const b of bytes) hex += b.toString(16).padStart(2, '0');
	return hex;
}
