// The relay can see transport metadata only. All document contents stay encrypted.
export const MAX_MESSAGE_BYTES = 1_048_576;
const MAGIC = [75, 79, 83, 51];

/** @param {Uint8Array} packet */
export function unwrapPacket(packet) {
	const versioned = packet.length >= 5 && MAGIC.every((byte, i) => packet[i] === byte);
	if (versioned && packet[4] !== 0 && packet[4] !== 1 && packet[4] !== 2) throw new Error('Invalid transport flag');
	// Flag 2: a snapshot replacing every entry up to the 32-bit revision that follows.
	const compact = versioned && packet[4] === 2 && packet.length >= 9
		? new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(5)
		: undefined;
	if (versioned && packet[4] === 2 && compact === undefined) throw new Error('Invalid message size');
	const payload = versioned ? packet.slice(compact === undefined ? 5 : 9) : packet;
	if (packet.length > MAX_MESSAGE_BYTES || payload.length < 28) throw new Error('Invalid message size');
	return { payload, durable: !versioned || packet[4] === 1, compact };
}

/** @param {Uint8Array} payload */
export async function payloadHash(payload) {
	const hash = await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (payload));
	return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
