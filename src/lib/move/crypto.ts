/* v3 key derivation, copied from v3's sync/crypto.ts, plus the one step that maps a v2 group to
 * its v3 group.
 *
 * A v3 secret (16 bytes, base64url) is expanded with HKDF-SHA-256 into independent values: the
 * AES-128-GCM key stays on the device; the relay room ID and the auth proof go to the sync server.
 * Each encrypted payload is `iv (12 bytes) | ciphertext+tag`.
 */
import { toHex } from './wire';

const KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];
const V3_SECRET_BITS = 128;

export type RoomAccess = { relayRoomId: string; proof: string };

/** Changing a purpose or a size breaks the move; crypto.test.ts pins them against v3's own vectors. */
async function expand(secretBase64Url: string, purpose: 'encryption' | 'room' | 'auth' | 'move', bits: number): Promise<Uint8Array> {
	const base = await crypto.subtle.importKey('raw', base64UrlDecode(secretBase64Url) as BufferSource, 'HKDF', false, ['deriveBits']);
	const info = new TextEncoder().encode(`kostos/${purpose}/v1`);
	const derived = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info }, base, bits);
	return new Uint8Array(derived);
}

/** Every member's phone holds the same v2 secret, so each one arrives at the same v3 group without
 *  talking to the others. The v2 server never saw the v2 secret, so it cannot follow. */
export async function deriveMovedSecret(v2Secret: string): Promise<string> {
	return base64UrlEncode(await expand(v2Secret, 'move', V3_SECRET_BITS));
}

export async function deriveKey(secretBase64Url: string): Promise<CryptoKey> {
	const raw = await expand(secretBase64Url, 'encryption', 128);
	return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, KEY_USAGES);
}

export async function deriveRoomAccess(secretBase64Url: string): Promise<RoomAccess> {
	const [room, proof] = await Promise.all([expand(secretBase64Url, 'room', 256), expand(secretBase64Url, 'auth', 256)]);
	return { relayRoomId: toHex(room), proof: base64UrlEncode(proof) };
}

export async function encryptPayload(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource));
	const out = new Uint8Array(iv.length + ciphertext.length);
	out.set(iv, 0);
	out.set(ciphertext, iv.length);
	return out;
}

export async function decryptPayload(key: CryptoKey, payload: Uint8Array): Promise<Uint8Array> {
	if (payload.length < 12 + 16) throw new Error('payload too short');
	const iv = payload.slice(0, 12);
	const ciphertext = payload.slice(12);
	return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext as BufferSource));
}

function base64UrlEncode(bytes: Uint8Array): string {
	let bin = '';
	for (const byte of bytes) bin += String.fromCharCode(byte);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
	const normalised = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
	const bin = atob(padded);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
