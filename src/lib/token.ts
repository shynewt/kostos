/* Invites. A group's invite is its secret: 16 random bytes as 22 base64url characters, shared as
 *     https://<host>/join#<secret>
 * Browsers don't send `#...` in requests, so the secret stays out of server logs and referers.
 * Every other identifier (key, local ID, relay room ID, proof) is derived from it in sync/crypto.ts.
 */
import { isLegacySecret } from './legacy';
import { base64UrlEncode } from './sync/crypto';

export type ParsedToken = { secret: string };

const SECRET_BYTES = 16;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const OLD_INVITE_MESSAGE = 'That invite comes from the old Kostos site and no longer works. Ask your group for a new invite link.';
export const INVALID_INVITE_MESSAGE = 'That does not look right. Paste the full invite link or the 22 character group key.';

export function generateSecret(): string {
	const bytes = new Uint8Array(SECRET_BYTES);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

export function isValidSecret(value: string): boolean {
	return SECRET_PATTERN.test(value);
}

/** Accepts the share link (`/join#SECRET`) or the bare secret. */
export function parseToken(raw: string): ParsedToken | null {
	const key = keyOf(extractCandidate(raw));
	return isValidSecret(key) ? { secret: key } : null;
}

/** Invites from before v3: `?room=` links, `ROOM.SECRET` pairs and bare 43 character keys. */
export function isOldInvite(raw: string): boolean {
	const candidate = extractCandidate(raw);
	if (candidate.includes('room=')) return true;
	const key = keyOf(candidate);
	return isLegacySecret(key.includes('.') ? key.slice(key.indexOf('.') + 1) : key);
}

export function inviteError(raw: string): string {
	return isOldInvite(raw) ? OLD_INVITE_MESSAGE : INVALID_INVITE_MESSAGE;
}

function keyOf(candidate: string): string {
	const hash = candidate.indexOf('#');
	return hash === -1 ? candidate : candidate.slice(hash + 1);
}

/** Chat apps paste links with surrounding text, `<...>` wrappers, a sentence's final period,
 *  or without the scheme. None of those characters can appear in a secret. */
function extractCandidate(raw: string): string {
	const words = raw.trim().split(/\s+/);
	const word = words.find((w) => w.includes('#') || w.includes('room=')) ?? words[words.length - 1] ?? '';
	return word.replace(/^[<(]+/, '').replace(/[.,;:!?)>]+$/, '');
}
