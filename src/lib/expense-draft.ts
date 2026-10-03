/* Money logic behind the expense form, kept out of the component so it can be tested.
 *
 * Every money field is parsed once into a MoneyInput. The exchange rate lives in a
 * RateDraft: a typed or fetched rate, a "charged" amount (what the bank actually took, in
 * the base currency) that the rate is derived from, or the exact rate an existing expense
 * was saved with. */

import { convertCents, formatRate, rateFromAmounts } from './currency-convert';
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

export type RateDraft = {
	source: 'rate' | 'charged';
	rateInput: string;
	chargedInput: string;
	/** the stored rate of the expense being edited, used exactly until either field is
	 *  edited; the inputs only show it rounded */
	keptRate?: number;
};

export const EMPTY_RATE_DRAFT: RateDraft = { source: 'rate', rateInput: '', chargedInput: '' };

/** Reopening an expense always starts from its stored rate. Whether it was typed or came
 *  from a charged amount isn't recorded, and guessing from its digits gets both cases wrong. */
export function seedRateDraft(seed: Expense | undefined, baseCurrency: string): RateDraft {
	if (!seed?.exchangeRate || seed.currency === baseCurrency) return EMPTY_RATE_DRAFT;
	return { ...EMPTY_RATE_DRAFT, rateInput: formatRate(seed.exchangeRate), keptRate: seed.exchangeRate };
}

export function editRate(draft: RateDraft, value: string): RateDraft {
	return { ...draft, source: 'rate', rateInput: value, keptRate: undefined };
}

export function editCharged(draft: RateDraft, value: string): RateDraft {
	return { ...draft, source: 'charged', chargedInput: value, keptRate: undefined };
}

/** A fetched rate only lands while the user hasn't pinned a charged amount. */
export function applyFetchedRate(draft: RateDraft, rate: number): RateDraft {
	if (draft.source === 'charged') return draft;
	return editRate(draft, formatRate(rate));
}

export type RateContext = {
	amountCents: number;
	currency: string;
	baseCurrency: string;
	baseDecimals: number;
};

/** The effective rate, plus the parsed charged amount when that's what drives it. */
function resolveDraft(
	draft: RateDraft,
	ctx: RateContext
): { rate: number | null; charged: MoneyInput | null } {
	if (draft.keptRate !== undefined) return { rate: draft.keptRate, charged: null };
	if (draft.source === 'charged') {
		const charged = parseMoney(draft.chargedInput, ctx.baseDecimals);
		const rate =
			charged.invalid || charged.cents <= 0
				? null
				: rateFromAmounts(ctx.amountCents, ctx.currency, charged.cents, ctx.baseCurrency);
		return { rate, charged };
	}
	const value = parseFloat(draft.rateInput);
	return { rate: Number.isFinite(value) && value > 0 ? value : null, charged: null };
}

export function draftRate(draft: RateDraft, ctx: RateContext): number | null {
	return resolveDraft(draft, ctx).rate;
}

/** What each rate field displays: the field being typed in shows the raw text, the other
 *  one follows from the effective rate. `chargedParsed` is set while the charged amount
 *  drives the rate. */
export function rateFields(
	draft: RateDraft,
	ctx: RateContext
): {
	rate: string;
	charged: string;
	rateValue: number | null;
	baseCents: number;
	chargedParsed: MoneyInput | null;
} {
	const { rate: rateValue, charged: chargedParsed } = resolveDraft(draft, ctx);
	const baseCents = rateValue ? convertCents(ctx.amountCents, ctx.currency, ctx.baseCurrency, rateValue) : 0;
	const baseStr = (baseCents / 10 ** ctx.baseDecimals).toFixed(ctx.baseDecimals);
	return {
		rate: draft.source === 'rate' ? draft.rateInput : rateValue ? formatRate(rateValue) : '',
		charged: draft.source === 'charged' ? draft.chargedInput : rateValue ? baseStr : '',
		rateValue,
		baseCents,
		chargedParsed
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
