import { describe, expect, it } from 'vitest';
import {
	CURRENCY_PRESETS,
	POPULAR_COUNT,
	currencyDecimals,
	isPrecisionCapped,
	currencySymbolFor,
	findCurrency,
	searchCurrencies
} from './currencies';

describe('currency list', () => {
	it('includes Cape Verdean escudo', () => {
		expect(findCurrency('cve')?.name).toBe('Cape Verdean Escudo');
	});

	it('leads with the popular set and has no duplicate codes', () => {
		expect(CURRENCY_PRESETS[0].code).toBe('EUR');
		const codes = CURRENCY_PRESETS.map((p) => p.code);
		expect(new Set(codes).size).toBe(codes.length);
		expect(codes.length).toBeGreaterThan(150);
		expect(POPULAR_COUNT).toBeLessThan(codes.length);
	});

	it('keeps hand-picked symbols and falls back to the code', () => {
		expect(currencySymbolFor('EUR')).toBe('€');
		expect(currencySymbolFor('₿')).toBe('₿');
	});

	it('never gives a non-popular currency a symbol the popular set already uses', () => {
		const popular = new Set(CURRENCY_PRESETS.slice(0, POPULAR_COUNT).map((p) => p.sym));
		const clashes = CURRENCY_PRESETS.slice(POPULAR_COUNT).filter((p) => popular.has(p.sym));
		expect(clashes).toEqual([]);
	});
});

describe('searchCurrencies', () => {
	it('matches by code prefix and by name, ignoring accents', () => {
		expect(searchCurrencies('cv').map((p) => p.code)).toContain('CVE');
		expect(searchCurrencies('escudo').map((p) => p.code)).toEqual(['CVE']);
		expect(searchCurrencies('zloty').map((p) => p.code)).toContain('PLN');
		expect(searchCurrencies('ZŁOTY').map((p) => p.code)).toContain('PLN');
	});

	it('puts an exact code match first', () => {
		expect(searchCurrencies('aud')[0].code).toBe('AUD');
		expect(searchCurrencies('try')[0].code).toBe('TRY');
	});

	it('returns everything for an empty query', () => {
		expect(searchCurrencies('  ')).toBe(CURRENCY_PRESETS);
	});
});

describe('currencyDecimals', () => {
	it('keeps three-decimal ISO currencies at 2 so stored amounts keep their value', () => {
		expect(currencyDecimals('JPY')).toBe(0);
		expect(currencyDecimals('EUR')).toBe(2);
		expect(currencyDecimals('kwd')).toBe(2);
		expect(currencyDecimals('IQD')).toBe(2);
		expect(isPrecisionCapped('kwd')).toBe(true);
		expect(isPrecisionCapped('IQD')).toBe(true);
		expect(isPrecisionCapped('EUR')).toBe(false);
	});
});

describe('storage scale compatibility', () => {
	// amounts are stored as integers scaled by the currency's decimals, so these must never
	// change for a code that already exists in someone's data. Frozen copy of the original rule.
	const LEGACY_ZERO = new Set(
		'JPY KRW VND ISK CLP PYG UGX XAF XOF XPF BIF DJF GNF KMF RWF'.split(' ')
	);
	const legacyDecimals = (code: string) => (LEGACY_ZERO.has(code.toUpperCase()) ? 0 : 2);

	it('keeps every selectable currency at its original scale', () => {
		const changed = CURRENCY_PRESETS.filter((p) => currencyDecimals(p.code) !== legacyDecimals(p.code));
		expect(changed.map((p) => p.code)).toEqual([]);
	});

	it('keeps custom symbols and unknown codes at 2', () => {
		for (const code of ['₿', 'kr', 'XYZ', 'vuv', '']) {
			expect(currencyDecimals(code)).toBe(legacyDecimals(code));
		}
	});
});
