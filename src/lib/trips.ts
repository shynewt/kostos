/* Trip selection + scoping helpers.
 *
 * The current trip selection is per-device, not synced: different members may want to
 * focus on different trips at the same time. It lives in localStorage keyed by roomId,
 * with `''` meaning "All".
 *
 * Pure helpers (`scopeExpenses`, `suggestTripIdForDate`) don't touch storage and are easy
 * to test. The localStorage reads/writes are thin wrappers.
 */

import { browser } from '$app/environment';
import type { Expense, Trip } from './types';

const SELECTION_KEY = (roomId: string) => `kostos:trip_for:${roomId}`;
const INTRO_DISMISSED_KEY = (roomId: string) => `kostos:trips_intro_dismissed:${roomId}`;

/** Read the saved selection for a room. Returns null for "All" or unknown. */
export function readTripSelection(roomId: string): string | null {
	if (!browser || !roomId) return null;
	try {
		const v = localStorage.getItem(SELECTION_KEY(roomId));
		return v && v.length > 0 ? v : null;
	} catch {
		return null;
	}
}

/** Persist a selection. Pass null to clear (back to "All"). */
export function writeTripSelection(roomId: string, tripId: string | null): void {
	if (!browser || !roomId) return;
	try {
		if (tripId === null) localStorage.removeItem(SELECTION_KEY(roomId));
		else localStorage.setItem(SELECTION_KEY(roomId), tripId);
	} catch {
		// quota / private-mode: silently ignore
	}
}

/** Filter expenses to those matching a tripId selection.
 *  null selection → return everything (the "All" bucket). */
export function scopeExpenses(expenses: Expense[], tripId: string | null): Expense[] {
	if (tripId === null) return expenses;
	return expenses.filter((e) => e.tripId === tripId);
}

/** How many days a trip stays in the "active" bucket after its endDate. Trips drop
 *  off the chip strip after this window but remain reachable via the overflow sheet. */
export const ACTIVE_TRIP_GRACE_DAYS = 30;

/** A trip is active when (1) it hasn't been manually closed and (2) it's either
 *  open-ended OR its endDate is within ACTIVE_TRIP_GRACE_DAYS of `now`. */
export function isTripActive(trip: Trip, now: number = Date.now()): boolean {
	if (trip.closedAt !== undefined) return false;
	if (trip.endDate === undefined) return true;
	const grace = ACTIVE_TRIP_GRACE_DAYS * 86_400_000;
	return trip.endDate >= now - grace;
}

/** Split the trip list into active and past buckets in display order.
 *  Active: open-ended first, then ascending by startDate (next upcoming on the left).
 *  Past: descending by endDate (most-recently-finished first). */
export function partitionTrips(
	trips: Trip[],
	now: number = Date.now()
): { active: Trip[]; past: Trip[] } {
	const active: Trip[] = [];
	const past: Trip[] = [];
	for (const t of trips) {
		if (isTripActive(t, now)) active.push(t);
		else past.push(t);
	}
	active.sort((a, b) => {
		const aOpen = a.endDate === undefined;
		const bOpen = b.endDate === undefined;
		if (aOpen !== bOpen) return aOpen ? -1 : 1;
		return a.startDate - b.startDate;
	});
	past.sort((a, b) => {
		const aRef = a.endDate ?? a.startDate;
		const bRef = b.endDate ?? b.startDate;
		return bRef - aRef;
	});
	return { active, past };
}

/** Find the trip whose date range contains the given timestamp. Open-ended trips
 *  (no endDate) match any date >= startDate. Returns null when none qualify. If
 *  multiple match (overlapping trips), the most recently started wins. */
export function suggestTripIdForDate(trips: Trip[], dateMs: number): string | null {
	const active = trips.filter((t) => t.closedAt === undefined && tripCoversDate(t, dateMs));
	if (active.length === 0) return null;
	active.sort((a, b) => b.startDate - a.startDate);
	return active[0].id;
}

/** Day-granular range check; open-ended trips cover every day from their start. */
export function tripCoversDate(trip: Trip, dateMs: number): boolean {
	const day = startOfDay(dateMs);
	if (startOfDay(trip.startDate) > day) return false;
	return trip.endDate === undefined || day <= startOfDay(trip.endDate);
}

/** Expenses dated inside the trip that belong to no trip yet, so the user can pull them in
 *  after creating a trip late. Tags pointing at deleted trips count as untagged; expenses
 *  already in another trip and settlements are left alone. */
export function untaggedExpensesInTrip(expenses: Expense[], trip: Trip, trips: Trip[]): Expense[] {
	const known = new Set(trips.map((t) => t.id));
	return expenses.filter(
		(e) =>
			!e.isSettlement &&
			(!e.tripId || !known.has(e.tripId)) &&
			e.tripId !== trip.id &&
			tripCoversDate(trip, e.date)
	);
}

function startOfDay(ms: number): number {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** Has the user dismissed the "trips" intro card for this project? */
export function readTripsIntroDismissed(roomId: string): boolean {
	if (!browser || !roomId) return false;
	try {
		return localStorage.getItem(INTRO_DISMISSED_KEY(roomId)) === '1';
	} catch {
		return false;
	}
}

export function dismissTripsIntro(roomId: string): void {
	if (!browser || !roomId) return;
	try {
		localStorage.setItem(INTRO_DISMISSED_KEY(roomId), '1');
	} catch {
		// quota / private mode: silently ignore
	}
}
