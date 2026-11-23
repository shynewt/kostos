import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { hasMoved, markMoved } from './marker';

describe('moved marker', () => {
	it('reaches every member through the group data', () => {
		const mine = new Y.Doc();
		const theirs = new Y.Doc();
		expect(hasMoved(theirs)).toBe(false);
		markMoved(mine);
		Y.applyUpdate(theirs, Y.encodeStateAsUpdate(mine));
		expect(hasMoved(theirs)).toBe(true);
	});

	it('keeps the first time it was set', () => {
		const doc = new Y.Doc();
		markMoved(doc);
		const first = doc.getMap('move').get('movedAt');
		let changes = 0;
		doc.on('update', () => changes++);
		markMoved(doc);
		expect(doc.getMap('move').get('movedAt')).toBe(first);
		expect(changes).toBe(0);
	});

	it('leaves the parts v3 reads untouched', () => {
		const doc = new Y.Doc();
		markMoved(doc);
		expect([...doc.share.keys()]).toEqual(['move']);
	});
});
