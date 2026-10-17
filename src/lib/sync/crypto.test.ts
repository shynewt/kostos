import { describe, expect, it } from 'vitest';
import { base64UrlEncode, decryptPayload, deriveKey, deriveLocalId, deriveRoomAccess, encryptPayload } from './crypto';
import { toHex } from './relay-protocol.js';

function secretFromSeed(seed: number): string {
	const bytes = new Uint8Array(16);
	for (let i = 0; i < bytes.length; i++) bytes[i] = (seed + i * 7) & 0xff;
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const fakeSecret = () => secretFromSeed(0);

describe('AES-GCM crypto', () => {
	it('round-trips a payload', async () => {
		const key = await deriveKey(fakeSecret());
		const plaintext = new TextEncoder().encode('hello kostos');
		const encrypted = await encryptPayload(key, plaintext);
		const decrypted = await decryptPayload(key, encrypted);
		expect(new TextDecoder().decode(decrypted)).toBe('hello kostos');
	});

	it('emits a different IV per encryption of the same plaintext', async () => {
		const key = await deriveKey(fakeSecret());
		const plaintext = new TextEncoder().encode('repeat me');
		const a = await encryptPayload(key, plaintext);
		const b = await encryptPayload(key, plaintext);
		expect(a.length).toBe(b.length);
		// IV (first 12 bytes) must differ across encryptions for AES-GCM safety
		const ivA = a.slice(0, 12);
		const ivB = b.slice(0, 12);
		expect(Buffer.from(ivA).equals(Buffer.from(ivB))).toBe(false);
	});

	it('rejects decryption with a wrong key', async () => {
		const key = await deriveKey(secretFromSeed(0));
		const other = await deriveKey(secretFromSeed(31));
		const encrypted = await encryptPayload(key, new TextEncoder().encode('secret'));
		await expect(decryptPayload(other, encrypted)).rejects.toThrow();
	});

	it('rejects payloads shorter than the IV + tag', async () => {
		const key = await deriveKey(fakeSecret());
		await expect(decryptPayload(key, new Uint8Array(20))).rejects.toThrow();
	});
});

describe('secret derivations', () => {
	const pinnedSecret = 'AAECAwQFBgcICQoLDA0ODw';
	const pinnedPayload = 'BwcHBwcHBwcHBwcHUQkHPplByfuAT6mNcOrvGpioGf8sCl4WA1lCmg==';

	it('matches pinned vectors, so a change that would orphan every group fails here', async () => {
		expect(await deriveRoomAccess(pinnedSecret)).toEqual({
			relayRoomId: '240d9fce60d8bf1f1f868e3d307862a79cf6e7e60e9605076bc36adce20a07c9',
			proof: '_3Uo_pBmGvtA0V2fpVX1h0L-hz9fr3PSDdvJ9Cm3E3Q'
		});
		expect(await deriveLocalId(pinnedSecret)).toBe('17f3a7932681dc151d53e7f7b31d5811');
		const payload = Uint8Array.from(atob(pinnedPayload), (c) => c.charCodeAt(0));
		const plain = await decryptPayload(await deriveKey(pinnedSecret), payload);
		expect(new TextDecoder().decode(plain)).toBe('hello kostos');
	});

	it('shapes every derived value for its job', async () => {
		const { relayRoomId, proof } = await deriveRoomAccess(pinnedSecret);
		expect(relayRoomId).toMatch(/^[0-9a-f]{64}$/);
		expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(await deriveLocalId(pinnedSecret)).toMatch(/^[0-9a-f]{32}$/);
	});

	it('derives each purpose independently, so one value reveals nothing about another', async () => {
		const { relayRoomId, proof } = await deriveRoomAccess(pinnedSecret);
		const localId = await deriveLocalId(pinnedSecret);
		const proofHex = toHex(Buffer.from(proof, 'base64url'));
		expect(new Set([relayRoomId, proofHex, localId]).size).toBe(3);
		expect(relayRoomId.startsWith(localId)).toBe(false);
		expect(proofHex.startsWith(localId)).toBe(false);
		expect(proofHex.startsWith(relayRoomId.slice(0, localId.length))).toBe(false);
	});

	it('separates different secrets', async () => {
		const other = base64UrlEncode(new Uint8Array(16).fill(9));
		expect((await deriveRoomAccess(other)).relayRoomId).not.toBe((await deriveRoomAccess(pinnedSecret)).relayRoomId);
		expect(await deriveLocalId(other)).not.toBe(await deriveLocalId(pinnedSecret));
	});

	it('encodes bytes without padding', () => {
		expect(base64UrlEncode(new Uint8Array(16))).toHaveLength(22);
		expect(base64UrlEncode(Uint8Array.from([251, 255, 254]))).toBe('-__-');
	});
});
