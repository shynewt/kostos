// The relay can see transport metadata only. All document contents stay encrypted.
export const MAX_MESSAGE_BYTES = 1_048_576;
/** Per-room ceiling on live history: the payload bytes a new client replays, not the archive of entries a
 *  compaction replaced. Past it a room refuses writes (the `full` error) instead of dropping history.
 *  A Durable Object room recovers by compacting; a Node relay cannot compact, so its cap is permanent. */
export const MAX_ROOM_BYTES = 32 * 1024 * 1024;
/** Per-room ceiling on archived bytes: entries a compaction replaced, kept for recovery and never replayed.
 *  With MAX_ROOM_BYTES it bounds a room's total storage at twice the live cap. Past it a compaction drops the
 *  oldest archived entries, so a full room can always free live space and storage never grows without limit.
 *  Keep it at least MAX_ROOM_BYTES: one compaction archives up to a whole live history. */
export const MAX_ARCHIVE_BYTES = MAX_ROOM_BYTES;
/** Per-room ceiling on live entries, refused like MAX_ROOM_BYTES. It bounds replay cost and the exact entry-count
 *  query in a Durable Object, and the Node relay holds every entry in memory, so tiny entries cost far more than their
 *  size suggests. */
export const MAX_ROOM_ENTRIES = 100_000;
/** "KOS3": the first four bytes of a versioned packet. A fifth flag byte follows. */
export const PACKET_MAGIC = [75, 79, 83, 51];
export const PROTOCOL_VERSION = 3;
export const MAX_BARRIER_ID_LENGTH = 80;

/** @param {Uint8Array} packet */
export function unwrapPacket(packet) {
	const versioned = packet.length >= 5 && PACKET_MAGIC.every((byte, i) => packet[i] === byte);
	if (versioned && packet[4] !== 0 && packet[4] !== 1 && packet[4] !== 2) throw new Error('Invalid transport flag');
	// Flag 2: a snapshot replacing every entry up to the 32-bit revision that follows.
	const compact = versioned && packet[4] === 2 && packet.length >= 9
		? new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(5)
		: undefined;
	if (versioned && packet[4] === 2 && compact === undefined) throw new Error('Invalid packet');
	const payload = versioned ? packet.slice(compact === undefined ? 5 : 9) : packet;
	if (packet.length > MAX_MESSAGE_BYTES || payload.length < 28) throw new Error('Invalid packet');
	return { payload, durable: !versioned || packet[4] === 1, compact };
}

/** @param {Uint8Array} bytes */
export function toHex(bytes) {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {Uint8Array} payload */
export async function payloadHash(payload) {
	const hash = await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (payload));
	return toHex(new Uint8Array(hash));
}
