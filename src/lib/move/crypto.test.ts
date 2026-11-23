import { describe, expect, it } from 'vitest';
import { decryptPayload, deriveKey, deriveMovedSecret, deriveRoomAccess } from './crypto';

// v3's own pinned vectors (v3 sync/crypto.test.ts): if this copy drifts from v3, moved groups land in rooms v3 can't open
const v3PinnedSecret = 'AAECAwQFBgcICQoLDA0ODw';
const v3PinnedPayload = 'BwcHBwcHBwcHBwcHUQkHPplByfuAT6mNcOrvGpioGf8sCl4WA1lCmg==';
const v2Secret = Buffer.alloc(32, 2).toString('base64url');

describe('v3 key derivation copy', () => {
	it('matches v3 exactly', async () => {
		expect(await deriveRoomAccess(v3PinnedSecret)).toEqual({
			relayRoomId: '240d9fce60d8bf1f1f868e3d307862a79cf6e7e60e9605076bc36adce20a07c9',
			proof: '_3Uo_pBmGvtA0V2fpVX1h0L-hz9fr3PSDdvJ9Cm3E3Q'
		});
		const payload = Uint8Array.from(atob(v3PinnedPayload), (c) => c.charCodeAt(0));
		const plain = await decryptPayload(await deriveKey(v3PinnedSecret), payload);
		expect(new TextDecoder().decode(plain)).toBe('hello kostos');
	});
});

describe('deriveMovedSecret', () => {
	it('is pinned, because every member must reach the same v3 group on their own', async () => {
		expect(await deriveMovedSecret(v2Secret)).toBe('Iqt5oQ0PyKFW98ffHaY8aA');
	});

	it('produces a valid v3 secret: 22 base64url characters', async () => {
		expect(await deriveMovedSecret(v2Secret)).toMatch(/^[A-Za-z0-9_-]{22}$/);
	});

	it('gives each v2 group its own v3 group', async () => {
		const other = Buffer.alloc(32, 3).toString('base64url');
		expect(await deriveMovedSecret(other)).not.toBe(await deriveMovedSecret(v2Secret));
	});
});
