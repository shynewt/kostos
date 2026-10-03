import { describe, expect, it } from 'vitest';
import { parseProjectArchive, serializeProject, toCSV } from './projectArchive';
import type { Category, Expense, Member, PaymentMethodItem, Project } from '$lib/types';

const categories: Category[] = [
	{ id: 'cat-food', name: 'Food', emoji: '🍕' },
	{ id: 'cat-transport', name: 'Transport, etc.', emoji: '🚗' }
];

const paymentMethods: PaymentMethodItem[] = [
	{ id: 'pm-cash', name: 'Cash', emoji: '💵' },
	{ id: 'pm-card', name: 'Card', emoji: '💳' }
];

const project: Project = {
	id: 'PRT-AAAA-BBBB',
	name: 'Lisbon Weekend',
	description: 'June trip',
	emoji: '🏖',
	color: 'lime',
	currency: 'EUR',
	currencySymbol: '€',
	defaultSplit: 'even',
	categories,
	paymentMethods,
	trips: [
		{
			id: 'trip-lx',
			name: 'Lisbon weekend',
			emoji: '🏖',
			startDate: 1700000000000,
			endDate: 1700300000000,
			createdAt: 1700000000000
		}
	],
	createdAt: 1700000000000
};

const members: Member[] = [
	{ id: 'm-alice', name: 'Alice', createdAt: 1700000000000 },
	{ id: 'm-bob', name: 'Bob', createdAt: 1700000000000 },
	{ id: 'm-carol', name: 'Carol "C"', createdAt: 1700000000000 }
];

const expenses: Expense[] = [
	{
		id: 'e1',
		payments: [{ memberId: 'm-alice', amount: 12000 }],
		amount: 12000,
		currency: 'EUR',
		description: 'Dinner, fish',
		categoryId: 'cat-food',
		paymentMethodId: 'pm-card',
		date: 1700100000000,
		splitMode: 'even',
		splits: [{ memberId: 'm-alice' }, { memberId: 'm-bob' }, { memberId: 'm-carol' }],
		notes: 'tasty\nplace',
		createdAt: 1700100000000,
		createdBy: 'm-alice'
	},
	{
		id: 'e2',
		payments: [
			{ memberId: 'm-alice', amount: 5000 },
			{ memberId: 'm-bob', amount: 3000 }
		],
		amount: 8000,
		currency: 'EUR',
		description: 'Tickets',
		categoryId: 'cat-transport',
		date: 1700200000000,
		splitMode: 'shares',
		splits: [
			{ memberId: 'm-alice', shares: 2 },
			{ memberId: 'm-bob', shares: 1 }
		],
		createdAt: 1700200000000,
		createdBy: 'm-bob'
	},
	{
		id: 'e3',
		payments: [{ memberId: 'm-carol', amount: 9000 }],
		amount: 9000,
		currency: 'EUR',
		description: 'Groceries',
		date: 1700300000000,
		splitMode: 'amount',
		splits: [
			{ memberId: 'm-alice', amount: 3000 },
			{ memberId: 'm-bob', amount: 2500 },
			{ memberId: 'm-carol', amount: 3500 }
		],
		createdAt: 1700300000000,
		createdBy: 'm-carol'
	}
];

describe('serializeProject + parseProjectArchive', () => {
	it('round-trips full project state', () => {
		const archive = serializeProject(project, members, expenses);
		const result = parseProjectArchive(JSON.stringify(archive));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.archive.project.name).toBe('Lisbon Weekend');
		expect(result.archive.project.currency).toBe('EUR');
		expect(result.archive.project.categories).toHaveLength(2);
		expect(result.archive.members).toEqual(members);
		expect(result.archive.expenses).toEqual(expenses);
	});

	it('omits the project id', () => {
		const archive = serializeProject(project, members, expenses);
		expect(archive.project).not.toHaveProperty('id');
	});

	it('rejects non-JSON input', () => {
		const result = parseProjectArchive('{not json');
		expect(result.ok).toBe(false);
	});

	it('rejects files from other apps', () => {
		const result = parseProjectArchive(JSON.stringify({ schemaVersion: 1, app: 'other' }));
		expect(result.ok).toBe(false);
	});

	it('rejects unsupported schema versions', () => {
		const result = parseProjectArchive(
			JSON.stringify({ schemaVersion: 999, app: 'kostos', project: {}, members: [], expenses: [] })
		);
		expect(result.ok).toBe(false);
	});

	it('upgrades v1 archives by initialising an empty trips list', () => {
		const v1 = {
			schemaVersion: 1,
			app: 'kostos',
			exportedAt: 1,
			project: {
				name: 'Old project',
				emoji: '🏠',
				color: 'lime',
				currency: 'EUR',
				currencySymbol: '€',
				defaultSplit: 'even',
				categories,
				paymentMethods,
				createdAt: 1
			},
			members,
			expenses: [expenses[0]]
		};
		const result = parseProjectArchive(JSON.stringify(v1));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.archive.schemaVersion).toBe(2);
		expect(result.archive.project.trips).toEqual([]);
		expect(result.archive.members).toEqual(members);
	});

	it('rejects malformed expenses', () => {
		const archive = serializeProject(project, members, expenses);
		const tampered = JSON.parse(JSON.stringify(archive));
		tampered.expenses[0].amount = 'not a number';
		const result = parseProjectArchive(JSON.stringify(tampered));
		expect(result.ok).toBe(false);
	});
});

describe('toCSV', () => {
	const csv = toCSV(project, members, expenses);

	it('starts with the canonical header row', () => {
		expect(csv.split('\n')[0]).toBe(
			'date,description,amount,currency,category,payment_method,trip,is_settlement,notes,split_mode,payers,splits,created_at'
		);
	});

	it('emits one data row per expense (counted by leading ISO date)', () => {
		const dateRows = csv.match(/^\d{4}-\d{2}-\d{2},/gm);
		expect(dateRows).toHaveLength(3);
	});

	it('formats even splits as a pipe-joined name list', () => {
		expect(csv).toContain('"Alice|Bob|Carol ""C"""');
	});

	it('formats shares splits with member:shares', () => {
		expect(csv).toContain('Alice:2|Bob:1');
	});

	it('formats amount splits with member:amount in decimals', () => {
		expect(csv).toContain('"Alice:30.00|Bob:25.00|Carol ""C"":35.00"');
	});

	it('formats multi-payer payments with member:amount', () => {
		expect(csv).toContain('Alice:50.00|Bob:30.00');
	});

	it('escapes commas and quotes inside field values', () => {
		expect(csv).toContain('"Dinner, fish"');
		expect(csv).toContain('"Transport, etc."');
	});

	it('preserves newlines inside quoted notes', () => {
		expect(csv).toContain('"tasty\nplace"');
	});

	it('outputs amounts with two decimal places', () => {
		expect(csv).toContain(',120.00,');
		expect(csv).toContain(',90.00,');
		expect(csv).toContain(',80.00,');
	});

	it('uses each currency\'s precision', () => {
		const yen: Expense = {
			...expenses[0],
			id: 'yen',
			amount: 2000,
			currency: 'JPY',
			payments: [{ memberId: expenses[0].payments[0].memberId, amount: 2000 }]
		};
		const row = toCSV(project, members, [yen]).split('\n')[1];
		expect(row).toContain(',2000,JPY,');
	});

	it('neutralises cells a spreadsheet would run as formulas', () => {
		const sneaky: Expense = { ...expenses[0], id: 'f', description: '=HYPERLINK("x")', notes: '+1' };
		const row = toCSV(project, members, [sneaky]).split('\n')[1];
		expect(row).toContain(`"'=HYPERLINK(""x"")"`);
		expect(row).toContain(",'+1,");
	});
});
