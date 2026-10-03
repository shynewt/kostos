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
import { setCurrentMember } from './storage';
import { addExpense, initProject, openRoom } from './sync/doc';
import type { Project } from './types';

const DEMO_ROOM_ID = 'DEMO';

export async function enterDemo(): Promise<void> {
	if (!browser) return;

	const handle = openRoom(DEMO_ROOM_ID);
	await handle.ready;

	// seed once; on a return visit the doc already loaded from IndexedDB
	if (!handle.project.has('id')) {
		const parsed = parseProjectArchive(demoArchive);
		if (!parsed.ok) return;
		const a = parsed.archive;

		const youId = a.members[0]?.id ?? null;
		if (youId) setCurrentMember(DEMO_ROOM_ID, youId);

		const project: Project = {
			id: DEMO_ROOM_ID,
			name: a.project.name,
			description: a.project.description,
			emoji: a.project.emoji,
			color: a.project.color,
			currency: a.project.currency,
			currencySymbol: a.project.currencySymbol,
			defaultSplit: a.project.defaultSplit,
			autoFetchRates: a.project.autoFetchRates,
			paymentMethodsEnabled: a.project.paymentMethodsEnabled,
			categories: a.project.categories,
			paymentMethods: a.project.paymentMethods,
			trips: a.project.trips ?? [],
			createdAt: a.project.createdAt
		};

		initProject(handle, project, a.members);
		handle.doc.transact(() => {
			for (const e of a.expenses) addExpense(handle, e);
		});
	}

	await goto(`/p/${DEMO_ROOM_ID}`);
}
