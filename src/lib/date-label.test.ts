import { describe, expect, it } from 'vitest';
import { compactDayLabel, dayLabel } from './date-label';

const NOW = Date.UTC(2026, 10, 24, 15, 30);

describe('dayLabel', () => {
	it('names today, yesterday and tomorrow', () => {
		expect(dayLabel('2026-11-24', NOW)).toBe('Today');
		expect(dayLabel('2026-11-23', NOW)).toBe('Yesterday');
		expect(dayLabel('2026-11-25', NOW)).toBe('Tomorrow');
	});

	it('uses the UTC day the form seeds its date from, whatever the hour', () => {
		expect(dayLabel('2026-11-24', Date.UTC(2026, 10, 24, 0, 0))).toBe('Today');
		expect(dayLabel('2026-11-24', Date.UTC(2026, 10, 24, 23, 59))).toBe('Today');
	});

	it('shows a short date for other days this year', () => {
		expect(dayLabel('2026-11-02', NOW, 'en-GB')).toBe('2 Nov');
		expect(dayLabel('2026-01-01', NOW, 'en-GB')).toBe('1 Jan');
	});

	it('adds the year for days in another year', () => {
		expect(dayLabel('2025-12-31', NOW, 'en-GB')).toBe('31 Dec 2025');
	});

	it('reads an empty or broken date as today, since that is what gets saved', () => {
		expect(dayLabel('', NOW)).toBe('Today');
		expect(dayLabel('not a date', NOW)).toBe('Today');
	});
});

describe('compactDayLabel', () => {
	it('matches dayLabel for named days and days this year', () => {
		expect(compactDayLabel('2026-11-24', NOW)).toBe('Today');
		expect(compactDayLabel('2026-11-02', NOW, 'en-GB')).toBe('2 Nov');
		expect(compactDayLabel('', NOW)).toBe('Today');
	});

	it('shortens a day in another year to numbers', () => {
		expect(compactDayLabel('2025-12-31', NOW, 'en-GB')).toBe('31/12/25');
		expect(compactDayLabel('2025-12-31', NOW, 'en-US')).toBe('12/31/25');
	});

	it('still says yesterday across a new year', () => {
		expect(compactDayLabel('2025-12-31', Date.UTC(2026, 0, 1, 9, 0))).toBe('Yesterday');
	});
});
