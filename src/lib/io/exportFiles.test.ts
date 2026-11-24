import { describe, expect, it } from 'vitest';
import type { Expense, Member, Project } from '$lib/types';
import { backupFile, filteredSpreadsheetFile, spreadsheetFile } from './exportFiles';
import { toCSV } from './projectArchive';
import { parseProjectArchive } from './projectArchive';

const now = 1_700_000_000_000;
const project: Project = {
	id: 'x', name: 'Lisbon Weekend', emoji: '🏖', color: 'lime', currency: 'EUR', currencySymbol: '€',
	defaultSplit: 'even', categories: [], paymentMethods: [], trips: [], createdAt: now
};
const members: Member[] = [{ id: 'anna', name: 'Anna', createdAt: now }];
const expenses: Expense[] = [{
	id: 'e1', description: 'Dinner', amount: 1000, currency: 'EUR', date: now, createdAt: now, createdBy: 'anna',
	payments: [{ memberId: 'anna', amount: 1000 }], splitMode: 'even', splits: [{ memberId: 'anna' }]
}];
const day = new Date('2026-10-16T12:00:00Z');

describe('export files', () => {
	it('names the backup after the group and the day, and the file restores', () => {
		const file = backupFile(project, members, expenses, day);
		expect(file).toMatchObject({ name: 'kostos-lisbon-weekend-2026-10-16.json', mime: 'application/json' });
		expect(parseProjectArchive(file.contents)).toMatchObject({ ok: true });
	});

	it('falls back to a generic name when the group name has no usable characters', () => {
		expect(backupFile({ ...project, name: '🏖🏖' }, members, expenses, day).name).toBe('kostos-project-2026-10-16.json');
	});

	it('names the spreadsheet the same way', () => {
		const file = spreadsheetFile(project, members, expenses, day);
		expect(file).toMatchObject({ name: 'kostos-lisbon-weekend-2026-10-16.csv', mime: 'text/csv' });
		expect(file.contents).toContain('description');
	});

	it('names a filtered spreadsheet after its scope and keeps the full export format', () => {
		const file = filteredSpreadsheetFile(project, members, expenses, ['Berlin trip', '2026-10']);
		expect(file).toMatchObject({ name: 'kostos-lisbon-weekend-berlin-trip-2026-10.csv', mime: 'text/csv' });
		expect(file.contents).toBe(toCSV(project, members, expenses));
	});
});
