/* Project-token helpers.
 *
 * A project is identified by a pair: `roomId.secret`.
 *  - `roomId` is sent to the sync server so it can route to the right Y.Doc.
 *  - `secret` is the key used to encrypt updates client-side; it must NEVER leave the client.
 *
 * The full token is shared as a URL with the secret in the fragment, e.g.
 *     https://kostos.app/join?room=PRT-4F2K-9XBA#<base64url-secret>
 * Browsers don't send `#...` in requests, so even if the share URL leaks through a referer
 * header the secret is preserved.
 *
 * The UI surfaces the short `roomId` (the design's `PRT-XXXX-XXXX` style) as a glanceable label;
 * the full URL is what users actually share.
 */

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32-ish, ambiguity-free

export type ParsedToken = { roomId: string; secret: string };

/** Build a fresh random room id of the form `PRT-XXXX-XXXX`. */
export function generateRoomId(): string {
	const random = new Uint8Array(8);
	crypto.getRandomValues(random);
	const chars = Array.from(random, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]);
	return `PRT-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
}

/** Build a fresh random secret as base64url-encoded 32 bytes. */
export function generateSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64url(bytes);
}

/** Accept `roomId.secret`, the share URL (`/join?room=ROOM#SECRET`), or the older
 *  `/join#roomId.secret` form. */
export function parseToken(raw: string): ParsedToken | null {
	const input = extractCandidate(raw);
	if (!input) return null;

	if (input.includes('://') || input.startsWith('/') || input.includes('?room=')) {
		const absolute = input.includes('://') || input.startsWith('/') ? input : `https://${input}`;
		let url: URL;
		try {
			url = new URL(absolute, 'https://placeholder.invalid');
		} catch {
			return null;
		}
		const hash = url.hash.slice(1);
		const room = url.searchParams.get('room');
		if (room) return pair(room, hash);
		return splitDotted(hash);
	}

	return splitDotted(input);
}

/** Chat apps paste links with surrounding text, `<...>` wrappers, a sentence's final period,
 *  or without the scheme. None of those characters can appear in a room id or secret. */
function extractCandidate(raw: string): string {
	const words = raw.trim().split(/\s+/);
	const word = words.find((w) => w.includes('room=')) ?? words[words.length - 1] ?? '';
	return word.replace(/^[<(]+/, '').replace(/[.,;:!?)>]+$/, '');
}

function splitDotted(input: string): ParsedToken | null {
	const dot = input.indexOf('.');
	if (dot === -1) return null;
	return pair(input.slice(0, dot), input.slice(dot + 1));
}

const ROOM_PATTERN = new RegExp(`^PRT-[${ROOM_ALPHABET}]{4}-[${ROOM_ALPHABET}]{4}$`);
// at least 16 bytes of base64url; generated secrets are 32 bytes (43 chars)
const SECRET_PATTERN = /^[A-Za-z0-9_-]{22,}$/;

function pair(roomId: string, secret: string): ParsedToken | null {
	const room = roomId.trim().toUpperCase();
	const key = secret.trim();
	if (!ROOM_PATTERN.test(room) || !SECRET_PATTERN.test(key)) return null;
	return { roomId: room, secret: key };
}

function base64url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
