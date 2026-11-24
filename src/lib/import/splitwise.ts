/* Splitwise group export (CSV) reader.
 *
 * The export has `Date,Description,Category,Cost,Currency` and then one column per member
 * holding that member's net effect for the row: positive when they paid more than their
 * share, negative when they owe. Payments between members use the category "Payment".
 * A last "Total balance" row, with a blank category and cost, repeats each member's balance.
 * Splitwise translates the header and the text cells into the account's language (a German
 * account writes `Datum,Beschreibung,...` and "Zahlung"), while numbers and dates stay as is. */

import { currencyDecimals } from '$lib/currencies';
import { parseCsv } from './csv';

export type SplitwiseRow = {
	/** 1-based line in the file, for error messages */
	line: number;
	date: number;
	description: string;
	category: string;
	/** minor units of `currency` */
	cost: number;
	currency: string;
	/** minor units, one per member in file order; they sum to zero */
	nets: number[];
	isPayment: boolean;
};

export type SplitwiseFile = {
	members: string[];
	rows: SplitwiseRow[];
	/** the file's own "Total balance" rows by currency, when it has them */
	totals: Map<string, number[]>;
	warnings: string[];
};

export type SplitwiseParseResult = { ok: true; file: SplitwiseFile } | { ok: false; error: string };

const NOT_SPLITWISE =
	'This doesn’t look like a Splitwise export. In Splitwise, open the group, open its settings (the gear icon) and export it as a spreadsheet, then pick that CSV file here.';

const FIXED_COLUMNS = ['date', 'description', 'category', 'cost', 'currency'] as const;

// "Payment" as Splitwise writes it in the languages it offers; rows in other languages
// import as ordinary expenses, which move the balances the same way
const PAYMENT_CATEGORIES = new Set([
	'payment', 'zahlung', 'pago', 'paiement', 'pagamento', 'betaling', 'płatność', 'platba', 'plata',
	'betalning', 'maksu', 'ödeme', 'платеж', 'платёж', 'платіж', 'πληρωμή', 'תשלום', 'pembayaran', '付款', '支払い'
]);

class RowError extends Error {}

export function parseSplitwiseCsv(text: string): SplitwiseParseResult {
	const table = parseCsv(text).map((cells) => cells.map((cell) => cell.trim()));
	const nonEmpty = table
		.map((cells, index) => ({ cells, line: index + 1 }))
		.filter(({ cells }) => cells.some((cell) => cell !== ''));
	if (nonEmpty.length === 0) return { ok: false, error: 'This file is empty.' };

	const fixedIndex = findFixedColumns(nonEmpty[0].cells, nonEmpty[1]?.cells);
	if (!fixedIndex) return { ok: false, error: NOT_SPLITWISE };
	const [dateAt, descriptionAt, categoryAt, costAt, currencyAt] = fixedIndex;

	const memberColumns = nonEmpty[0].cells
		.map((name, index) => ({ name, index }))
		.filter(({ index }) => !fixedIndex.includes(index) && nonEmpty[0].cells[index] !== '');
	if (memberColumns.length === 0) {
		return { ok: false, error: 'This Splitwise export has no member columns, so there is nothing to import.' };
	}
	const members = uniqueNames(memberColumns.map(({ name }) => name));

	const rows: SplitwiseRow[] = [];
	const totals = new Map<string, number[]>();
	const warnings: string[] = [];
	try {
		for (const { cells, line } of nonEmpty.slice(1)) {
			const cell = (index: number) => cells[index] ?? '';
			const description = cell(descriptionAt);
			const isTotalRow = cell(categoryAt) === '' && cell(costAt) === '';
			if (isTotalRow && cell(currencyAt) === '') continue;
			const currency = readCurrency(cell(currencyAt), line);
			const decimals = currencyDecimals(currency);
			const rawNets = memberColumns.map(({ index }) => readAmount(cell(index), decimals, line, true));

			if (isTotalRow) {
				totals.set(currency, roundKeepingSum(rawNets, false));
				continue;
			}

			const roundedNets = roundKeepingSum(rawNets, true);
			if (roundedNets.some((net, index) => net !== rawNets[index])) {
				warnings.push(`Line ${line} (${description || 'no description'}) had amounts finer than ${currency} allows; they were rounded.`);
			}
			const sum = roundedNets.reduce((total, net) => total + net, 0);
			if (sum !== 0) {
				throw new RowError(`Line ${line} (${description || 'no description'}) doesn’t add up: the member amounts should cancel out to zero.`);
			}
			rows.push({
				line,
				date: readDate(cell(dateAt), line),
				description,
				category: cell(categoryAt),
				cost: Math.round(readAmount(cell(costAt), decimals, line, false)),
				currency,
				nets: roundedNets,
				isPayment: PAYMENT_CATEGORIES.has(cell(categoryAt).toLowerCase())
			});
		}
	} catch (error) {
		if (error instanceof RowError) return { ok: false, error: error.message };
		throw error;
	}

	if (rows.length === 0) return { ok: false, error: 'This Splitwise export has no expenses in it.' };

	for (const [currency, fileTotals] of totals) {
		const computed = sumNets(rows.filter((row) => row.currency === currency), members.length);
		if (computed.some((net, index) => net !== fileTotals[index])) {
			warnings.push(`The file’s total row for ${currency} doesn’t match its expenses. Kostos uses the expenses.`);
		}
	}

	return { ok: true, file: { members, rows, totals, warnings } };
}

/** Each member's balance per currency, summed from the rows. */
export function balancesByCurrency(file: SplitwiseFile): Map<string, number[]> {
	const result = new Map<string, number[]>();
	for (const currency of new Set(file.rows.map((row) => row.currency))) {
		result.set(currency, sumNets(file.rows.filter((row) => row.currency === currency), file.members.length));
	}
	return result;
}

function sumNets(rows: SplitwiseRow[], memberCount: number): number[] {
	const sums = new Array<number>(memberCount).fill(0);
	for (const row of rows) row.nets.forEach((net, index) => (sums[index] += net));
	return sums;
}

/** Column positions by English name, or the export's fixed order when the header is in
 *  another language and the first row looks like a Splitwise row. */
function findFixedColumns(header: string[], firstRow: string[] | undefined): number[] | null {
	const lowered = header.map((cell) => cell.toLowerCase());
	const byName = FIXED_COLUMNS.map((name) => lowered.indexOf(name));
	if (byName.every((index) => index >= 0)) return byName;
	if (header.length < FIXED_COLUMNS.length + 1 || !firstRow) return null;
	const looksLikeSplitwise = /^\d{4}-\d{2}-\d{2}/.test(firstRow[0] ?? '') && /^[A-Za-z]{3}$/.test(firstRow[4] ?? '');
	return looksLikeSplitwise ? [0, 1, 2, 3, 4] : null;
}

function uniqueNames(names: string[]): string[] {
	const seen = new Map<string, number>();
	return names.map((name) => {
		const count = (seen.get(name) ?? 0) + 1;
		seen.set(name, count);
		return count === 1 ? name : `${name} (${count})`;
	});
}

function readCurrency(raw: string, line: number): string {
	const code = raw.toUpperCase();
	if (!/^[A-Z]{3}$/.test(code)) {
		throw new RowError(`Line ${line} has “${raw}” where a currency code like EUR or USD should be.`);
	}
	return code;
}

/** The day's UTC midnight, the same convention the expense form saves dates with. */
function readDate(raw: string, line: number): number {
	const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T ])/);
	if (iso) {
		const [, year, month, day] = iso.map(Number);
		const date = new Date(Date.UTC(year, month - 1, day));
		if (date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.getTime();
	}
	throw new RowError(`Line ${line} has “${raw}” where a date like 2024-05-31 should be.`);
}

/** Minor units of the row's currency; may be fractional when the file carries more
 *  decimals than the currency, and the caller decides how to round. */
function readAmount(raw: string, decimals: number, line: number, allowEmpty: boolean): number {
	let text = raw.replace(/[\s  ']/g, '').replace(/^\((.*)\)$/, '-$1');
	if (text === '' && allowEmpty) return 0;
	const negative = /^[-−]/.test(text);
	text = text.replace(/^[-+−]/, '');
	const lastDot = text.lastIndexOf('.');
	const lastComma = text.lastIndexOf(',');
	let integerPart = text;
	let fractionPart = '';
	const decimalAt = Math.max(lastDot, lastComma);
	// with only one kind of mark, "1,234" and "1.234.567" group thousands; "12,50" and "1.234" are decimals
	const isGrouping = (lastDot < 0 && /^\d{1,3}(,\d{3})+$/.test(text)) || (lastComma < 0 && /^\d{1,3}(\.\d{3}){2,}$/.test(text));
	if (decimalAt >= 0 && !isGrouping) {
		integerPart = text.slice(0, decimalAt);
		fractionPart = text.slice(decimalAt + 1);
	}
	integerPart = integerPart.replace(/[.,]/g, '');
	if (!/^\d+$/.test(integerPart || '0') || !/^\d*$/.test(fractionPart) || (integerPart === '' && fractionPart === '')) {
		throw new RowError(`Line ${line} has “${raw}” where an amount should be.`);
	}
	const scaled = Number(`${integerPart || '0'}.${fractionPart || '0'}`) * 10 ** decimals;
	if (!Number.isSafeInteger(Math.round(scaled))) {
		throw new RowError(`Line ${line} has an amount too large to import: “${raw}”.`);
	}
	const value = Math.abs(scaled - Math.round(scaled)) < 1e-6 ? Math.round(scaled) : scaled;
	return negative ? -value : value;
}

/** Rounds to whole minor units. With `keepSum`, the rounding errors are pushed onto the
 *  largest fractions so a row that cancelled out before rounding still cancels out after. */
function roundKeepingSum(values: number[], keepSum: boolean): number[] {
	const rounded = values.map((value) => Math.round(value));
	if (!keepSum) return rounded;
	const exactSum = Math.round(values.reduce((total, value) => total + value, 0));
	let drift = exactSum - rounded.reduce((total, value) => total + value, 0);
	const byFraction = values
		.map((value, index) => ({ index, fraction: value - Math.round(value) }))
		.sort((a, b) => (drift > 0 ? b.fraction - a.fraction : a.fraction - b.fraction));
	for (let step = 0; drift !== 0 && step < byFraction.length; step++) {
		rounded[byFraction[step].index] += Math.sign(drift);
		drift -= Math.sign(drift);
	}
	return rounded;
}
