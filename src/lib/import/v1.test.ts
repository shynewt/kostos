import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isV1Export, mapV1ToV2, splitEmojiNameForTests } from './v1';

const FIXTURE = join(homedir(), 'Downloads', 'Jap-KostosExport.json');
const hasFixture = existsSync(FIXTURE);

describe('mapV1ToV2', () => {
	it('rejects non-v1 shapes', () => {
		expect(isV1Export(null)).toBe(false);
		expect(isV1Export({})).toBe(false);
		expect(isV1Export({ id: 'x', name: 'y' })).toBe(false);
	});

	it('accepts a minimal v1 shape', () => {
		expect(
			isV1Export({
				id: 'a',
				name: 'b',
				currency: 'EUR',
				participants: [],
				categories: [],
				paymentMethods: [],
				expenses: []
			})
		).toBe(true);
	});

	it('converts a EUR amount expense to integer cents', () => {
		const v1 = {
			id: 'p1',
			name: 'Trip',
			currency: 'EUR',
			participants: [
				{ id: 'a', name: 'Alice', createdAt: '2025-01-01T00:00:00.000Z' },
				{ id: 'b', name: 'Bob', createdAt: '2025-01-01T00:00:00.000Z' }
			],
			categories: [],
			paymentMethods: [],
			expenses: [
				{
					id: 'e1',
					expenseDate: '2025-01-02T00:00:00.000Z',
					title: 'Dinner',
					categoryId: null,
					paymentMethodId: null,
					amount: 13.5,
					paidById: 'a',
					splitType: 'even',
					paidFor: [
						{ memberId: 'a', amount: null, shares: null, percent: null, owedAmount: 6.75 },
						{ memberId: 'b', amount: null, shares: null, percent: null, owedAmount: 6.75 }
					]
				}
			]
		};
		const out = mapV1ToV2(v1);
		expect(out.expenses).toHaveLength(1);
		expect(out.expenses[0].amount).toBe(1350);
		expect(out.expenses[0].payments).toEqual([{ memberId: 'a', amount: 1350 }]);
		expect(out.expenses[0].splitMode).toBe('even');
		expect(out.expenses[0].splits).toHaveLength(2);
	});

	it('keeps JPY amounts 1:1 (zero-decimal currency)', () => {
		const v1 = {
			id: 'p',
			name: 'JP',
			currency: 'JPY',
			participants: [{ id: 'a', name: 'Alice', createdAt: '2025-01-01T00:00:00.000Z' }],
			categories: [],
			paymentMethods: [],
			expenses: [
				{
					id: 'e',
					expenseDate: '2025-01-02T00:00:00.000Z',
					title: 'Ramen',
					categoryId: null,
					paymentMethodId: null,
					amount: 1350,
					paidById: 'a',
					splitType: 'even',
					paidFor: [
						{ memberId: 'a', amount: null, shares: null, percent: null, owedAmount: 1350 }
					]
				}
			]
		};
		const out = mapV1ToV2(v1);
		expect(out.expenses[0].amount).toBe(1350);
	});

	it('warns that a group without real members would be empty', () => {
		const out = mapV1ToV2({ id: 'p', name: 'X', currency: 'EUR', participants: [], categories: [], paymentMethods: [], expenses: [] });
		expect(out.warnings).toContain('No real members found; group would be empty.');
	});

	it('drops the "All" pseudo-member and its paidFor entries', () => {
		const v1 = {
			id: 'p',
			name: 'X',
			currency: 'EUR',
			participants: [
				{ id: 'a', name: 'Alice', createdAt: '2025-01-01T00:00:00.000Z' },
				{ id: 'all', name: 'All', createdAt: '2025-01-01T00:00:00.000Z' }
			],
			categories: [],
			paymentMethods: [],
			expenses: [
				{
					id: 'e',
					expenseDate: '2025-01-02T00:00:00.000Z',
					title: 't',
					categoryId: null,
					paymentMethodId: null,
					amount: 10,
					paidById: 'a',
					splitType: 'even',
					paidFor: [
						{ memberId: 'a', amount: null, shares: null, percent: null, owedAmount: 10 },
						{ memberId: 'all', amount: null, shares: null, percent: null, owedAmount: 0 }
					]
				}
			]
		};
		const out = mapV1ToV2(v1);
		expect(out.members).toHaveLength(1);
		expect(out.stats.droppedMemberCount).toBe(1);
		expect(out.expenses[0].splits).toEqual([{ memberId: 'a' }]);
	});

	it('parses leading emojis from category names', () => {
		expect(splitEmojiNameForTests('🍽️ Menjar')).toEqual({ emoji: '🍽️', name: 'Menjar' });
		expect(splitEmojiNameForTests('🚇 Transport')).toEqual({ emoji: '🚇', name: 'Transport' });
		expect(splitEmojiNameForTests('No emoji')).toEqual({ emoji: '🏷️', name: 'No emoji' });
	});

	it('maps splitType "amount" using per-member owedAmount as cents', () => {
		const v1 = {
			id: 'p',
			name: 'X',
			currency: 'EUR',
			participants: [
				{ id: 'a', name: 'A', createdAt: '2025-01-01T00:00:00.000Z' },
				{ id: 'b', name: 'B', createdAt: '2025-01-01T00:00:00.000Z' }
			],
			categories: [],
			paymentMethods: [],
			expenses: [
				{
					id: 'e',
					expenseDate: '2025-01-02T00:00:00.000Z',
					title: 't',
					categoryId: null,
					paymentMethodId: null,
					amount: 11.92,
					paidById: 'a',
					splitType: 'amount',
					paidFor: [
						{ memberId: 'a', amount: 3.4, shares: null, percent: null, owedAmount: 3.4 },
						{ memberId: 'b', amount: 8.52, shares: null, percent: null, owedAmount: 8.52 }
					]
				}
			]
		};
		const out = mapV1ToV2(v1);
		expect(out.expenses[0].splitMode).toBe('amount');
		expect(out.expenses[0].splits).toEqual([
			{ memberId: 'a', amount: 340 },
			{ memberId: 'b', amount: 852 }
		]);
	});

	it.skipIf(!hasFixture)('roundtrips the real Jap export', () => {
		const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as unknown;
		expect(isV1Export(raw)).toBe(true);
		const out = mapV1ToV2(raw as Parameters<typeof mapV1ToV2>[0]);

		// drop the "All" pseudo-member
		expect(out.members.map((m) => m.name)).not.toContain('All');
		expect(out.stats.droppedMemberCount).toBeGreaterThanOrEqual(1);

		// JPY: amounts are 1:1 in cents (modulo per-expense rounding of v1's float amounts)
		const v1 = raw as { expenses: { amount: number }[] };
		const v1Total = v1.expenses.reduce((s, e) => s + Math.round(e.amount), 0);
		expect(out.stats.totalCents).toBe(v1Total);

		// All expenses mapped (none dropped)
		expect(out.stats.expenseCount).toBe(v1.expenses.length);

		// Every expense has at least one split
		for (const e of out.expenses) expect(e.splits.length).toBeGreaterThan(0);
	});
});
