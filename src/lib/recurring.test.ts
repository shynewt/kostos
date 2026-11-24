import { describe, expect, it } from 'vitest';
import { CATCH_UP_DAYS, dayOf, duePeriods, firstPeriodAfter, periodDay, repeatSummary } from './recurring';

describe('periodDay', () => {
	it('keeps the 31st, falling back to the last day of shorter months', () => {
		const days = [0, 1, 2, 3, 4].map((n) => periodDay('2026-01-31', 'monthly', n));
		expect(days).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
	});

	it('lands on 29 Feb in a leap year', () => {
		expect(periodDay('2027-12-31', 'monthly', 2)).toBe('2028-02-29');
		expect(periodDay('2028-01-30', 'monthly', 1)).toBe('2028-02-29');
	});

	it('crosses year ends', () => {
		expect(periodDay('2026-11-15', 'monthly', 3)).toBe('2027-02-15');
		expect(periodDay('2026-11-15', 'monthly', 14)).toBe('2028-01-15');
	});

	it('moves a 29 Feb yearly rule to 28 Feb, and back on leap years', () => {
		expect(periodDay('2028-02-29', 'yearly', 1)).toBe('2029-02-28');
		expect(periodDay('2028-02-29', 'yearly', 4)).toBe('2032-02-29');
	});

	it('counts weeks in whole days', () => {
		expect(periodDay('2026-03-25', 'weekly', 1)).toBe('2026-04-01');
		// spans the March and October DST changes without drifting a day
		expect(periodDay('2026-03-25', 'weekly', 30)).toBe('2026-10-21');
	});
});

describe('firstPeriodAfter', () => {
	it('skips every period up to and including the given day', () => {
		expect(firstPeriodAfter('2026-01-31', 'monthly', '2026-04-30')).toBe(4);
		expect(firstPeriodAfter('2026-01-31', 'monthly', '2026-04-29')).toBe(3);
		expect(firstPeriodAfter('2026-12-01', 'weekly', '2026-11-24')).toBe(0);
	});
});

describe('duePeriods', () => {
	const monthly = { startDay: '2026-01-31', frequency: 'monthly' as const, firstPeriod: 1 };

	it('lists every period that has started, including today', () => {
		expect(duePeriods(monthly, '2026-04-30')).toEqual([1, 2, 3]);
		expect(duePeriods(monthly, '2026-04-29')).toEqual([1, 2]);
		expect(duePeriods(monthly, '2026-01-31')).toEqual([]);
	});

	it('starts at firstPeriod', () => {
		expect(duePeriods({ ...monthly, firstPeriod: 3 }, '2026-05-31')).toEqual([3, 4]);
	});

	it('stops after the end day', () => {
		expect(duePeriods({ ...monthly, endDay: '2026-03-31' }, '2026-11-24')).toEqual([1, 2]);
	});

	it('catches up only the last year after a long time offline', () => {
		const weekly = { startDay: '2020-01-06', frequency: 'weekly' as const, firstPeriod: 1 };
		const today = '2026-11-24';
		const due = duePeriods(weekly, today);
		const windowStart = dayOf(Date.parse(today) - (CATCH_UP_DAYS - 1) * 86_400_000);
		expect(due.length).toBe(53);
		expect(periodDay(weekly.startDay, 'weekly', due[0]) >= windowStart).toBe(true);
		expect(periodDay(weekly.startDay, 'weekly', due[0] - 1) < windowStart).toBe(true);
		expect(periodDay(weekly.startDay, 'weekly', due.at(-1)!)).toBe('2026-11-23');
	});
});

describe('repeatSummary', () => {
	it('explains month-end fallbacks', () => {
		expect(repeatSummary('monthly', '2026-01-31', 'en-US')).toBe(
			'Every month on day 31, or the last day if the month is shorter'
		);
		expect(repeatSummary('monthly', '2026-01-05', 'en-US')).toBe('Every month on day 5');
		expect(repeatSummary('weekly', '2026-11-23', 'en-US')).toBe('Every Monday');
	});
});
