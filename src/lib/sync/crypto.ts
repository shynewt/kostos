/* AES-GCM helpers for the encrypted sync transport.
 *
 * A group's secret (16 random bytes, base64url) is the only thing its members share. HKDF-SHA-256
 * expands it into independent values, one per purpose: the AES-128-GCM key and the local ID stay on
 * the device; the relay room ID and the auth proof go to the sync server, which learns nothing about
 * the key from them. Each encrypted payload is `iv (12 bytes) | ciphertext+tag`. IVs are random per
 * message, which AES-GCM requires. The server sees only opaque ciphertext.
 */
import { toHex } from './relay-protocol.js';

const KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

export type RoomAccess = { relayRoomId: string; proof: string };

export const INSECURE_CONTEXT_MESSAGE = 'Kostos needs HTTPS (or localhost) to encrypt your data.';

/** Browsers only expose `crypto.subtle` on HTTPS and localhost, so a plain-HTTP self-host has none. */
export class InsecureContextError extends Error {
	constructor() {
		super(INSECURE_CONTEXT_MESSAGE);
	}
}

/** Changing a purpose or a size orphans every existing group; crypto.test.ts pins them. */
async function expand(secretBase64Url: string, purpose: 'encryption' | 'local' | 'room' | 'auth', bits: number): Promise<Uint8Array> {
	if (!globalThis.crypto?.subtle) throw new InsecureContextError();
	const base = await crypto.subtle.importKey('raw', base64UrlDecode(secretBase64Url) as BufferSource, 'HKDF', false, ['deriveBits']);
	const info = new TextEncoder().encode(`kostos/${purpose}/v1`);
	const derived = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info }, base, bits);
	return new Uint8Array(derived);
}

export async function deriveKey(secretBase64Url: string): Promise<CryptoKey> {
	const raw = await expand(secretBase64Url, 'encryption', 128);
	return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, KEY_USAGES);
}

/** The group's identity on this device: its `/p/<id>` route, storage key and IndexedDB name. */
export async function deriveLocalId(secretBase64Url: string): Promise<string> {
	return toHex(await expand(secretBase64Url, 'local', 128));
}

export async function deriveRoomAccess(secretBase64Url: string): Promise<RoomAccess> {
	const [room, proof] = await Promise.all([expand(secretBase64Url, 'room', 256), expand(secretBase64Url, 'auth', 256)]);
	return { relayRoomId: toHex(room), proof: base64UrlEncode(proof) };
}

export async function encryptPayload(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource)
	);
	const out = new Uint8Array(iv.length + ciphertext.length);
	out.set(iv, 0);
	out.set(ciphertext, iv.length);
	return out;
}

export async function decryptPayload(key: CryptoKey, payload: Uint8Array): Promise<Uint8Array> {
	if (payload.length < 12 + 16) throw new Error('payload too short');
	const iv = payload.slice(0, 12);
	const ciphertext = payload.slice(12);
	return new Uint8Array(
		await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext as BufferSource)
	);
}

export function base64UrlEncode(bytes: Uint8Array): string {
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
