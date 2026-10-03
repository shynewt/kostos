export type CurrencyPreset = { code: string; sym: string; name: string };

const ZERO_DECIMAL_CURRENCIES = new Set([
	'JPY',
	'KRW',
	'VND',
	'ISK',
	'CLP',
	'PYG',
	'UGX',
	'XAF',
	'XOF',
	'XPF',
	'BIF',
	'DJF',
	'GNF',
	'KMF',
	'RWF'
]);

// ISO 4217 three-decimal currencies, deliberately stored at 2. Amounts are integers whose
// scale comes from the currency code, so moving these to 3 would revalue every stored amount
// and make old and new clients disagree. Real support needs a per-record scale.
const THREE_DECIMAL_ISO = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function currencyDecimals(code: string | undefined | null): number {
	if (!code) return 2;
	return ZERO_DECIMAL_CURRENCIES.has(code.toUpperCase()) ? 0 : 2;
}

/** True when the app keeps fewer decimals than ISO 4217 defines for the currency. */
export function isPrecisionCapped(code: string): boolean {
	return THREE_DECIMAL_ISO.has(code.toUpperCase());
}

// hand-picked symbols; these also lead the picker
const POPULAR: CurrencyPreset[] = [
	{ code: 'EUR', sym: '€', name: 'Euro' },
	{ code: 'USD', sym: '$', name: 'US Dollar' },
	{ code: 'GBP', sym: '£', name: 'British Pound' },
	{ code: 'JPY', sym: '¥', name: 'Japanese Yen' },
	{ code: 'CHF', sym: 'Fr', name: 'Swiss Franc' },
	{ code: 'CAD', sym: 'C$', name: 'Canadian Dollar' },
	{ code: 'AUD', sym: 'A$', name: 'Australian Dollar' },
	{ code: 'BRL', sym: 'R$', name: 'Brazilian Real' },
	{ code: 'MXN', sym: 'Mex$', name: 'Mexican Peso' },
	{ code: 'INR', sym: '₹', name: 'Indian Rupee' },
	{ code: 'CNY', sym: '¥', name: 'Chinese Yuan' },
	{ code: 'KRW', sym: '₩', name: 'South Korean Won' },
	{ code: 'SEK', sym: 'kr', name: 'Swedish Krona' },
	{ code: 'NOK', sym: 'kr', name: 'Norwegian Krone' },
	{ code: 'PLN', sym: 'zł', name: 'Polish Złoty' },
	{ code: 'TRY', sym: '₺', name: 'Turkish Lira' }
];

// the rest of what open.er-api.com quotes, minus obsolete codes and units of account
const OTHER_CODES =
	'AED AFN ALL AMD AOA ARS AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BSD BTN BWP BYN BZD ' +
	'CDF CLP COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB FJD FKP GEL GHS GIP GMD GNF GTQ ' +
	'GYD HKD HNL HTG HUF IDR ILS IQD IRR ISK JMD JOD KES KGS KHR KMF KWD KYD KZT LAK LBP LKR ' +
	'LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MYR MZN NAD NGN NIO NPR NZD OMR ' +
	'PAB PEN PGK PHP PKR PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SGD SHP SLE SOS SRD SSP STN ' +
	'SYP SZL THB TJS TMT TND TOP TTD TWD TZS UAH UGX UYU UZS VES VND VUV WST XAF XCD XCG XOF ' +
	'XPF YER ZAR ZMW ZWG';

function intlPreset(code: string): CurrencyPreset {
	let name = code;
	let sym = code;
	try {
		name = new Intl.DisplayNames('en', { type: 'currency' }).of(code) ?? code;
		// 'symbol', not 'narrowSymbol': narrow renders NZD, ARS, HKD and friends all as "$"
		sym =
			new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'symbol' })
				.formatToParts(0)
				.find((part) => part.type === 'currency')?.value ?? code;
	} catch {
		// older engines without Intl.DisplayNames fall back to the bare code
	}
	return { code, sym, name };
}

/** Every selectable currency: the popular set first, then the rest by name. */
export const CURRENCY_PRESETS: CurrencyPreset[] = [
	...POPULAR,
	...OTHER_CODES.split(' ')
		.map(intlPreset)
		.sort((a, b) => a.name.localeCompare(b.name))
];

export const POPULAR_COUNT = POPULAR.length;

const BY_CODE = new Map(CURRENCY_PRESETS.map((p) => [p.code, p]));

export function findCurrency(code: string): CurrencyPreset | undefined {
	return BY_CODE.get(code.toUpperCase());
}

export function currencySymbolFor(code: string): string {
	return findCurrency(code)?.sym ?? code;
}

const fold = (s: string) =>
	s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/ł/g, 'l');

/** Filter presets by code or name, keeping list order but putting an exact code hit first. */
export function searchCurrencies(query: string): CurrencyPreset[] {
	const q = fold(query.trim());
	if (!q) return CURRENCY_PRESETS;
	const matches = CURRENCY_PRESETS.filter(
		(p) => p.code.toLowerCase().startsWith(q) || fold(p.name).includes(q)
	);
	const exact = matches.findIndex((p) => p.code.toLowerCase() === q);
	if (exact > 0) matches.unshift(...matches.splice(exact, 1));
	return matches;
}
