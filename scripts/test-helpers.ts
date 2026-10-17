/* Shared by the relay tests: polling, proof values and a WebSocket that records what it receives. */
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { MAX_MESSAGE_BYTES, PACKET_MAGIC } from '../src/lib/sync/relay-protocol.js';
import { PROOF_PREFIX } from '../src/lib/sync/room-access.js';

export const PROOF = 'P'.repeat(43);

export const proofProtocol = (proof: string) => `${PROOF_PREFIX}${proof}`;

export async function until(check: () => boolean, timeoutMs = 15_000) {
	const deadline = Date.now() + timeoutMs;
	while (!check()) {
		if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for a condition`);
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

/** A 45 byte versioned packet; `seed` makes its payload (and so its hash) unique. */
export function packet(seed = 0, durable = true) {
	const out = Buffer.alloc(45);
	out.set([...PACKET_MAGIC, durable ? 1 : 0]);
	out.writeUInt32BE(seed, 8);
	return out;
}

/** A durable packet at the transport size limit, filled with random bytes. */
export function largePacket() {
	return Buffer.concat([Buffer.from([...PACKET_MAGIC, 1]), randomBytes(MAX_MESSAGE_BYTES - 5)]);
}

/** A request to replace every entry up to revision `through`; `size` is the whole packet. */
export function snapshot(through: number, size: number) {
	const out = Buffer.alloc(size);
	out.set([...PACKET_MAGIC, 2]);
	out.writeUInt32BE(through, 5);
	return out;
}

export type Control = Record<string, unknown>;

const openSockets = new Set<WebSocket>();

export function terminateOpenSockets() {
	for (const ws of openSockets) ws.terminate();
	openSockets.clear();
}

/** Connects with the proof as subprotocol; resolves once open. `closed` resolves with the close code. */
export async function openSocket(url: string, proof = PROOF) {
	const ws = new WebSocket(url, [proofProtocol(proof)]);
	openSockets.add(ws);
	const binary: Buffer[] = [];
	const controls: Control[] = [];
	const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
	ws.on('message', (data, isBinary) => {
		if (isBinary) binary.push(Buffer.from(data as Buffer));
		else if (data.toString() !== 'pong') controls.push(JSON.parse(data.toString()));
	});
	await new Promise<void>((resolve, reject) => {
		ws.once('open', resolve);
		ws.once('error', reject);
	});
	ws.on('error', () => {});
	return { ws, binary, controls, closed };
}

export type TestSocket = Awaited<ReturnType<typeof openSocket>>;

/** Opens a socket and waits for the server's `ready` control. */
export async function joinRoom(url: string, proof = PROOF) {
	const peer = await openSocket(url, proof);
	await until(() => peer.controls.some((control) => control.type === 'ready'));
	return peer;
}
