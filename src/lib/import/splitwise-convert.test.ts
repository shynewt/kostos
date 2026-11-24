import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeBalances, expenseShares } from '$lib/balance';
import type { Expense, Member } from '$lib/types';
import { parseSplitwiseCsv, type SplitwiseFile } from './splitwise';
import { buildMembers, convertSplitwise, mostUsedCurrency, splitwiseCategoryId } from './splitwise-convert';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function parseOk(text: string): SplitwiseFile {
	const result = parseSplitwiseCsv(text);
	if (!result.ok) throw new Error(result.error);
	return result.file;
}

function convert(text: string, rates: Record<string, number> = {}) {
	const file = parseOk(text);
	const members = buildMembers(file.members, 0);
	const baseCurrency = mostUsedCurrency(file);
	return { file, baseCurrency, ...convertSplitwise(file, members, { baseCurrency, rates, now: 0 }) };
}

function balancesIn(members: Member[], expenses: Expense[], currency: string): number[] {
	const nets = new Map(computeBalances(members, expenses.filter((expense) => expense.currency === currency)).map((b) => [b.memberId, b.net]));
	return members.map((member) => nets.get(member.id) ?? 0);
}

function name(members: Member[], id: string): string | undefined {
	return members.find((member) => member.id === id)?.name;
}

describe('convertSplitwise', () => {
	it('gives every member exactly their Splitwise balance in each currency', () => {
		for (const fixtureName of ['splitwise-flat.csv', 'splitwise-german.csv', 'splitwise-trip.csv']) {
			const { file, members, expenses } = convert(fixture(fixtureName), { JPY: 0.006, USD: 0.9 });
			for (const [currency, totals] of file.totals) expect(balancesIn(members, expenses, currency)).toEqual(totals);
		}
	});

	it('moves each member by exactly the row amount, so every expense matches its row', () => {
		const { file, members, expenses } = convert(fixture('splitwise-flat.csv'));
		const rowsKept = file.rows.filter((row) => row.nets.some((net) => net !== 0));
		expect(expenses).toHaveLength(rowsKept.length);
		rowsKept.forEach((row, index) => {
			expect(balancesIn(members, [expenses[index]], row.currency)).toEqual(row.nets);
			const paid = expenses[index].payments.reduce((total, payment) => total + payment.amount, 0);
			expect(paid).toBe(expenses[index].amount);
			expect([...expenseShares(expenses[index]).values()].reduce((a, b) => a + b, 0)).toBe(expenses[index].amount);
		});
	});

	it('keeps the date, description, cost and currency of every expense', () => {
		const { file, expenses } = convert(fixture('splitwise-flat.csv'));
		const spending = expenses.filter((expense) => !expense.isSettlement);
		const rows = file.rows.filter((row) => !row.isPayment && row.nets.some((net) => net !== 0));
		expect(spending.map((e) => [e.date, e.description, e.amount, e.currency])).toEqual(rows.map((r) => [r.date, r.description, r.cost, r.currency]));
	});

	it('has the payer pay the full cost and keep their own share', () => {
		const { members, expenses } = convert(fixture('splitwise-flat.csv'));
		const groceries = expenses[0];
		expect(groceries.payments).toEqual([{ memberId: members[0].id, amount: 6000 }]);
		expect(groceries.splitMode).toBe('even');
		expect(groceries.splits.map((split) => name(members, split.memberId)).sort()).toEqual(['Alice', 'Bob', 'Carol']);
	});

	it('uses an even split for uneven cents that Kostos would spread the same way', () => {
		const { members, expenses } = convert(fixture('splitwise-flat.csv'));
		const dinner = expenses[1];
		expect(dinner.splitMode).toBe('even');
		expect([...expenseShares(dinner)].map(([id, cents]) => [name(members, id), cents]).sort()).toEqual([['Alice', 273], ['Bob', 273], ['Carol', 274]]);
	});

	it('splits the payers’ own shares between several payers', () => {
		const { members, expenses } = convert(fixture('splitwise-flat.csv'));
		const train = expenses.find((expense) => expense.description === 'Train tickets')!;
		expect(train.amount).toBe(4500);
		expect(train.payments.map((p) => [name(members, p.memberId), p.amount])).toEqual([['Alice', 3214], ['Bob', 1286]]);
		expect(train.splitMode).toBe('amount');
		expect(train.splits.map((s) => [name(members, s.memberId), s.amount])).toEqual([['Alice', 714], ['Bob', 286], ['Carol', 3500]]);
	});

	it('turns payments into settlements from the payer to the receiver', () => {
		const { members, expenses } = convert(fixture('splitwise-flat.csv'));
		const settlements = expenses.filter((expense) => expense.isSettlement);
		expect(settlements).toHaveLength(1);
		expect(settlements[0]).toMatchObject({ amount: 1500, description: 'Bob paid Alice', splitMode: 'even' });
		expect(name(members, settlements[0].payments[0].memberId)).toBe('Bob');
		expect(settlements[0].splits.map((s) => name(members, s.memberId))).toEqual(['Alice']);
	});

	it('pairs a payment with several people on each side into one settlement each', () => {
		const { members, expenses } = convert('Date,Description,Category,Cost,Currency,Alice,Bob,Carol,Dan\n2024-01-02,Settling up,Payment,30.00,EUR,20.00,10.00,-15.00,-15.00\n');
		expect(expenses.every((expense) => expense.isSettlement)).toBe(true);
		expect(expenses.map((e) => [name(members, e.payments[0].memberId), name(members, e.splits[0].memberId), e.amount])).toEqual([
			['Alice', 'Carol', 1500],
			['Alice', 'Dan', 500],
			['Bob', 'Dan', 1000]
		]);
	});

	it('leaves out rows that changed nobody’s balance', () => {
		const { skippedRows, expenses } = convert(fixture('splitwise-flat.csv'));
		expect(skippedRows.map((row) => row.description)).toEqual(['Sunscreen']);
		expect(expenses.some((expense) => expense.description === 'Sunscreen')).toBe(false);
	});

	it('uses the amount owed when a row costs less than that, and reports it', () => {
		const { members, expenses, adjustedRows } = convert('Date,Description,Category,Cost,Currency,Alice,Bob\n2024-01-02,Refund,General,0.00,EUR,5.00,-5.00\n');
		expect(adjustedRows).toHaveLength(1);
		expect(expenses[0].amount).toBe(500);
		expect(balancesIn(members, expenses, 'EUR')).toEqual([500, -500]);
	});

	it('maps obvious Splitwise categories and leaves the rest for the guesser', () => {
		const { expenses } = convert(fixture('splitwise-flat.csv'));
		expect(expenses.filter((e) => !e.isSettlement).map((e) => e.categoryId)).toEqual(['cat-groceries', 'cat-restaurants', 'cat-transport', 'cat-activities', 'cat-transport']);
		expect(splitwiseCategoryId('General')).toBeUndefined();
		expect(splitwiseCategoryId('Allgemein')).toBeUndefined();
		expect(splitwiseCategoryId(' Hotel ')).toBe('cat-lodging');
	});

	it('keeps foreign expenses in their own currency with the rate given, and adds them up in the base', () => {
		const { members, expenses, baseCurrency } = convert(fixture('splitwise-trip.csv'), { JPY: 0.006, USD: 0.9 });
		expect(baseCurrency).toBe('EUR');
		const ramen = expenses.find((expense) => expense.description === 'Ramen')!;
		expect(ramen).toMatchObject({ currency: 'JPY', amount: 3000, exchangeRate: 0.006, marketRate: 0.006, chargedAmount: 1800 });
		expect(expenses.find((expense) => expense.description === 'Hotel')?.exchangeRate).toBeUndefined();
		const inBase = new Map(computeBalances(members, expenses, 'EUR').map((b) => [b.memberId, b.net]));
		expect(members.map((member) => inBase.get(member.id))).toEqual([13950, -9250, -4700]);
	});

	it('refuses to convert a foreign currency without a rate', () => {
		const file = parseOk(fixture('splitwise-trip.csv'));
		expect(() => convertSplitwise(file, buildMembers(file.members), { baseCurrency: 'EUR', rates: { USD: 0.9 } })).toThrow('No exchange rate for JPY');
	});

	it('picks the currency most rows use as the base', () => {
		expect(mostUsedCurrency(parseOk(fixture('splitwise-trip.csv')))).toBe('EUR');
	});
});

describe('splitwiseCategoryId with odd names', () => {
	it('matches only real categories, never inherited object keys', () => {
		for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
			expect(splitwiseCategoryId(name)).toBeUndefined();
		}
	});
});
