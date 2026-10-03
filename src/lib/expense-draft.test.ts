import { describe, expect, it } from 'vitest';
import { convertCents, expenseBaseAmount, exchangeFee, rateFromAmounts } from './currency-convert';
import {
	EMPTY_FX,
	applyMarket,
	createRequestGate,
	editCharged,
	fxForSave,
	fxView,
	parseMoney,
	seedFx,
	useMarket,
	type FxDraft
} from './expense-draft';
import type { Expense } from './types';

const NOW = 1_790_000_000_000;
const ctx = (amountCents: number, currency = 'USD') => ({
	amountCents,
	currency,
	baseCurrency: 'EUR',
	baseDecimals: 2
});
const market = (rate: number) => ({ rate, at: NOW - 1000 });

// what the form stores on save, reduced to the money fields
function save(draft: FxDraft, amountCents: number, currency = 'USD'): Expense {
	const fx = fxForSave(draft, ctx(amountCents, currency), NOW);
	if (!fx) throw new Error('nothing to save');
	return {
		id: 'e1',
		payments: [{ memberId: 'a', amount: amountCents }],
		amount: amountCents,
		currency,
		...fx,
		date: 0,
		splitMode: 'even',
		splits: [{ memberId: 'a' }],
		createdAt: 0,
		createdBy: 'a'
	};
}
const reopen = (e: Expense) => seedFx(e, 'EUR', 2);
const fxFields = (e: Expense) => ({
	exchangeRate: e.exchangeRate,
	chargedAmount: e.chargedAmount,
	marketRate: e.marketRate,
	rateFetchedAt: e.rateFetchedAt
});

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

describe('a new foreign expense', () => {
	it('defaults the charged amount to the market value and follows the foreign amount', () => {
		const draft = applyMarket(EMPTY_FX, market(0.9213), ctx(10000));
		expect(fxView(draft, ctx(10000))).toMatchObject({ charged: '92.13', percent: 0, canUseMarket: false });
		expect(fxView(draft, ctx(20000)).charged).toBe('184.26');

		const saved = save(draft, 10000);
		expect(fxFields(saved)).toEqual({
			exchangeRate: 0.9213,
			chargedAmount: 9213,
			marketRate: 0.9213,
			rateFetchedAt: NOW - 1000
		});
		expect(exchangeFee(saved, 'EUR')!.fee).toBe(0);
	});

	it('stores what the bank charged next to the market rate, and the fee follows', () => {
		const draft = editCharged(applyMarket(EMPTY_FX, market(0.9213), ctx(10000)), '94.20');
		const view = fxView(draft, ctx(10000));
		expect(view.percent).toBeCloseTo(2.247, 2);
		expect(view.canUseMarket).toBe(true);

		const saved = save(draft, 10000);
		expect(saved.chargedAmount).toBe(9420);
		expect(saved.marketRate).toBe(0.9213);
		expect(expenseBaseAmount(saved, 'EUR')).toBe(9420);
		// older clients only read exchangeRate; it has to land on the same balance
		expect(convertCents(saved.amount, 'USD', 'EUR', saved.exchangeRate!)).toBe(9420);
		expect(exchangeFee(saved, 'EUR')!.fee).toBe(207);
	});

	it('keeps a typed charged amount when the foreign amount changes, until reset to market', () => {
		let draft = editCharged(applyMarket(EMPTY_FX, market(0.9), ctx(4000)), '50.00');
		expect(fxView(draft, ctx(6000)).charged).toBe('50.00');
		draft = useMarket(draft);
		expect(fxView(draft, ctx(6000)).charged).toBe('54.00');
	});

	it('keeps a charged amount typed while the market rate was still loading', () => {
		const typed = editCharged(EMPTY_FX, '9.50');
		const landed = applyMarket(typed, market(0.92), ctx(1000));
		expect(fxView(landed, ctx(1000))).toMatchObject({ charged: '9.50', rate: 0.95 });
		expect(fxView(landed, ctx(1000)).percent).toBeCloseTo(3.26, 1);
	});

	it('saves offline with only a charged amount, and refuses to save with nothing', () => {
		expect(fxForSave(EMPTY_FX, ctx(1000), NOW)).toBeNull();
		const saved = save(editCharged(EMPTY_FX, '1000*0.91/100'), 1000);
		expect(saved).toMatchObject({ chargedAmount: 910, marketRate: undefined, rateFetchedAt: NOW });
		expect(convertCents(1000, 'USD', 'EUR', saved.exchangeRate!)).toBe(910);
		expect(exchangeFee(saved, 'EUR')).toBeNull();
	});

	it('flags a charged amount finer than the currency keeps', () => {
		expect(fxView(editCharged(EMPTY_FX, '1.234'), ctx(100)).chargedParsed?.rounded).toBe(true);
	});
});

describe('reopening an expense', () => {
	it('writes back exactly what was stored when nothing changes', () => {
		const atMarket = save(applyMarket(EMPTY_FX, market(0.9213), ctx(10000)), 10000);
		const charged = save(editCharged(applyMarket(EMPTY_FX, market(0.9213), ctx(10000)), '94.20'), 10000);
		const odd = save(editCharged(applyMarket(EMPTY_FX, market(0.0061), ctx(123456, 'JPY')), '777.13'), 123456, 'JPY');
		for (const e of [atMarket, charged, odd]) {
			expect(fxFields(save(reopen(e), e.amount, e.currency))).toEqual(fxFields(e));
		}
	});

	it('keeps the charged amount, not the rate, when the foreign amount is edited', () => {
		const saved = save(editCharged(applyMarket(EMPTY_FX, market(0.9), ctx(10000)), '94.20'), 10000);
		const resaved = save(reopen(saved), 12000);
		expect(resaved.chargedAmount).toBe(9420);
		expect(resaved.exchangeRate).toBe(rateFromAmounts(12000, 'USD', 9420, 'EUR'));
	});
});

describe('expenses saved before charged amounts existed', () => {
	const legacy = (amount: number, rate: number): Expense => ({
		id: 'old',
		payments: [{ memberId: 'a', amount }],
		amount,
		currency: 'USD',
		exchangeRate: rate,
		rateFetchedAt: 42,
		date: 0,
		splitMode: 'even',
		splits: [{ memberId: 'a' }],
		createdAt: 0,
		createdBy: 'a'
	});

	it('are left exactly as stored by an untouched save', () => {
		const old = legacy(10000, 0.93871234);
		expect(fxFields(save(reopen(old), 10000))).toEqual(fxFields(old));
		expect(fxView(reopen(old), ctx(10000))).toMatchObject({ charged: '93.87', percent: null });
	});

	it('keep their rate when the amount changes, so $3 at 1/3 becomes $6 for €2.00', () => {
		const edited = save(reopen(legacy(300, 0.3333333333333333)), 600);
		expect(edited.exchangeRate).toBe(0.3333333333333333);
		expect(expenseBaseAmount(edited, 'EUR')).toBe(200);
	});

	it('hold their value when a market rate is fetched, and then show the difference', () => {
		const old = legacy(10000, 0.95);
		const fetched = applyMarket(reopen(old), market(0.92), ctx(10000));
		const view = fxView(fetched, ctx(10000));
		expect(view.charged).toBe('95.00');
		expect(view.percent).toBeCloseTo(3.26, 1);
		expect(save(fetched, 10000)).toMatchObject({ chargedAmount: 9500, marketRate: 0.92 });
	});
});

describe('late rate responses', () => {
	// the form's sequence: start a fetch, switch currency, then the stale response arrives
	it('drops a response that resolves after the currency changed', async () => {
		const gate = createRequestGate();
		let draft = EMPTY_FX;
		let resolveFetch!: (rate: number) => void;
		const pending = new Promise<number>((resolve) => (resolveFetch = resolve));

		const token = gate.begin();
		const landing = pending.then((rate) => {
			if (gate.isCurrent(token)) draft = applyMarket(draft, market(rate), ctx(1000));
		});

		gate.invalidate();
		draft = EMPTY_FX;
		resolveFetch(0.92);
		await landing;

		expect(draft.market).toBeNull();
	});

	it('lets only the newest of two overlapping fetches apply', () => {
		const gate = createRequestGate();
		const first = gate.begin();
		const second = gate.begin();
		expect(gate.isCurrent(first)).toBe(false);
		expect(gate.isCurrent(second)).toBe(true);
	});
});
