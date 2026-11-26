import { describe, expect, it } from 'vitest';
import { expenseShares } from './balance';
import {
	ALL_TIME,
	biggestExpenses,
	bucketSizeFor,
	defaultPeriod,
	exchangeFees,
	inPeriod,
	isSamePeriod,
	last12MonthsOf,
	monthOf,
	monthsWithExpenses,
	parsePeriodKey,
	perPerson,
	periodBounds,
	periodKey,
	periodLabel,
	previousMonthOf,
	spendByCategory,
	spendByPaymentMethod,
	spendLines,
	spendOverTime,
	summarize,
	yearOf,
	type Period
} from './stats';
import type { Expense } from './types';

const utc = (year: number, month: number, day: number, hour = 12) => Date.UTC(year, month - 1, day, hour);

let nextId = 0;
function expense(overrides: Partial<Expense> = {}): Expense {
	const amount = overrides.amount ?? 1200;
	return {
		id: `e${nextId++}`,
		payments: [{ memberId: 'alice', amount }],
		amount,
		currency: 'EUR',
		date: utc(2026, 10, 10),
		splitMode: 'even',
		splits: [{ memberId: 'alice' }, { memberId: 'bob' }, { memberId: 'carol' }],
		createdAt: 0,
		createdBy: 'alice',
		...overrides
	};
}

const group = { kind: 'group' } as const;
const memberView = (memberId: string) => ({ kind: 'member', memberId }) as const;
const october: Period = { kind: 'month', year: 2026, month: 9 };

describe('periods', () => {
	it('bounds a calendar month from its first instant to the next month', () => {
		expect(periodBounds(october)).toEqual({ start: Date.UTC(2026, 9, 1), end: Date.UTC(2026, 10, 1) });
		expect(periodBounds({ kind: 'year', year: 2026 })).toEqual({
			start: Date.UTC(2026, 0, 1),
			end: Date.UTC(2027, 0, 1)
		});
		expect(periodBounds(ALL_TIME)).toBeNull();
	});

	it('works out this month, last month and this year across a year boundary', () => {
		const newYearsDay = utc(2027, 1, 1, 0);
		expect(monthOf(newYearsDay)).toEqual({ kind: 'month', year: 2027, month: 0 });
		expect(previousMonthOf(newYearsDay)).toEqual({ kind: 'month', year: 2026, month: 11 });
		expect(yearOf(newYearsDay)).toEqual({ kind: 'year', year: 2027 });
	});

	it('keeps the last instant of a month in that month and the next midnight out', () => {
		const lastMoment = expense({ date: Date.UTC(2026, 10, 1) - 1 });
		const nextMidnight = expense({ date: Date.UTC(2026, 10, 1) });
		const firstMidnight = expense({ date: Date.UTC(2026, 9, 1) });
		expect(inPeriod([lastMoment, nextMidnight, firstMidnight], october)).toEqual([lastMoment, firstMidnight]);
	});

	it('returns everything for all time', () => {
		const all = [expense(), expense({ date: utc(2020, 1, 1) })];
		expect(inPeriod(all, ALL_TIME)).toBe(all);
	});

	it('lists each month with expenses once, newest first', () => {
		const months = monthsWithExpenses([
			expense({ date: utc(2026, 9, 3) }),
			expense({ date: utc(2026, 10, 30) }),
			expense({ date: utc(2026, 9, 28) }),
			expense({ date: utc(2025, 12, 31) })
		]);
		expect(months.map(periodKey)).toEqual(['2026-10', '2026-09', '2025-12']);
	});

	it('round-trips through its key and falls back to all time on junk', () => {
		const now = utc(2026, 11, 26);
		for (const period of [ALL_TIME, october, { kind: 'year', year: 2026 } as Period, last12MonthsOf(now)]) {
			expect(isSamePeriod(parsePeriodKey(periodKey(period), now), period)).toBe(true);
		}
		expect(parsePeriodKey(null, now)).toEqual(ALL_TIME);
		expect(parsePeriodKey('2026-13', now)).toEqual(ALL_TIME);
		expect(parsePeriodKey('last-week', now)).toEqual(ALL_TIME);
	});

	it('reads the last 12 months from the day it is opened', () => {
		expect(parsePeriodKey('last-12-months', utc(2027, 1, 5))).toEqual({ kind: 'last12Months', year: 2027, month: 0 });
	});

	it('counts the last 12 months as this month and the eleven whole months before it', () => {
		expect(periodBounds(last12MonthsOf(utc(2026, 11, 26)))).toEqual({
			start: Date.UTC(2025, 11, 1),
			end: Date.UTC(2026, 11, 1)
		});
		expect(periodBounds(last12MonthsOf(utc(2027, 1, 1, 0)))).toEqual({
			start: Date.UTC(2026, 1, 1),
			end: Date.UTC(2027, 1, 1)
		});
	});

	it('opens on the last 12 months only once a group has older expenses', () => {
		const now = utc(2026, 11, 26);
		const thisYear = [expense({ date: utc(2026, 1, 3) }), expense({ date: utc(2026, 11, 20) })];
		expect(defaultPeriod(thisYear, now)).toEqual(ALL_TIME);
		expect(defaultPeriod([expense({ date: utc(2025, 12, 1) })], now)).toEqual(ALL_TIME);
		expect(defaultPeriod([...thisYear, expense({ date: utc(2025, 11, 30) })], now)).toEqual(last12MonthsOf(now));
		expect(defaultPeriod([], now)).toEqual(ALL_TIME);
	});

	it('names periods for people', () => {
		expect(periodLabel(october, 'en-GB')).toBe('October 2026');
		expect(periodLabel({ kind: 'year', year: 2026 }, 'en-GB')).toBe('2026');
		expect(periodLabel(ALL_TIME)).toBe('All time');
		expect(periodLabel(last12MonthsOf(utc(2026, 11, 26)))).toBe('Last 12 months');
	});
});

describe('spendLines', () => {
	it('leaves settlements out', () => {
		const lines = spendLines([expense(), expense({ isSettlement: true })], 'EUR', group);
		expect(lines).toHaveLength(1);
	});

	it('counts the whole bill for the group', () => {
		const lines = spendLines([expense({ amount: 1000 })], 'EUR', group);
		expect(lines[0].amount).toBe(1000);
	});

	it('counts the charged amount of a foreign expense, not its own currency amount', () => {
		const dinner = expense({ amount: 12000, currency: 'USD', exchangeRate: 0.9, chargedAmount: 11000 });
		expect(spendLines([dinner], 'EUR', group)[0].amount).toBe(11000);
		expect(spendLines([dinner], 'EUR', memberView('bob'))[0].amount).toBe(3667);
	});

	it('takes a member share from a shares split and drops expenses they are not in', () => {
		const hotel = expense({
			amount: 1000,
			splitMode: 'shares',
			splits: [
				{ memberId: 'alice', shares: 2 },
				{ memberId: 'bob', shares: 1 },
				{ memberId: 'carol', shares: 1 }
			]
		});
		const notBob = expense({ splits: [{ memberId: 'alice' }, { memberId: 'carol' }] });
		const lines = spendLines([hotel, notBob], 'EUR', memberView('bob'));
		expect(lines.map((l) => l.amount)).toEqual([250]);
	});

	it('sums a member view to exactly their shares across mixed splits and currencies', () => {
		const expenses = [
			expense({ amount: 1001 }),
			expense({
				amount: 5000,
				splitMode: 'amount',
				splits: [
					{ memberId: 'alice', amount: 1000 },
					{ memberId: 'bob', amount: 4000 }
				]
			}),
			expense({ amount: 333, currency: 'GBP', chargedAmount: 389, payments: [{ memberId: 'bob', amount: 333 }] }),
			expense({ amount: 999, isSettlement: true, splits: [{ memberId: 'bob' }] })
		];
		for (const memberId of ['alice', 'bob', 'carol']) {
			const fromLines = summarize(spendLines(expenses, 'EUR', memberView(memberId)))?.total ?? 0;
			let fromShares = 0;
			for (const e of spendLines(expenses, 'EUR', group)) fromShares += expenseShares(e.base).get(memberId) ?? 0;
			expect(fromLines).toBe(fromShares);
		}
		const everyone = ['alice', 'bob', 'carol'].reduce(
			(sum, id) => sum + (summarize(spendLines(expenses, 'EUR', memberView(id)))?.total ?? 0),
			0
		);
		expect(everyone).toBe(summarize(spendLines(expenses, 'EUR', group))?.total);
	});
});

describe('summarize', () => {
	it('counts calendar days from the first expense to the last', () => {
		const lines = spendLines(
			[expense({ date: utc(2026, 10, 1, 23) }), expense({ date: utc(2026, 10, 3, 0) })],
			'EUR',
			group
		);
		expect(summarize(lines)).toMatchObject({ total: 2400, count: 2, days: 3 });
	});

	it('is null with nothing to summarise', () => {
		expect(summarize([])).toBeNull();
	});
});

describe('spendOverTime', () => {
	it('picks day, week or month buckets from the length of the range', () => {
		expect(bucketSizeFor(1)).toBe('day');
		expect(bucketSizeFor(31)).toBe('day');
		expect(bucketSizeFor(32)).toBe('week');
		expect(bucketSizeFor(122)).toBe('week');
		expect(bucketSizeFor(123)).toBe('month');
	});

	it('crops day buckets to the first and last expense and keeps gaps', () => {
		const series = spendOverTime(
			spendLines(
				[
					expense({ date: utc(2026, 10, 12), amount: 500 }),
					expense({ date: utc(2026, 10, 14), amount: 300 }),
					expense({ date: utc(2026, 10, 14, 20), amount: 200 })
				],
				'EUR',
				group
			)
		);
		expect(series.size).toBe('day');
		expect(series.buckets).toEqual([
			{ start: Date.UTC(2026, 9, 12), total: 500 },
			{ start: Date.UTC(2026, 9, 13), total: 0 },
			{ start: Date.UTC(2026, 9, 14), total: 500 }
		]);
	});

	it('starts week buckets on Monday', () => {
		// Wednesday 7 October to Sunday 22 November 2026: 47 days
		const series = spendOverTime(
			spendLines([expense({ date: utc(2026, 10, 7) }), expense({ date: utc(2026, 11, 22) })], 'EUR', group)
		);
		expect(series.size).toBe('week');
		expect(series.buckets[0].start).toBe(Date.UTC(2026, 9, 5));
		expect(series.buckets.at(-1)?.start).toBe(Date.UTC(2026, 10, 16));
		expect(series.buckets).toHaveLength(7);
	});

	it('uses month buckets beyond four months and spans month lengths', () => {
		const series = spendOverTime(
			spendLines(
				[expense({ date: utc(2026, 1, 31), amount: 100 }), expense({ date: utc(2026, 6, 15), amount: 200 })],
				'EUR',
				group
			)
		);
		expect(series.size).toBe('month');
		expect(series.buckets.map((b) => new Date(b.start).getUTCMonth())).toEqual([0, 1, 2, 3, 4, 5]);
		expect(series.buckets.map((b) => b.total)).toEqual([100, 0, 0, 0, 0, 200]);
	});

	it('is empty with no expenses', () => {
		expect(spendOverTime([])).toEqual({ size: 'day', buckets: [] });
	});
});

describe('spendByCategory', () => {
	it('rolls up by category, largest first, with uncategorised as null', () => {
		const rows = spendByCategory(
			spendLines(
				[
					expense({ categoryId: 'cat-lodging', amount: 5200 }),
					expense({ amount: 1800 }),
					expense({ categoryId: 'cat-food', amount: 1000 }),
					expense({ categoryId: 'cat-food', amount: 2000 }),
					expense({ categoryId: 'cat-food', amount: 9999, isSettlement: true })
				],
				'EUR',
				group
			)
		);
		expect(rows).toEqual([
			{ id: 'cat-lodging', amount: 5200, percent: 52 },
			{ id: 'cat-food', amount: 3000, percent: 30 },
			{ id: null, amount: 1800, percent: 18 }
		]);
	});

	it('uses the member share in a member view', () => {
		const rows = spendByCategory(spendLines([expense({ categoryId: 'cat-food', amount: 900 })], 'EUR', memberView('bob')));
		expect(rows).toEqual([{ id: 'cat-food', amount: 300, percent: 100 }]);
	});

	it('rolls up payment methods the same way', () => {
		const rows = spendByPaymentMethod(
			spendLines([expense({ paymentMethodId: 'pm-card', amount: 300 }), expense({ amount: 100 })], 'EUR', group)
		);
		expect(rows).toEqual([
			{ id: 'pm-card', amount: 300, percent: 75 },
			{ id: null, amount: 100, percent: 25 }
		]);
	});
});

describe('perPerson', () => {
	it('splits cost and paid with several payers, and the differences sum to zero', () => {
		const flight = expense({
			amount: 48000,
			payments: [
				{ memberId: 'alice', amount: 30000 },
				{ memberId: 'carol', amount: 18000 }
			],
			splits: [{ memberId: 'alice' }, { memberId: 'bob' }, { memberId: 'carol' }, { memberId: 'dan' }]
		});
		const rows = perPerson([flight], 'EUR');
		expect(rows).toEqual([
			{ memberId: 'alice', cost: 12000, paid: 30000, difference: 18000 },
			{ memberId: 'carol', cost: 12000, paid: 18000, difference: 6000 },
			{ memberId: 'bob', cost: 12000, paid: 0, difference: -12000 },
			{ memberId: 'dan', cost: 12000, paid: 0, difference: -12000 }
		]);
	});

	it('sums to zero to the cent with odd amounts, shares and foreign currency', () => {
		const expenses = [
			expense({ amount: 1001 }),
			expense({
				amount: 777,
				splitMode: 'shares',
				payments: [
					{ memberId: 'bob', amount: 400 },
					{ memberId: 'dan', amount: 377 }
				],
				splits: [
					{ memberId: 'alice', shares: 3 },
					{ memberId: 'dan', shares: 1 }
				]
			}),
			expense({
				amount: 12345,
				currency: 'USD',
				chargedAmount: 11111,
				marketRate: 0.9,
				payments: [
					{ memberId: 'carol', amount: 10000 },
					{ memberId: 'alice', amount: 2345 }
				]
			})
		];
		const rows = perPerson(expenses, 'EUR');
		expect(rows.reduce((sum, r) => sum + r.difference, 0)).toBe(0);
		expect(rows.reduce((sum, r) => sum + r.cost, 0)).toBe(1001 + 777 + 11111);
		expect(rows.reduce((sum, r) => sum + r.paid, 0)).toBe(1001 + 777 + 11111);
	});

	it('ignores settlements and members untouched by the expenses', () => {
		const rows = perPerson(
			[
				expense({ amount: 600, splits: [{ memberId: 'alice' }, { memberId: 'bob' }] }),
				expense({
					amount: 5000,
					isSettlement: true,
					payments: [{ memberId: 'dan', amount: 5000 }],
					splits: [{ memberId: 'alice' }]
				})
			],
			'EUR'
		);
		expect(rows).toEqual([
			{ memberId: 'alice', cost: 300, paid: 600, difference: 300 },
			{ memberId: 'bob', cost: 300, paid: 0, difference: -300 }
		]);
	});
});

describe('biggestExpenses', () => {
	it('keeps the top five by the counted amount', () => {
		const expenses = [100, 900, 300, 700, 500, 200].map((amount) => expense({ amount }));
		expect(biggestExpenses(spendLines(expenses, 'EUR', group)).map((l) => l.amount)).toEqual([900, 700, 500, 300, 200]);
	});

	it('leaves income out instead of ranking it last', () => {
		const expenses = [300, -900, 100].map((amount) => expense({ amount }));
		expect(biggestExpenses(spendLines(expenses, 'EUR', group)).map((l) => l.amount)).toEqual([300, 100]);
	});

	it('ranks by share in a member view', () => {
		const big = expense({
			amount: 10000,
			splitMode: 'amount',
			splits: [
				{ memberId: 'alice', amount: 9900 },
				{ memberId: 'bob', amount: 100 }
			]
		});
		const small = expense({ amount: 600, splits: [{ memberId: 'bob' }] });
		const top = biggestExpenses(spendLines([big, small], 'EUR', memberView('bob')));
		expect(top.map((l) => [l.expense.id, l.amount])).toEqual([
			[small.id, 600],
			[big.id, 100]
		]);
	});
});

describe('exchangeFees', () => {
	const dinner = expense({ amount: 10000, currency: 'USD', chargedAmount: 9300, marketRate: 0.9 });

	it('totals what the card charged over the market rate', () => {
		expect(exchangeFees(spendLines([dinner, expense()], 'EUR', group), 'EUR')).toEqual({
			fee: 300,
			atMarket: 9000,
			count: 1,
			percent: (300 / 9000) * 100
		});
	});

	it('takes a member share of the fee', () => {
		expect(exchangeFees(spendLines([dinner], 'EUR', memberView('bob')), 'EUR')).toMatchObject({ fee: 100, atMarket: 3000 });
	});

	it('is null when no expense stored a market rate', () => {
		expect(exchangeFees(spendLines([expense()], 'EUR', group), 'EUR')).toBeNull();
	});
});
