import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addProject, setCurrentMember } from '$lib/storage';
import { openRoom, readExpenses, readMembers, readProject } from '$lib/sync/doc';
import type { Expense, Member } from '$lib/types';
import { parseProjectArchive } from './projectArchive';
import { archiveContents, createGroup, seedRoom } from './restoreProject';

vi.mock('$lib/storage', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/storage')>()),
	addProject: vi.fn(),
	setCurrentMember: vi.fn()
}));

const now = 1_700_000_000_000;
const members: Member[] = [
	{ id: 'anna', name: 'Anna', createdAt: now },
	{ id: 'marco', name: 'Marco', createdAt: now }
];
const expenses: Expense[] = [
	{
		id: 'dinner', description: 'Dinner', amount: 9000, currency: 'EUR', date: now, createdAt: now, createdBy: 'anna',
		payments: [{ memberId: 'anna', amount: 9000 }], splitMode: 'even', splits: [{ memberId: 'anna' }, { memberId: 'marco' }]
	}
];
const backup = {
	schemaVersion: 2, app: 'kostos', exportedAt: now,
	project: { name: 'Lisbon', emoji: '🏖', color: 'lime', currency: 'EUR', currencySymbol: '€', defaultSplit: 'even', createdAt: now, categories: [], paymentMethods: [] },
	members, expenses
};

function contents() {
	const parsed = parseProjectArchive(backup);
	if (!parsed.ok) throw new Error(parsed.error);
	return archiveContents(parsed.archive);
}

beforeEach(() => vi.clearAllMocks());

describe('archiveContents', () => {
	it('keeps what a backup holds and defaults the trips an old backup lacks', () => {
		const { project, members: restored, expenses: restoredExpenses } = contents();
		expect(project).toMatchObject({ name: 'Lisbon', currency: 'EUR', trips: [] });
		expect(restored).toEqual(members);
		expect(restoredExpenses).toEqual(expenses);
	});
});

describe('seedRoom', () => {
	it('writes the project, its members and every expense into the room', async () => {
		const handle = openRoom('SEED-ROOM');
		await handle.ready;
		seedRoom(handle, { ...contents().project, id: 'SEED-ROOM' }, members, expenses);
		expect(readProject(handle)).toMatchObject({ id: 'SEED-ROOM', name: 'Lisbon' });
		expect(readMembers(handle).map((member) => member.id)).toEqual(['anna', 'marco']);
		expect(readExpenses(handle)).toHaveLength(1);
	});
});

describe('createGroup', () => {
	it('saves the group under a fresh secret and remembers who you are', async () => {
		const roomId = await createGroup(contents(), 'marco');
		const saved = vi.mocked(addProject).mock.calls[0][0];
		expect(saved).toMatchObject({ roomId, name: 'Lisbon' });
		expect(saved.secret).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(setCurrentMember).toHaveBeenCalledWith(roomId, 'marco');
		expect(readProject(openRoom(roomId))?.id).toBe(roomId);
		expect(readExpenses(openRoom(roomId))).toHaveLength(1);
	});

	it('leaves the identity unset when none is chosen', async () => {
		await createGroup(contents(), null);
		expect(setCurrentMember).not.toHaveBeenCalled();
	});

	it('gives every group its own secret and ID', async () => {
		const first = await createGroup(contents(), null);
		const second = await createGroup(contents(), null);
		expect(first).not.toBe(second);
		expect(vi.mocked(addProject).mock.calls[0][0].secret).not.toBe(vi.mocked(addProject).mock.calls[1][0].secret);
	});
});
