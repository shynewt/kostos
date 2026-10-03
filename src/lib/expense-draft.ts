/* Money logic behind the expense form, kept out of the component so it can be tested.
 *
 * Every money field is parsed once into a MoneyInput. A foreign-currency expense keeps its
 * conversion in an FxDraft: the market rate (fetched, read-only) and the charged amount in
 * the base currency, which is what the expense really cost. Until the user types a charged
 * amount it follows the market rate, or the stored rate of an older expense. */

import { convertCents, rateFromAmounts } from './currency-convert';
import { dropsPrecision, evalExpression, toMinorUnits } from './math';
import type { Expense } from './types';

export type MoneyInput = {
	/** minor units; 0 when empty or invalid */
	cents: number;
	empty: boolean;
	/** not a number or expression, or negative */
	invalid: boolean;
	/** valid, but storing it at the currency's precision drops digits */
	rounded: boolean;
};

export function parseMoney(raw: string, decimals: number): MoneyInput {
	if (raw.trim() === '') return { cents: 0, empty: true, invalid: false, rounded: false };
	const value = evalExpression(raw);
	if (value === null || value < 0) return { cents: 0, empty: false, invalid: true, rounded: false };
	return {
		cents: toMinorUnits(value, decimals),
		empty: false,
		invalid: false,
		rounded: dropsPrecision(value, decimals)
	};
}

export type MarketQuote = { rate: number; at: number; stale?: boolean };

export type FxDraft = {
	market: MarketQuote | null;
	chargedInput: string;
	/** the charged amount is fixed (typed, or reopened from a stored one) and no longer
	 *  follows the rate when the foreign amount changes */
	pinned: boolean;
	/** the expense as stored, so an untouched save writes back exactly the same values.
	 *  `charged` is absent for expenses saved before charged amounts existed. */
	kept?: { amount: number; rate: number; charged?: number; at?: number };
};

export const EMPTY_FX: FxDraft = { market: null, chargedInput: '', pinned: false };

export type FxContext = {
	amountCents: number;
	currency: string;
	baseCurrency: string;
	baseDecimals: number;
};

const toBaseString = (cents: number, decimals: number) => (cents / 10 ** decimals).toFixed(decimals);

export function seedFx(seed: Expense | undefined, baseCurrency: string, baseDecimals: number): FxDraft {
	if (!seed?.exchangeRate || seed.currency === baseCurrency) return EMPTY_FX;
	const kept = {
		amount: seed.amount,
		rate: seed.exchangeRate,
		charged: seed.chargedAmount,
		at: seed.rateFetchedAt
	};
	const market =
		seed.marketRate !== undefined ? { rate: seed.marketRate, at: seed.rateFetchedAt ?? 0 } : null;
	if (seed.chargedAmount === undefined) return { market, chargedInput: '', pinned: false, kept };
	return { market, chargedInput: toBaseString(seed.chargedAmount, baseDecimals), pinned: true, kept };
}

/** The rate an unpinned charged amount follows: the market, or an older expense's own rate. */
function followRate(draft: FxDraft): number | null {
	if (draft.market) return draft.market.rate;
	if (draft.kept && draft.kept.charged === undefined) return draft.kept.rate;
	return null;
}

export type FxView = {
	/** text for the charged input */
	charged: string;
	chargedCents: number | null;
	/** set while the charged amount is pinned, for its rounding note */
	chargedParsed: MoneyInput | null;
	/** the effective rate, i.e. charged per foreign unit */
	rate: number | null;
	/** charged relative to the market value, in percent; null without a market rate */
	percent: number | null;
	/** "Use market rate" applies: pinned to something other than the market amount */
	canUseMarket: boolean;
};

export function fxView(draft: FxDraft, ctx: FxContext): FxView {
	const atMarket = draft.market
		? convertCents(ctx.amountCents, ctx.currency, ctx.baseCurrency, draft.market.rate)
		: null;
	let chargedCents: number | null;
	let chargedParsed: MoneyInput | null = null;
	let rate: number | null;
	if (draft.pinned) {
		chargedParsed = parseMoney(draft.chargedInput, ctx.baseDecimals);
		chargedCents = chargedParsed.invalid || chargedParsed.empty ? null : chargedParsed.cents;
		rate = chargedCents ? rateFromAmounts(ctx.amountCents, ctx.currency, chargedCents, ctx.baseCurrency) : null;
	} else {
		rate = followRate(draft);
		chargedCents = rate === null ? null : convertCents(ctx.amountCents, ctx.currency, ctx.baseCurrency, rate);
	}
	const percent =
		atMarket && chargedCents !== null && atMarket > 0 ? ((chargedCents - atMarket) / atMarket) * 100 : null;
	return {
		charged: draft.pinned ? draft.chargedInput : chargedCents === null ? '' : toBaseString(chargedCents, ctx.baseDecimals),
		chargedCents,
		chargedParsed,
		rate,
		percent,
		canUseMarket: draft.pinned && atMarket !== null && chargedCents !== atMarket
	};
}

export function editCharged(draft: FxDraft, value: string): FxDraft {
	return { ...draft, chargedInput: value, pinned: true };
}

/** Back to following the market rate. */
export function useMarket(draft: FxDraft): FxDraft {
	return draft.market ? { ...draft, pinned: false } : draft;
}

/** A fetched market rate never changes what the expense costs once it has a value of its
 *  own: a pinned amount stays, and an older expense following its stored rate gets pinned
 *  at that value first. Only a fresh, untouched amount moves to the new market rate. */
export function applyMarket(draft: FxDraft, quote: MarketQuote, ctx: FxContext): FxDraft {
	if (!draft.pinned && draft.kept && draft.kept.charged === undefined && !draft.market) {
		const current = fxView(draft, ctx).charged;
		return { ...draft, market: quote, chargedInput: current, pinned: true };
	}
	return { ...draft, market: quote };
}

export type FxSave = Pick<Expense, 'exchangeRate' | 'chargedAmount' | 'marketRate' | 'rateFetchedAt'>;

/** The conversion fields to store, or null when there's nothing valid to convert with. */
export function fxForSave(draft: FxDraft, ctx: FxContext, now: number): FxSave | null {
	const view = fxView(draft, ctx);
	if (view.chargedCents === null || view.chargedCents <= 0 || view.rate === null) return null;
	const kept = draft.kept;
	const at = draft.market ? draft.market.at : (kept?.at ?? now);

	// an older expense nobody touched: leave it exactly as stored
	if (!draft.pinned && !draft.market && kept && kept.charged === undefined) {
		return { exchangeRate: kept.rate, chargedAmount: undefined, marketRate: undefined, rateFetchedAt: kept.at };
	}
	const unchanged = kept && kept.amount === ctx.amountCents && kept.charged === view.chargedCents;
	return {
		// a rate derived from the charged amount, so older clients compute the same balance
		exchangeRate: kept && unchanged ? kept.rate : draft.pinned ? view.rate : (draft.market?.rate ?? view.rate),
		chargedAmount: view.chargedCents,
		marketRate: draft.market?.rate,
		rateFetchedAt: at
	};
}

/** Only the latest request may apply its result; anything started before a later begin()
 *  or invalidate() is stale when it resolves. */
export function createRequestGate() {
	let current = 0;
	return {
		begin: () => ++current,
		isCurrent: (token: number) => token === current,
		invalidate: () => {
			current++;
		}
	};
}
