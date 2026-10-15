import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addMember, initProject, readMembers, readProject, updateMember, updateProject, type RoomHandle } from './doc';
import type { Member, Project } from '$lib/types';

function handle(): RoomHandle {
	const doc = new Y.Doc();
	return {
		roomId: 'ROOM',
		doc,
		project: doc.getMap('project'),
		members: doc.getArray('members'),
		expenses: doc.getArray('expenses'),
		activity: doc.getArray('activity'),
		ready: Promise.resolve()
	};
}

const project: Project = {
	id: 'ROOM',
	name: 'Home',
	emoji: '🏠',
	color: 'lime',
	currency: 'EUR',
	currencySymbol: '€',
	defaultSplit: 'even',
	categories: [],
	paymentMethods: [],
	trips: [],
	createdAt: 0
};

const member = (id: string, over: Partial<Member> = {}): Member => ({ id, name: id, createdAt: 0, ...over });

describe('split default sync', () => {
	it('reads as unset on groups that never configured it', () => {
		const h = handle();
		initProject(h, project, [member('a')]);
		expect(readProject(h)?.splitDefault).toBeUndefined();
		expect(readMembers(h)[0].splitWeight).toBeUndefined();
	});

	it('stores the mode on the project and changes it later', () => {
		const h = handle();
		initProject(h, { ...project, splitDefault: 'ratio' }, [member('a')]);
		expect(readProject(h)?.splitDefault).toBe('ratio');

		updateProject(h, { splitDefault: 'last' });
		expect(readProject(h)?.splitDefault).toBe('last');

		updateProject(h, { splitDefault: 'even' });
		expect(readProject(h)?.splitDefault).toBe('even');
	});

	it('stores a weight on a member without touching their other fields', () => {
		const h = handle();
		initProject(h, project, [member('a', { emoji: '🦊', color: 'blue' })]);
		addMember(h, member('b', { splitWeight: 2 }));

		updateMember(h, 'a', { splitWeight: 3 });

		const [a, b] = readMembers(h);
		expect(a).toMatchObject({ id: 'a', emoji: '🦊', color: 'blue', splitWeight: 3 });
		expect(b.splitWeight).toBe(2);
	});

	it('does not log a weight change as a rename', () => {
		const h = handle();
		initProject(h, project, [member('a')]);
		updateMember(h, 'a', { splitWeight: 2 });
		expect(h.activity.length).toBe(0);
	});
});
