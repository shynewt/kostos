/* New, restore, import and the demo all end the same way: put a project into a room. */
import { addProject, setCurrentMember } from '$lib/storage';
import { addExpense, initProject, openRoom, type RoomHandle } from '$lib/sync/doc';
import { generateRoomId, generateSecret } from '$lib/token';
import type { Expense, Member, Project } from '$lib/types';
import type { ProjectArchive } from './projectArchive';

export type GroupContents = { project: Omit<Project, 'id'>; members: Member[]; expenses: Expense[] };

export function archiveContents({ project, members, expenses }: ProjectArchive): GroupContents {
	return { project: { ...project, trips: project.trips ?? [] }, members, expenses };
}

/** One transaction for the expenses, so the IndexedDB write is a single commit and observers fire once. */
export function seedRoom(handle: RoomHandle, project: Project, members: Member[], expenses: Expense[]): void {
	initProject(handle, project, members);
	handle.doc.transact(() => {
		for (const expense of expenses) addExpense(handle, expense);
	});
}

export async function createGroup({ project, members, expenses }: GroupContents, currentMemberId: string | null): Promise<string> {
	const secret = generateSecret();
	const roomId = generateRoomId();
	const handle = openRoom(roomId, secret);
	await handle.ready;
	seedRoom(handle, { ...project, id: roomId }, members, expenses);
	addProject({ roomId, secret, name: project.name, emoji: project.emoji, color: project.color, lastActiveAt: Date.now() });
	if (currentMemberId) setCurrentMember(roomId, currentMemberId);
	await handle.persistence?.flush();
	return roomId;
}
