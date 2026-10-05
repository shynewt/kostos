import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { createRelay } from './relay.js';
import { payloadHash } from '../src/lib/sync/relay-protocol.js';

let server: WebSocketServer;
let directory: string;
const sockets: WebSocket[] = [];
async function start(dir?: string) {
	directory = dir ?? await mkdtemp(join(tmpdir(), 'kostos-relay-'));
	server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	const attach = createRelay(directory);
	server.on('connection', (ws) => attach(ws, 'ROOM'));
	await new Promise<void>((resolve) => server.once('listening', resolve));
	return `ws://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function connect(url: string) {
	const ws = new WebSocket(url); sockets.push(ws);
	const binary: Buffer[] = [];
	const controls: Record<string, unknown>[] = [];
	ws.on('message', (data, isBinary) => { if (isBinary) binary.push(Buffer.from(data as Buffer)); else controls.push(JSON.parse(data.toString())); });
	await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
	return { ws, binary, controls };
}
async function until(check: () => boolean) {
	const deadline = Date.now() + 15_000;
	while (!check()) { if (Date.now() > deadline) throw new Error('Relay did not respond'); await new Promise((r) => setTimeout(r, 5)); }
}
async function stop() {
	for (const ws of server.clients) ws.terminate();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}
afterEach(async () => { for (const ws of sockets.splice(0)) ws.terminate(); if (server) await stop(); if (directory) await rm(directory, { recursive: true, force: true }); });
function packet(seed: number, durable = true) {
	const out = Buffer.alloc(45); out.set([75, 79, 83, 51, durable ? 1 : 0]); out.writeUInt32BE(seed, 8); return out;
}

describe('durable encrypted relay', () => {
	it('replays all 1005 updates after a restart, without a live sender', async () => {
		const url = await start(); const sender = await connect(url);
		await until(() => sender.controls.some((m) => m.type === 'ready'));
		for (let i = 0; i < 1005; i++) sender.ws.send(packet(i));
		await until(() => sender.controls.some((m) => m.type === 'ack' && m.revision === 1005));
		await stop();
		const restarted = await start(directory); const receiver = await connect(restarted);
		await until(() => receiver.controls.some((m) => m.type === 'ready'));
		expect(receiver.binary).toHaveLength(1005);
		expect(receiver.binary[0]).toEqual(packet(0).subarray(5));
		expect(receiver.binary.at(-1)).toEqual(packet(1004).subarray(5));
		expect(receiver.controls.at(-1)).toMatchObject({ revision: 1005, durable: true, complete: true });
	}, 30_000);
	it('orders replay, live fanout, acknowledgement and barriers; retries are idempotent', async () => {
		const url = await start(); const a = await connect(url); const b = await connect(url);
		await until(() => b.controls.some((m) => m.type === 'ready'));
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
		const url = await start(); const a = await connect(url); const b = await connect(url);
		await until(() => b.controls.some((m) => m.type === 'ready'));
		a.ws.send(packet(1, false));
		await until(() => b.binary.length === 1);
		const c = await connect(url); await until(() => c.controls.some((m) => m.type === 'ready'));
		expect(c.binary).toHaveLength(0);
		expect(c.controls.at(-1)?.revision).toBe(0);
	});
	it('reports persistence failure without acknowledging or broadcasting the write', async () => {
		const url = await start(); const a = await connect(url); const b = await connect(url);
		await until(() => b.controls.some((m) => m.type === 'ready'));
		await rm(directory, { recursive: true, force: true });
		a.ws.send(packet(1));
		await until(() => a.controls.some((m) => m.type === 'error'));
		expect(a.controls.some((m) => m.type === 'ack')).toBe(false);
		expect(b.binary).toHaveLength(0);
	});
});
