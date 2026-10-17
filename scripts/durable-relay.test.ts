import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { createRelay } from './relay.js';
import { joinRoom, openSocket, terminateOpenSockets, until } from './test-helpers.js';
import { MAX_MESSAGE_BYTES, payloadHash } from '../src/lib/sync/relay-protocol.js';
import { parseProofProtocol } from '../src/lib/sync/room-access.js';

const ROOM = 'a'.repeat(64);
const proofOf = (request: { headers: Record<string, string | string[] | undefined> }) =>
	parseProofProtocol(request.headers['sec-websocket-protocol'] as string | undefined)?.proof ?? '';

let server: WebSocketServer;
let directory: string;
async function start(dir?: string) {
	directory = dir ?? await mkdtemp(join(tmpdir(), 'kostos-relay-'));
	server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	const attach = createRelay(directory);
	server.on('connection', (ws, request) => attach(ws, ROOM, proofOf(request)));
	await new Promise<void>((resolve) => server.once('listening', resolve));
	return `ws://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function stop() {
	for (const ws of server.clients) ws.terminate();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}
afterEach(async () => {
	terminateOpenSockets();
	if (server) await stop();
	if (directory) await rm(directory, { recursive: true, force: true });
});
function packet(seed: number, durable = true) {
	const out = Buffer.alloc(45); out.set([75, 79, 83, 51, durable ? 1 : 0]); out.writeUInt32BE(seed, 8); return out;
}

describe('durable encrypted relay', () => {
	it('drain waits for queued writes so a shutdown cannot cut one off', async () => {
		directory = await mkdtemp(join(tmpdir(), 'kostos-relay-'));
		server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
		const attach = createRelay(directory);
		let received = 0;
		server.on('connection', (ws, request) => { attach(ws, ROOM, proofOf(request)); ws.on('message', (_data, binary) => { if (binary) received++; }); });
		await new Promise<void>((resolve) => server.once('listening', resolve));
		const sender = await joinRoom(`ws://127.0.0.1:${(server.address() as { port: number }).port}`);
		for (let i = 0; i < 200; i++) sender.ws.send(packet(i));
		await until(() => received === 200);
		await attach.drain();
		await stop();
		const restarted = await start(directory); const receiver = await joinRoom(restarted);
		expect(receiver.binary).toHaveLength(200);
	}, 30_000);
	it('replays all 1005 updates after a restart, without a live sender', async () => {
		const url = await start(); const sender = await joinRoom(url);
		for (let i = 0; i < 1005; i++) sender.ws.send(packet(i));
		await until(() => sender.controls.some((m) => m.type === 'ack' && m.revision === 1005));
		await stop();
		const restarted = await start(directory); const receiver = await joinRoom(restarted);
		expect(receiver.binary).toHaveLength(1005);
		expect(receiver.binary[0]).toEqual(packet(0).subarray(5));
		expect(receiver.binary.at(-1)).toEqual(packet(1004).subarray(5));
		expect(receiver.controls.at(-1)).toMatchObject({ revision: 1005, durable: true, complete: true });
	}, 30_000);
	it('orders replay, live fanout, acknowledgement and barriers; retries are idempotent', async () => {
		const url = await start(); const a = await openSocket(url); const b = await joinRoom(url);
		// Malformed/non-object controls must not crash the room or break ordering.
		for (const input of ['null', '[]', '"hello"', '{broken']) a.ws.send(input);
		const first = packet(1); a.ws.send(first); a.ws.send(first);
		a.ws.send(JSON.stringify({ type: 'barrier', id: 'after-write' }));
		await until(() => a.controls.some((m) => m.type === 'caught-up'));
		expect(a.controls.filter((m) => m.type === 'ack')).toHaveLength(2);
		expect(a.controls.at(-1)).toEqual({ type: 'caught-up', id: 'after-write', revision: 1 });
		expect(b.binary).toHaveLength(1);
		expect(b.controls.at(-1)).toEqual({ type: 'revision', revision: 1 });
		expect(a.controls.find((m) => m.type === 'ack')?.hash).toBe(await payloadHash(first.subarray(5)));
	});
	it('broadcasts transient peer handshakes without polluting durable replay', async () => {
		const url = await start(); const a = await openSocket(url); const b = await joinRoom(url);
		a.ws.send(packet(1, false));
		await until(() => b.binary.length === 1);
		const c = await joinRoom(url);
		expect(c.binary).toHaveLength(0);
		expect(c.controls.at(-1)?.revision).toBe(0);
	});
	it('reports persistence failure without acknowledging or broadcasting the write', async () => {
		const url = await start(); const a = await openSocket(url); const b = await joinRoom(url);
		await rm(directory, { recursive: true, force: true });
		a.ws.send(packet(1));
		await until(() => a.controls.some((m) => m.type === 'error'));
		expect(a.controls.some((m) => m.type === 'ack')).toBe(false);
		expect(b.binary).toHaveLength(0);
	});
	it('ignores snapshot requests without storing or closing', async () => {
		const url = await start(); const a = await joinRoom(url);
		a.ws.send(packet(1));
		await until(() => a.controls.some((m) => m.type === 'ack'));
		const snap = Buffer.alloc(60); snap.set([75, 79, 83, 51, 2]); snap.writeUInt32BE(1, 5); a.ws.send(snap);
		a.ws.send(JSON.stringify({ type: 'barrier', id: 'x' }));
		await until(() => a.controls.some((m) => m.type === 'caught-up'));
		expect(a.controls.at(-1)).toMatchObject({ revision: 1 });
		expect(a.ws.readyState).toBe(WebSocket.OPEN);
	});
	it('lets the first proof claim the room and tells any other proof it was denied', async () => {
		const url = await start(); const owner = await joinRoom(url);
		const intruder = await openSocket(url, 'Q'.repeat(43));
		expect(await intruder.closed).toBe(1008);
		expect(intruder.controls).toEqual([{ type: 'denied' }]);
		expect(intruder.binary).toHaveLength(0);
	});
	it('ignores updates from a socket that was denied', async () => {
		const url = await start(); const owner = await joinRoom(url);
		const intruder = await openSocket(url, 'Q'.repeat(43));
		intruder.ws.send(packet(7));
		await intruder.closed;
		const reader = await joinRoom(url);
		expect(reader.binary).toHaveLength(0);
	});
	it('remembers the claim across a restart', async () => {
		const url = await start(); const owner = await joinRoom(url);
		await stop();
		const restarted = await start(directory);
		const intruder = await openSocket(restarted, 'Q'.repeat(43));
		expect(await intruder.closed).toBe(1008);
		const again = await joinRoom(restarted);
	});
	it('gives an unclaimed room to exactly one of two simultaneous first connections', async () => {
		const url = await start();
		const peers = await Promise.all([openSocket(url, 'A'.repeat(43)), openSocket(url, 'B'.repeat(43))]);
		await until(() => peers.every((peer) => peer.controls.length > 0));
		expect(peers.map((peer) => peer.controls[0].type).sort()).toEqual(['denied', 'ready']);
	});
	it('treats a torn claim file as an error, never as an unclaimed room', async () => {
		const url = await start();
		const stem = createHash('sha256').update(ROOM).digest('hex');
		await mkdir(directory, { recursive: true });
		await writeFile(`${directory}/${stem}.auth`, 'half-writ');
		const peer = await openSocket(url);
		expect(await peer.closed).toBe(1011);
		expect(peer.controls).toEqual([{ type: 'error', reason: 'storage' }]);
	});
	it('keeps an update from a socket that closes straight after sending it', async () => {
		const url = await start(); const sender = await joinRoom(url);
		for (let i = 0; i < 20; i++) sender.ws.send(packet(i));
		sender.ws.close();
		await sender.closed;
		const receiver = await joinRoom(url);
		expect(receiver.binary).toHaveLength(20);
	});
	it('refuses writes past the room storage cap and keeps what was acknowledged', async () => {
		const url = await start(); const sender = await joinRoom(url);
		const large = () => Buffer.concat([Buffer.from([75, 79, 83, 51, 1]), randomBytes(MAX_MESSAGE_BYTES - 5)]);
		let acknowledged = 0;
		for (let i = 0; i < 40 && !sender.controls.some((m) => m.type === 'error'); i++) {
			sender.ws.send(large());
			await until(() => sender.controls.some((m) => m.type === 'ack' && m.revision === acknowledged + 1) || sender.controls.some((m) => m.type === 'error'));
			if (!sender.controls.some((m) => m.type === 'error')) acknowledged++;
		}
		expect(sender.controls.at(-1)).toEqual({ type: 'error', reason: 'storage' });
		expect(acknowledged).toBe(32);
		expect(await sender.closed).toBe(1011);
		const reader = await joinRoom(url);
		expect(reader.binary).toHaveLength(32);
	}, 60_000);
});
