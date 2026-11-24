const DAY_MS = 86_400_000;

// The expense form holds its date as a "YYYY-MM-DD" day taken from toISOString, so
// "today" here is the UTC day too; comparing in local time would mislabel the default.
function utcDayStart(ms: number): number {
	return Date.parse(new Date(ms).toISOString().slice(0, 10));
}

export function dayLabel(day: string, now: number, locale?: string): string {
	const picked = Date.parse(day);
	// an empty or cleared date input saves as now
	if (Number.isNaN(picked)) return 'Today';
	const today = utcDayStart(now);
	const offset = Math.round((picked - today) / DAY_MS);
	if (offset === 0) return 'Today';
	if (offset === -1) return 'Yesterday';
	if (offset === 1) return 'Tomorrow';
	const sameYear = new Date(picked).getUTCFullYear() === new Date(today).getUTCFullYear();
	return new Date(picked).toLocaleDateString(locale, {
		day: 'numeric',
		month: 'short',
		year: sameYear ? undefined : 'numeric',
		timeZone: 'UTC'
	});
}
