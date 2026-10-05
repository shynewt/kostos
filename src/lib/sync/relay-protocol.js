// The relay can see transport metadata only. All document contents stay encrypted.
export const MAX_MESSAGE_BYTES = 1_048_576;
const MAGIC = [75, 79, 83, 51];

/** @param {Uint8Array} packet */
export function unwrapPacket(packet) {
	const versioned = packet.length >= 5 && MAGIC.every((byte, i) => packet[i] === byte);
	if (versioned && packet[4] !== 0 && packet[4] !== 1) throw new Error('Invalid transport flag');
	const payload = versioned ? packet.slice(5) : packet;
	if (packet.length > MAX_MESSAGE_BYTES || payload.length < 28) throw new Error('Invalid message size');
	return { payload, durable: !versioned || packet[4] === 1 };
}

/** @param {Uint8Array} payload */
export async function payloadHash(payload) {
	const hash = await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (payload));
	return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
