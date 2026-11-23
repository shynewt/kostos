/* The parts of the v3 sync protocol a client needs, copied from v3's relay-protocol.js and
 * room-access.js. The v3 server is the other end, so these must match it exactly. */

export const MAX_MESSAGE_BYTES = 1_048_576;
/** "KOS3": the first four bytes of a versioned packet. A fifth flag byte follows. */
export const PACKET_MAGIC = [75, 79, 83, 51];
export const PROTOCOL_VERSION = 3;
export const PROOF_PREFIX = 'kostos1.';
export const ROOM_FULL_REASON = 'full';
export const SIZE_ERROR_REASON = 'size';

export function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function payloadHash(payload: Uint8Array): Promise<string> {
	return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', payload as BufferSource)));
}
