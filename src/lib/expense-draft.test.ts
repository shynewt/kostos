import { describe, expect, it } from 'vitest';
import { convertCents } from './currency-convert';
import {
	EMPTY_RATE_DRAFT,
	applyFetchedRate,
	createRequestGate,
	draftRate,
	editCharged,
	editRate,
	parseMoney,
	rateFields,
	seedRateDraft,
	type RateDraft
} from './expense-draft';
import type { Expense } from './types';

const ctx = (amountCents: number, currency = 'USD') => ({
	amountCents,
	currency,
	baseCurrency: 'EUR',
	baseDecimals: 2
});

// what the form stores on save, reduced to the money fields
function save(draft: RateDraft, amountCents: number, currency = 'USD'): Expense {
	return {
		id: 'e1',
		payments: [{ memberId: 'a', amount: amountCents }],
		amount: amountCents,
		currency,
		exchangeRate: draftRate(draft, ctx(amountCents, currency)) ?? undefined,
		date: 0,
		splitMode: 'even',
		splits: [{ memberId: 'a' }],
		createdAt: 0,
		createdBy: 'a'
	};
}

const baseOf = (e: Expense) => convertCents(e.amount, e.currency, 'EUR', e.exchangeRate!);

describe('parseMoney', () => {
	it('separates empty, invalid, negative, exact and rounded input', () => {
		expect(parseMoney('  ', 2)).toEqual({ cents: 0, empty: true, invalid: false, rounded: false });
		expect(parseMoney('12+', 2).invalid).toBe(true);
		expect(parseMoney('5-10', 2).invalid).toBe(true);
		expect(parseMoney('12.50', 2)).toEqual({ cents: 1250, empty: false, invalid: false, rounded: false });
		expect(parseMoney('1.234', 2)).toEqual({ cents: 123, empty: false, invalid: false, rounded: true });
		expect(parseMoney('2000', 0).cents).toBe(2000);
	});
});

describe('rate draft across save and reopen', () => {
	it('keeps a long typed rate when the amount changes after reopening', () => {
		const saved = save(editRate(EMPTY_RATE_DRAFT, '0.3333333333333333'), 300);
		const reopened = seedRateDraft(saved, 'EUR');
		const edited = save(reopened, 600);
		expect(edited.exchangeRate).toBe(0.3333333333333333);
		expect(baseOf(edited)).toBe(200);
	});

	it('reopens a charged amount on its exact rate, short or long', () => {
		for (const [amount, charged] of [
			[100, '0.95'],
			[10000, '93.87'],
			[123456, '777.13']
		] as const) {
			const currency = amount === 123456 ? 'JPY' : 'USD';
			const saved = save(editCharged(EMPTY_RATE_DRAFT, charged), amount, currency);
			const resaved = save(seedRateDraft(saved, 'EUR'), amount, currency);
			expect(resaved.exchangeRate).toBe(saved.exchangeRate);
			expect(baseOf(resaved) / 100).toBe(Number(charged));
		}
	});

	it('shows the kept rate rounded while still saving it exactly', () => {
		const saved = save(editRate(EMPTY_RATE_DRAFT, '0.93871234'), 10000);
		const reopened = seedRateDraft(saved, 'EUR');
		const fields = rateFields(reopened, ctx(10000));
		expect(fields.rate).toBe('0.938712');
		expect(fields.charged).toBe('93.87');
		expect(save(reopened, 10000).exchangeRate).toBe(0.93871234);
	});

	it('pins the charged amount while the foreign amount changes', () => {
		const draft = editCharged(EMPTY_RATE_DRAFT, '50.00');
		expect(baseOf(save(draft, 4000))).toBe(5000);
		expect(baseOf(save(draft, 6000))).toBe(5000);
	});

	it('lets a fetch replace a kept rate but never a pinned charged amount', () => {
		const reopened = seedRateDraft(save(editRate(EMPTY_RATE_DRAFT, '0.9'), 1000), 'EUR');
		expect(draftRate(applyFetchedRate(reopened, 0.92), ctx(1000))).toBe(0.92);
		const charged = editCharged(EMPTY_RATE_DRAFT, '9.50');
		expect(draftRate(applyFetchedRate(charged, 0.92), ctx(1000))).toBe(0.95);
	});

	it('reports the parsed charged amount so callers can show its rounding', () => {
		const fields = rateFields(editCharged(EMPTY_RATE_DRAFT, '1.234'), ctx(100));
		expect(fields.chargedParsed).toEqual({ cents: 123, empty: false, invalid: false, rounded: true });
		expect(fields.baseCents).toBe(123);
		expect(rateFields(editRate(EMPTY_RATE_DRAFT, '0.9'), ctx(100)).chargedParsed).toBeNull();
	});

	it('starts empty for base-currency expenses and expenses without a rate', () => {
		expect(seedRateDraft(undefined, 'EUR')).toBe(EMPTY_RATE_DRAFT);
		expect(seedRateDraft({ ...save(EMPTY_RATE_DRAFT, 100), currency: 'EUR' }, 'EUR')).toBe(EMPTY_RATE_DRAFT);
	});
});

describe('late rate responses', () => {
	// the form's sequence: start a fetch, the user types, then the response arrives
	it('drops a response that resolves after the user typed a rate', async () => {
		const gate = createRequestGate();
		let draft = EMPTY_RATE_DRAFT;
		let resolveFetch!: (rate: number) => void;
		const pending = new Promise<number>((resolve) => (resolveFetch = resolve));

		const token = gate.begin();
		const landing = pending.then((rate) => {
			if (gate.isCurrent(token)) draft = applyFetchedRate(draft, rate);
		});

		gate.invalidate();
		draft = editRate(draft, '0.8');
		resolveFetch(0.92);
		await landing;

		expect(draftRate(draft, ctx(1000))).toBe(0.8);
	});

	it('lets only the newest of two overlapping fetches apply', async () => {
		const gate = createRequestGate();
		const first = gate.begin();
		const second = gate.begin();
		expect(gate.isCurrent(first)).toBe(false);
		expect(gate.isCurrent(second)).toBe(true);
	});
});
