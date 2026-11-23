/* A note inside the group's own synced data that it reached the v3 server. Every member's phone sees it,
 * including phones that can't reach the v3 server themselves. v3 reads only its known maps, so it ignores this one. */
import type * as Y from 'yjs';

const MOVE_MAP = 'move';
const MOVED_AT = 'movedAt';

export function markMoved(doc: Y.Doc): void {
	const move = doc.getMap(MOVE_MAP);
	if (!move.has(MOVED_AT)) move.set(MOVED_AT, Date.now());
}

export function hasMoved(doc: Y.Doc): boolean {
	return doc.getMap(MOVE_MAP).has(MOVED_AT);
}
