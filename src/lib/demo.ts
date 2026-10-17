/* Local-only demo group.
 *
 * Seeds a sandbox project from a bundled sample archive and opens it by roomId
 * with no secret, so `openRoom` never attaches a sync provider. The demo is never
 * written to the saved projects list (`kostos:projects`); it lives only in its own
 * IndexedDB doc on this device, so nothing a visitor does reaches the relay, other
 * people, or their real group list.
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import demoArchive from './demo-seed.json';
import { parseProjectArchive } from './io/projectArchive';
import { archiveContents, seedRoom } from './io/restoreProject';
import { setCurrentMember } from './storage';
import { DEMO_ROOM_ID, openRoom } from './sync/doc';

export async function enterDemo(): Promise<void> {
	if (!browser) return;

	const handle = openRoom(DEMO_ROOM_ID);
	await handle.ready;

	// seed once; on a return visit the doc already loaded from IndexedDB
	if (!handle.project.has('id')) {
		const parsed = parseProjectArchive(demoArchive);
		if (!parsed.ok) return;
		const { project, members, expenses } = archiveContents(parsed.archive);
		const youId = members[0]?.id ?? null;
		if (youId) setCurrentMember(DEMO_ROOM_ID, youId);
		seedRoom(handle, { ...project, id: DEMO_ROOM_ID }, members, expenses);
	}

	await goto(`/p/${DEMO_ROOM_ID}`);
}
