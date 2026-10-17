/* Invites. A group's invite is its secret: 16 random bytes as 22 base64url characters, shared as
 *     https://<host>/join#<secret>
 * Browsers don't send `#...` in requests, so the secret stays out of server logs and referers.
 * Every other identifier (key, local ID, relay room ID, proof) is derived from it in sync/crypto.ts.
 */
import { base64UrlEncode } from './sync/crypto';

export type ParsedInvite = { secret: string };

export const SECRET_LENGTH = 22;
const SECRET_BYTES = 16;
const SECRET_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${SECRET_LENGTH}}$`);
const OLD_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// a real invite is a few dozen characters; anything longer is never worth scanning
const MAX_WORD_LENGTH = 2048;
const WRAPPERS_AND_PUNCTUATION = new Set([...'<>()[]"\'.,;:!?“”‘’«»']);

export const OLD_INVITE_MESSAGE = 'That invite comes from an older version of Kostos and no longer works. Ask your group for a new invite link.';
export const INVALID_INVITE_MESSAGE = `That doesn’t look right. Paste the full invite link or the ${SECRET_LENGTH} character group key.`;

export function generateSecret(): string {
	const bytes = new Uint8Array(SECRET_BYTES);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

export function isValidSecret(value: string): boolean {
	return SECRET_PATTERN.test(value);
}

export function invitePath(secret: string): string {
	return `/join#${secret}`;
}

/** Accepts the share link (`/join#SECRET`) or the bare secret. */
export function parseInvite(raw: string): ParsedInvite | null {
	const key = keyOf(extractCandidate(raw));
	return isValidSecret(key) ? { secret: key } : null;
}

/** Invites from before v3: `?room=` links, `ROOM.SECRET` pairs and bare 43 character keys. */
export function isOldInvite(raw: string): boolean {
	const candidate = extractCandidate(raw);
	if (candidate.includes('room=')) return true;
	const key = keyOf(candidate);
	return OLD_KEY_PATTERN.test(key.includes('.') ? key.slice(key.indexOf('.') + 1) : key);
}

export function inviteError(raw: string): string {
	return isOldInvite(raw) ? OLD_INVITE_MESSAGE : INVALID_INVITE_MESSAGE;
}

/** The key is the fragment up to a `&`, so share links with extra fragment parameters still work. */
function keyOf(candidate: string): string {
	const hash = candidate.indexOf('#');
	const fragment = hash === -1 ? candidate : candidate.slice(hash + 1);
	const separator = fragment.indexOf('&');
	return separator === -1 ? fragment : fragment.slice(0, separator);
}

/** Chat apps paste links with surrounding text, quotes, `<...>` wrappers, a sentence's final period,
 *  or without the scheme. None of those characters can appear in a secret. */
function extractCandidate(raw: string): string {
	const words = raw.trim().split(/\s+/);
	const isLink = (word: string) => word.includes('://') || word.includes('/join#') || word.includes('room=');
	const word = words.find(isLink) ?? words.find((w) => w.includes('#')) ?? words[words.length - 1] ?? '';
	return word.length > MAX_WORD_LENGTH ? '' : trimAround(word, WRAPPERS_AND_PUNCTUATION);
}

// a linear scan; a regex anchored at the end backtracks quadratically on long runs
function trimAround(word: string, characters: Set<string>): string {
	let start = 0;
	let end = word.length;
	while (start < end && characters.has(word[start])) start++;
	while (end > start && characters.has(word[end - 1])) end--;
	return word.slice(start, end);
}
