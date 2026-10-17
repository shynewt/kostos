import { describe, expect, it } from 'vitest';
import {
	hashesEqual,
	isProofHash,
	parseProofProtocol,
	parseRoomId,
	parseSyncRequest,
	PROOF_PREFIX,
	proofHash
} from './room-access.js';

const room = 'a1'.repeat(32);
const proof = 'A'.repeat(43);

describe('parseRoomId', () => {
	it('accepts exactly 64 lowercase hex characters', () => {
		expect(parseRoomId(room)).toBe(room);
	});

	it('rejects old room names, uppercase, wrong lengths and non-hex', () => {
		expect(parseRoomId('PRT-AB23-CD45')).toBeNull();
		expect(parseRoomId(room.toUpperCase())).toBeNull();
		expect(parseRoomId(room.slice(1))).toBeNull();
		expect(parseRoomId(`${room}0`)).toBeNull();
		expect(parseRoomId('g'.repeat(64))).toBeNull();
		expect(parseRoomId(`${room.slice(1)}\n`)).toBeNull();
		expect(parseRoomId('')).toBeNull();
	});
});

describe('parseProofProtocol', () => {
	it('reads a single offered protocol', () => {
		expect(parseProofProtocol(`${PROOF_PREFIX}${proof}`)).toEqual({ protocol: `${PROOF_PREFIX}${proof}`, proof });
	});

	it('finds the proof among several protocols and tolerates spaces', () => {
		expect(parseProofProtocol(`chat, ${PROOF_PREFIX}${proof} , other`)?.proof).toBe(proof);
	});

	it('refuses missing headers, wrong prefixes and proofs of the wrong shape', () => {
		expect(parseProofProtocol(null)).toBeNull();
		expect(parseProofProtocol(undefined)).toBeNull();
		expect(parseProofProtocol('')).toBeNull();
		expect(parseProofProtocol(`other.${proof}`)).toBeNull();
		expect(parseProofProtocol(`${PROOF_PREFIX}${proof.slice(1)}`)).toBeNull();
		expect(parseProofProtocol(`${PROOF_PREFIX}${proof}x`)).toBeNull();
		expect(parseProofProtocol(`${PROOF_PREFIX}${'!'.repeat(43)}`)).toBeNull();
	});

	it('skips a malformed offer and still uses a valid one', () => {
		expect(parseProofProtocol(`${PROOF_PREFIX}short, ${PROOF_PREFIX}${proof}`)?.proof).toBe(proof);
	});
});

describe('parseSyncRequest', () => {
	const header = `${PROOF_PREFIX}${proof}`;

	it('reads the relay room ID and proof from an upgrade request', () => {
		expect(parseSyncRequest(`/sync/${room}`, header)).toEqual({ relayRoomId: room, proof });
		expect(parseSyncRequest(`/sync/${room}?x=1`, header)).toEqual({ relayRoomId: room, proof });
	});

	it('refuses other paths, old room names, bad escapes and missing proofs', () => {
		for (const bad of ['/', '/not-sync', '/sync/', '/sync/PRT-AAAA-BBBB', '/sync/%ZZ', `/sync/${room}/extra`, `/sync/${room.toUpperCase()}`]) {
			expect(parseSyncRequest(bad, header), bad).toBeNull();
		}
		expect(parseSyncRequest(`/sync/${room}`, undefined)).toBeNull();
		expect(parseSyncRequest(undefined, header)).toBeNull();
	});
});

describe('proof hashing', () => {
	it('hashes deterministically to 64 hex characters and tells proofs apart', async () => {
		const first = await proofHash(proof);
		expect(isProofHash(first)).toBe(true);
		expect(await proofHash(proof)).toBe(first);
		expect(await proofHash('B'.repeat(43))).not.toBe(first);
	});

	it('recognises only well formed hashes', () => {
		expect(isProofHash(room)).toBe(true);
		expect(isProofHash(room.toUpperCase())).toBe(false);
		expect(isProofHash('')).toBe(false);
		expect(isProofHash(`${room}\n`)).toBe(false);
	});

	it('compares hashes by value', () => {
		expect(hashesEqual('abc', 'abc')).toBe(true);
		expect(hashesEqual('abc', 'abd')).toBe(false);
		expect(hashesEqual('abc', 'abcd')).toBe(false);
	});
});
