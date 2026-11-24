import type { RecurringRule, RepeatFrequency } from '$lib/types';

const DAY_MS = 86_400_000;

/** A phone that missed more than this only creates the copies from the last year, so a
 *  forgotten weekly rule or a wrong clock can't flood the group. */
export const CATCH_UP_DAYS = 366;

export const REPEAT_LABELS: Record<RepeatFrequency, string> = {
	weekly: 'Weekly',
	monthly: 'Monthly',
	yearly: 'Yearly'
};

// expense dates are stored as the UTC midnight of the picked day, so periods count UTC days too
export function dayOf(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function todayDay(now = Date.now()): string {
	return dayOf(now);
}

function daysInMonth(year: number, monthIndex: number): number {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function periodDay(startDay: string, frequency: RepeatFrequency, period: number): string {
	const start = new Date(Date.parse(startDay));
	if (frequency === 'weekly') return dayOf(start.getTime() + period * 7 * DAY_MS);
	const monthsAhead = frequency === 'monthly' ? period : period * 12;
	const totalMonths = start.getUTCMonth() + monthsAhead;
	const year = start.getUTCFullYear() + Math.floor(totalMonths / 12);
	const monthIndex = totalMonths % 12;
	const day = Math.min(start.getUTCDate(), daysInMonth(year, monthIndex));
	return dayOf(Date.UTC(year, monthIndex, day));
}

/** The first period that lands strictly after `day`. */
export function firstPeriodAfter(startDay: string, frequency: RepeatFrequency, day: string): number {
	let period = 0;
	while (periodDay(startDay, frequency, period) <= day) period += 1;
	return period;
}

/** Periods whose day has come, oldest first, limited to the catch-up window. */
export function duePeriods(
	rule: Pick<RecurringRule, 'startDay' | 'frequency' | 'firstPeriod' | 'endDay'>,
	today: string
): number[] {
	const windowStart = dayOf(Date.parse(today) - (CATCH_UP_DAYS - 1) * DAY_MS);
	const lastDay = rule.endDay && rule.endDay < today ? rule.endDay : today;
	const due: number[] = [];
	for (let period = rule.firstPeriod; ; period++) {
		const day = periodDay(rule.startDay, rule.frequency, period);
		if (day > lastDay) break;
		if (day >= windowStart) due.push(period);
	}
	return due;
}

export function repeatSummary(frequency: RepeatFrequency, startDay: string, locale?: string): string {
	const start = new Date(Date.parse(startDay));
	if (frequency === 'weekly') {
		return `Every ${start.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' })}`;
	}
	if (frequency === 'yearly') {
		return `Every year on ${start.toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
	}
	const dayOfMonth = start.getUTCDate();
	if (dayOfMonth > 28) return `Every month on day ${dayOfMonth}, or the last day if the month is shorter`;
	return `Every month on day ${dayOfMonth}`;
}
