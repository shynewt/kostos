import { describe, expect, it } from 'vitest';
import {
	ACTIVE_TRIP_GRACE_DAYS,
	isTripActive,
	partitionTrips,
	scopeExpenses,
	suggestTripIdForDate,
	untaggedExpensesInTrip
} from './trips';
import type { Expense, Trip } from './types';

const expenseAt = (id: string, date: number, tripId?: string): Expense => ({
	id,
	payments: [],
	amount: 100,
	currency: 'EUR',
	date,
	splitMode: 'even',
	splits: [],
	createdAt: date,
	createdBy: 'm1',
	tripId
});

describe('scopeExpenses', () => {
	const all = [
		expenseAt('a', 1, 't1'),
		expenseAt('b', 2, 't2'),
		expenseAt('c', 3, undefined),
		expenseAt('d', 4, 't1')
	];

	it('returns everything when selection is null', () => {
		expect(scopeExpenses(all, null)).toHaveLength(4);
	});

	it('filters to expenses matching the tripId', () => {
		expect(scopeExpenses(all, 't1').map((e) => e.id)).toEqual(['a', 'd']);
	});

	it('excludes untagged expenses from any trip scope', () => {
		expect(scopeExpenses(all, 't2').map((e) => e.id)).toEqual(['b']);
	});
});

describe('suggestTripIdForDate', () => {
	const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

	const trips: Trip[] = [
		{
			id: 'lisbon',
			name: 'Lisbon',
			emoji: '🏖',
			startDate: day(2026, 6, 14),
			endDate: day(2026, 6, 17),
			createdAt: 0
		},
		{
			id: 'open',
			name: 'Open trip',
			emoji: '🌍',
			startDate: day(2026, 6, 1),
			createdAt: 0
		}
	];

	it('matches a date inside a closed range', () => {
		expect(suggestTripIdForDate(trips, day(2026, 6, 15))).toBe('lisbon');
	});

	it('matches open-ended trips when after their start', () => {
		expect(suggestTripIdForDate(trips, day(2026, 6, 30))).toBe('open');
	});

	it('returns null for dates outside every trip range', () => {
		expect(suggestTripIdForDate(trips, day(2026, 5, 1))).toBeNull();
	});

	it('picks the most recently started trip when multiple match', () => {
		const overlap: Trip[] = [
			{ id: 'older', name: '', emoji: '', startDate: day(2026, 6, 1), createdAt: 0 },
			{ id: 'newer', name: '', emoji: '', startDate: day(2026, 6, 10), createdAt: 0 }
		];
		expect(suggestTripIdForDate(overlap, day(2026, 6, 20))).toBe('newer');
	});

	it('ignores closed trips', () => {
		const closed: Trip[] = [
			{
				id: 'past',
				name: '',
				emoji: '',
				startDate: day(2026, 6, 1),
				endDate: day(2026, 12, 31),
				closedAt: day(2027, 1, 1),
				createdAt: 0
			}
		];
		expect(suggestTripIdForDate(closed, day(2026, 6, 15))).toBeNull();
	});
});

describe('isTripActive', () => {
	const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
	const trip = (overrides: Partial<Trip>): Trip => ({
		id: 't',
		name: 'T',
		emoji: '🏖',
		startDate: day(2026, 6, 1),
		endDate: day(2026, 6, 10),
		createdAt: 0,
		...overrides
	});

	const now = day(2026, 7, 1);

	it('treats open-ended trips as active', () => {
		expect(isTripActive(trip({ endDate: undefined }), now)).toBe(true);
	});

	it('treats trips inside the grace window as active', () => {
		const insideGrace = day(2026, 6, 25);
		expect(isTripActive(trip({ endDate: insideGrace }), now)).toBe(true);
	});

	it('treats trips beyond the grace window as past', () => {
		const beyondGrace = day(2026, 5, 25);
		expect(isTripActive(trip({ endDate: beyondGrace }), now)).toBe(false);
	});

	it('treats closed trips as past regardless of date', () => {
		expect(isTripActive(trip({ closedAt: now }), now)).toBe(false);
	});

	it('exposes the grace window as a constant', () => {
		expect(ACTIVE_TRIP_GRACE_DAYS).toBe(30);
	});
});

describe('partitionTrips', () => {
	const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
	const now = day(2026, 7, 1);

	it('sorts active trips with open-ended first, then by startDate ascending', () => {
		const trips: Trip[] = [
			{ id: 'b', name: '', emoji: '', startDate: day(2026, 7, 5), endDate: day(2026, 7, 10), createdAt: 0 },
			{ id: 'open', name: '', emoji: '', startDate: day(2026, 6, 10), createdAt: 0 },
			{ id: 'a', name: '', emoji: '', startDate: day(2026, 7, 1), endDate: day(2026, 7, 3), createdAt: 0 }
		];
		const { active } = partitionTrips(trips, now);
		expect(active.map((t) => t.id)).toEqual(['open', 'a', 'b']);
	});

	it('sorts past trips by most-recently-finished first', () => {
		const trips: Trip[] = [
			{ id: 'older', name: '', emoji: '', startDate: day(2026, 1, 1), endDate: day(2026, 1, 10), createdAt: 0 },
			{ id: 'newer', name: '', emoji: '', startDate: day(2026, 3, 1), endDate: day(2026, 3, 10), createdAt: 0 }
		];
		const { past, active } = partitionTrips(trips, now);
		expect(active).toHaveLength(0);
		expect(past.map((t) => t.id)).toEqual(['newer', 'older']);
	});
});

describe('untaggedExpensesInTrip', () => {
	const day = 86_400_000;
	const start = new Date(2026, 5, 10, 12).getTime();
	const trip: Trip = { id: 't1', name: 'Lisbon', emoji: '🏖', startDate: start, endDate: start + 2 * day, createdAt: 0 };
	const other: Trip = { id: 't2', name: 'Porto', emoji: '🏖', startDate: start, createdAt: 0 };

	it('picks untagged expenses inside the range only', () => {
		const expenses = [
			expenseAt('before', start - day),
			expenseAt('first', start),
			expenseAt('last-evening', start + 2 * day + 10 * 3_600_000),
			expenseAt('after', start + 3 * day),
			expenseAt('other-trip', start, 't2'),
			expenseAt('already', start, 't1'),
			expenseAt('orphan', start + day, 'deleted-trip'),
			{ ...expenseAt('settle', start), isSettlement: true }
		];
		const ids = untaggedExpensesInTrip(expenses, trip, [trip, other]).map((e) => e.id);
		expect(ids).toEqual(['first', 'last-evening', 'orphan']);
	});

	it('treats open-ended trips as covering every later day', () => {
		const ids = untaggedExpensesInTrip([expenseAt('later', start + 300 * day)], other, [other]).map(
			(e) => e.id
		);
		expect(ids).toEqual(['later']);
	});
});
