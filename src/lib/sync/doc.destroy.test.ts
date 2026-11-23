import { describe, expect, it, vi } from 'vitest';
import { destroyRoom, openRoom } from './doc';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('./provider', () => ({ createSyncProvider: vi.fn(() => ({ destroy: vi.fn() })) }));
vi.mock('./persistence', () => ({
	RoomPersistence: class {
		ready = Promise.resolve();
		state = {};
		onChange() { return () => {}; }
		async destroy() {}
		async clearData() { throw new Error('delete blocked'); }
	}
}));
vi.mock('$lib/storage', () => ({ findProject: vi.fn(), getCurrentMember: vi.fn() }));

describe('destroyRoom', () => {
	it('still releases the doc and the cached handle when the stored data cannot be deleted', async () => {
		const handle = openRoom('PRT-BLOCKED');
		await expect(destroyRoom('PRT-BLOCKED')).rejects.toThrow('delete blocked');
		expect(handle.doc.isDestroyed).toBe(true);
		expect(openRoom('PRT-BLOCKED')).not.toBe(handle);
	});
});
