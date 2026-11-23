/* What every sync server checks before letting a socket into a room. Plain JS so the
 * Worker, the Node relays and the browser client share the same rules.
 */
import { payloadHash } from './relay-protocol.js';

export const PROOF_PREFIX = 'kostos1.';
/** Sent to a socket whose proof does not match the room, right before it is closed. A failed
 *  HTTP upgrade is invisible to browser JavaScript, so this is how a client learns it was refused. */
export const DENIED_MESSAGE = { type: 'denied' };
export const DENIED_CLOSE_CODE = 1008;
export const DENIED_CLOSE_REASON = 'Unauthorized';
/** Close code for any server-side failure; the client reconnects. */
export const INTERNAL_ERROR_CLOSE_CODE = 1011;
/** Sent instead of an acknowledgement when a write could not be stored; the socket then closes with INTERNAL_ERROR_CLOSE_CODE. */
export const STORAGE_ERROR_MESSAGE = { type: 'error', reason: 'storage' };
export const STORAGE_CLOSE_REASON = 'Could not persist sync data';
/** Sent instead of STORAGE_ERROR_MESSAGE when the room refuses a write because it reached its size or entry
 *  limit. Unlike a storage failure, retrying the same write cannot succeed until the room is compacted. */
export const ROOM_FULL_MESSAGE = { type: 'error', reason: 'full' };
export const ROOM_FULL_CLOSE_REASON = 'Room storage limit reached';
/** Sent just before closing a socket with SIZE_CLOSE_CODE, after it sent a malformed or oversized packet. */
export const SIZE_ERROR_MESSAGE = { type: 'error', reason: 'size' };
export const SIZE_CLOSE_CODE = 1009;
export const SIZE_CLOSE_REASON = 'Invalid message size';

export const SYNC_PATH_PREFIX = '/sync/';
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** @param {string} raw @returns {string | null} the relay room ID, or null unless it is 64 lowercase hex characters */
function parseRoomId(raw) {
	return SHA256_HEX_PATTERN.test(raw) ? raw : null;
}

/** @param {string} pathname @returns {string | null} the relay room ID in `/sync/<id>`, or null for any other path or a malformed ID */
export function relayRoomIdFromPath(pathname) {
	if (!pathname.startsWith(SYNC_PATH_PREFIX)) return null;
	try {
		return parseRoomId(decodeURIComponent(pathname.slice(SYNC_PATH_PREFIX.length)));
	} catch {
		return null;
	}
}

/** Relay room IDs and stored proof hashes are both SHA-256 hex, so they intentionally share one pattern.
 *  @param {string} value */
export function isProofHash(value) {
	return SHA256_HEX_PATTERN.test(value);
}

/** @param {string | null | undefined} header the Sec-WebSocket-Protocol request header
 *  @returns {{ protocol: string, proof: string } | null} */
export function parseProofProtocol(header) {
	for (const part of (header ?? '').split(',')) {
		const protocol = part.trim();
		if (!protocol.startsWith(PROOF_PREFIX)) continue;
		const proof = protocol.slice(PROOF_PREFIX.length);
		if (PROOF_PATTERN.test(proof)) return { protocol, proof };
	}
	return null;
}

/** What a Node relay needs from an upgrade request, or null if the path or the proof is unusable.
 *  @param {string | undefined} requestUrl @param {string | undefined} protocolHeader
 *  @returns {{ relayRoomId: string, proof: string } | null} */
export function parseSyncRequest(requestUrl, protocolHeader) {
	let pathname;
	try {
		// fixed base so the Host header can't affect parsing; a malformed target still throws
		({ pathname } = new URL(requestUrl ?? '/', 'http://localhost'));
	} catch {
		return null;
	}
	const relayRoomId = relayRoomIdFromPath(pathname);
	const offered = parseProofProtocol(protocolHeader);
	return relayRoomId && offered ? { relayRoomId, proof: offered.proof } : null;
}

/** @param {string} proof */
export function proofHash(proof) {
	return payloadHash(new TextEncoder().encode(proof));
}

/** Constant-time comparison of two hex digests.
 *  @param {string} a @param {string} b */
export function hashesEqual(a, b) {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return difference === 0;
}
