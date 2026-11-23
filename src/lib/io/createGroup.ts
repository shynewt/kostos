/* New, restore, import and the demo all end the same way: put a group into a room. */
import { addProject, removeProject, setCurrentMember } from '$lib/storage';
import { deriveLocalId } from '$lib/sync/crypto';
import { addExpense, destroyRoom, initProject, openRoom, type RoomHandle } from '$lib/sync/doc';
import { generateSecret } from '$lib/invite';
import type { Expense, Member, Project } from '$lib/types';
import type { ProjectArchive } from './projectArchive';

type GroupContents = { project: Omit<Project, 'id'>; members: Member[]; expenses: Expense[] };

export function archiveContents({ project, members, expenses }: ProjectArchive): GroupContents {
	return { project: { ...project, trips: project.trips ?? [] }, members, expenses };
}

/** One transaction for the expenses, so the IndexedDB write is a single commit and observers fire once. */
export function seedRoom(handle: RoomHandle, project: Project, members: Member[], expenses: Expense[]): void {
	initProject(handle, project, members);
	handle.doc.transact(() => {
		for (const expense of expenses) addExpense(handle, expense, { silent: true });
	});
}

export async function createGroup({ project, members, expenses }: GroupContents, currentMemberId: string | null): Promise<string> {
	const secret = generateSecret();
	const roomId = await deriveLocalId(secret);
	// the reference goes first: if it cannot be saved, nothing has been opened or uploaded yet
	addProject({ roomId, secret, name: project.name, emoji: project.emoji, color: project.color, lastActiveAt: Date.now() });
	try {
		const handle = openRoom(roomId, secret);
		await handle.ready;
		seedRoom(handle, { ...project, id: roomId }, members, expenses);
		if (currentMemberId) setCurrentMember(roomId, currentMemberId);
		await handle.persistence?.flush();
	} catch (error) {
		// otherwise every retry would leave another empty group on the home list
		await destroyRoom(roomId).catch(() => {});
		removeProject(roomId);
		throw error;
	}
	return roomId;
}
