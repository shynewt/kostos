import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { balancesByCurrency, parseSplitwiseCsv, type SplitwiseFile } from './splitwise';
import { groupNameFromFileName } from './splitwise-name';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function parseOk(text: string): SplitwiseFile {
	const result = parseSplitwiseCsv(text);
	if (!result.ok) throw new Error(result.error);
	return result.file;
}

function parseError(text: string): string {
	const result = parseSplitwiseCsv(text);
	if (result.ok) throw new Error('expected the file to be rejected');
	return result.error;
}

describe('parseCsv', () => {
	it('keeps delimiters, doubled quotes and line breaks inside quoted fields', () => {
		expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\n1,2,3,4')).toEqual([
			['a', 'b, c', 'say "hi"', 'two\nlines'],
			['1', '2', '3', '4']
		]);
	});

	it('strips a BOM and accepts Windows and old Mac line endings', () => {
		expect(parseCsv('﻿a,b\r\n1,2\r3,4\r\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
	});

	it('detects semicolon separated files', () => {
		expect(parseCsv('a;b\n"1,5";2')).toEqual([['a', 'b'], ['1,5', '2']]);
	});
});

describe('parseSplitwiseCsv', () => {
	it('reads members, rows, payments and the total row', () => {
		const file = parseOk(fixture('splitwise-flat.csv'));
		expect(file.members).toEqual(['Alice', 'Bob', 'Carol']);
		expect(file.rows).toHaveLength(7);
		expect(file.rows[1]).toMatchObject({ description: 'Dinner, pizza and wine', category: 'Dining out', cost: 820, currency: 'EUR', nets: [-273, 547, -274] });
		expect(file.rows.filter((row) => row.isPayment).map((row) => row.description)).toEqual(['Bob paid Alice']);
		expect(file.totals.get('EUR')).toEqual([5577, 47, -5624]);
		expect(file.warnings).toEqual([]);
	});

	it('stores dates at local noon of the exported day', () => {
		const date = new Date(parseOk(fixture('splitwise-flat.csv')).rows[0].date);
		expect([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()]).toEqual([2024, 3, 1, 12]);
	});

	it('sums the rows to the total row in every currency', () => {
		for (const name of ['splitwise-flat.csv', 'splitwise-german.csv', 'splitwise-trip.csv']) {
			const file = parseOk(fixture(name));
			expect(balancesByCurrency(file)).toEqual(file.totals);
		}
	});

	it('reads an export from an account set to German', () => {
		const file = parseOk(fixture('splitwise-german.csv'));
		expect(file.members).toEqual(['Alice', 'Bob', 'Carol']);
		expect(file.rows.map((row) => row.isPayment)).toEqual([false, false, true]);
		expect(file.totals.get('EUR')).toEqual([-150, 200, -50]);
	});

	it('keeps one total row per currency', () => {
		const file = parseOk(fixture('splitwise-trip.csv'));
		expect([...file.totals.keys()]).toEqual(['EUR', 'JPY', 'USD']);
		expect(file.totals.get('JPY')).toEqual([-1000, 2000, -1000]);
		expect(file.rows.find((row) => row.currency === 'JPY')?.cost).toBe(3000);
	});

	it('accepts a BOM, Windows line endings, reordered columns and quoted cells', () => {
		const text = '﻿"Description","Bob","Date","Cost","Currency","Category","Alice"\r\n' +
			'"Fish, chips",-6.00,2024-01-02,12.00,eur,Dining out,6.00\r\n' +
			'\r\n' +
			'"Total balance",-6.00,2024-01-02," ",EUR," ",6.00\r\n';
		const file = parseOk(text);
		expect(file.members).toEqual(['Bob', 'Alice']);
		expect(file.rows).toEqual([expect.objectContaining({ description: 'Fish, chips', cost: 1200, currency: 'EUR', nets: [-600, 600] })]);
		expect(file.totals.get('EUR')).toEqual([-600, 600]);
	});

	it('reads semicolon files with decimal commas and amounts with thousands separators', () => {
		const semicolons = parseOk('Date;Description;Category;Cost;Currency;Alice;Bob\n2024-01-02;Rent;Rent;1.234,50;EUR;617,25;-617,25\n');
		expect(semicolons.rows[0]).toMatchObject({ cost: 123450, nets: [61725, -61725] });
		const grouped = parseOk('Date,Description,Category,Cost,Currency,Alice,Bob\n2024-01-02,Rent,Rent,"1,234.50",EUR,"617.25","-617.25"\n');
		expect(grouped.rows[0]).toMatchObject({ cost: 123450, nets: [61725, -61725] });
	});

	it('reads whole numbers and treats empty member cells as zero', () => {
		const file = parseOk('Date,Description,Category,Cost,Currency,Alice,Bob,Carol\n2024-01-02,Lunch,General,20,USD,10,-10,\n');
		expect(file.rows[0].nets).toEqual([1000, -1000, 0]);
	});

	it('rounds amounts finer than the currency allows while keeping the row balanced', () => {
		const file = parseOk('Date,Description,Category,Cost,Currency,Alice,Bob,Carol\n2024-01-02,Sushi,General,1000.00,JPY,666.67,-333.33,-333.34\n');
		expect(file.rows[0].nets).toEqual([667, -333, -334]);
		expect(file.warnings).toHaveLength(1);
	});

	it('gives duplicate member names a suffix so they stay apart', () => {
		const file = parseOk('Date,Description,Category,Cost,Currency,Alice,Alice\n2024-01-02,Lunch,General,20.00,EUR,10.00,-10.00\n');
		expect(file.members).toEqual(['Alice', 'Alice (2)']);
	});

	it('warns when the total row disagrees with the rows', () => {
		const file = parseOk('Date,Description,Category,Cost,Currency,Alice,Bob\n2024-01-02,Lunch,General,20.00,EUR,10.00,-10.00\n2024-01-02,Total balance, , ,EUR,12.00,-12.00\n');
		expect(file.warnings).toEqual(['The file’s total row for EUR doesn’t match its expenses. Kostos uses the expenses.']);
	});

	it('rejects files that are not a Splitwise export', () => {
		expect(parseError('')).toBe('This file is empty.');
		expect(parseError('name,amount\nAlice,10\n')).toMatch(/doesn’t look like a Splitwise export/);
		expect(parseError('{"app":"kostos"}')).toMatch(/doesn’t look like a Splitwise export/);
		expect(parseError('Fecha,Descripción,Categoría,Coste,Moneda,Alice\nsoon,x,y,1,EUR,0\n')).toMatch(/doesn’t look like a Splitwise export/);
	});

	it('rejects exports with no members or no expenses', () => {
		expect(parseError('Date,Description,Category,Cost,Currency\n2024-01-02,Lunch,General,20.00,EUR\n')).toMatch(/no member columns/);
		expect(parseError('Date,Description,Category,Cost,Currency,Alice,Bob\n\n2024-01-02,Total balance, , ,EUR,0.00,0.00\n')).toMatch(/no expenses/);
	});

	it('names the line when a row is malformed', () => {
		const header = 'Date,Description,Category,Cost,Currency,Alice,Bob\n';
		expect(parseError(`${header}31/12/2024,Lunch,General,20.00,EUR,10.00,-10.00\n`)).toBe('Line 2 has “31/12/2024” where a date like 2024-05-31 should be.');
		expect(parseError(`${header}2024-02-30,Lunch,General,20.00,EUR,10.00,-10.00\n`)).toMatch(/Line 2 has “2024-02-30”/);
		expect(parseError(`${header}2024-01-02,Lunch,General,twenty,EUR,10.00,-10.00\n`)).toBe('Line 2 has “twenty” where an amount should be.');
		expect(parseError(`${header}2024-01-02,Lunch,General,20.00,Euro,10.00,-10.00\n`)).toMatch(/Line 2 has “Euro” where a currency code/);
		expect(parseError(`${header}2024-01-02,Lunch,General,20.00,EUR,10.00,-9.00\n`)).toBe('Line 2 (Lunch) doesn’t add up: the member amounts should cancel out to zero.');
	});
});

describe('groupNameFromFileName', () => {
	it('drops the extension, dates and the word export', () => {
		expect(groupNameFromFileName('weekend-in-lisbon_2024-05-31_export.csv')).toBe('Weekend in lisbon');
		expect(groupNameFromFileName('Flat 12 (1).csv')).toBe('Flat 12');
		expect(groupNameFromFileName('export.csv')).toBe('Splitwise group');
	});
});
