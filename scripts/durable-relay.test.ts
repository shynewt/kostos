import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { createRelay } from './relay.js';
import { joinRoom, largePacket, openSocket, packet, packetsFillingTheCap, PROOF, snapshot, terminateOpenSockets, until } from './test-helpers.js';
import { MAX_ROOM_ENTRIES, payloadHash } from '../src/lib/sync/relay-protocol.js';
import { parseProofProtocol } from '../src/lib/sync/room-access.js';

const ROOM = 'a'.repeat(64);
const ROOM_STEM = createHash('sha256').update(ROOM).digest('hex');

// records file system calls, and lets a test make the next log append write half a line and then
// fail, like a full disk
const fsSpy = vi.hoisted(() => ({ armed: false, directorySyncError: null as string | null, calls: [] as string[] }));
vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return {
		...actual,
		readFile: async (path: string, ...rest: unknown[]) => {
			fsSpy.calls.push(`read ${path}`);
			return (actual.readFile as (...args: unknown[]) => Promise<unknown>)(path, ...rest);
		},
		rename: async (from: string, to: string) => {
			fsSpy.calls.push(`rename ${to}`);
			return actual.rename(from, to);
		},
		open: async (path: string, flags: string) => {
			const handle = await actual.open(path, flags);
			const failThisAppend = fsSpy.armed && flags === 'a';
			if (failThisAppend) fsSpy.armed = false;
			return new Proxy(handle, {
				get(target, property) {
					if (property === 'sync') {
						return async () => {
							fsSpy.calls.push(`sync ${path}`);
							if (flags === 'r' && fsSpy.directorySyncError) throw Object.assign(new Error('cannot sync a directory'), { code: fsSpy.directorySyncError });
							return target.sync();
						};
					}
					if (property === 'writeFile' && failThisAppend) {
						return async (data: string) => {
							await target.write(data.slice(0, 20));
							throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
						};
					}
					const value = Reflect.get(target, property);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			});
		}
	};
});
const proofOf = (request: { headers: Record<string, string | string[] | undefined> }) =>
	parseProofProtocol(request.headers['sec-websocket-protocol'] as string | undefined)?.proof ?? '';

let server: WebSocketServer;
let directory: string;
let attach: ReturnType<typeof createRelay>;
async function start(dir?: string, onConnection?: (ws: WebSocket) => void) {
	directory = dir ?? await mkdtemp(join(tmpdir(), 'kostos-relay-'));
	server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	attach = createRelay(directory);
	server.on('connection', (ws, request) => { attach(ws, ROOM, proofOf(request)); onConnection?.(ws); });
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

beforeEach(() => { fsSpy.calls.length = 0; fsSpy.directorySyncError = null; });

describe('durable encrypted relay', () => {
	it('drain waits for queued writes so a shutdown cannot cut one off', async () => {
		let received = 0;
		const url = await start(undefined, (ws) => ws.on('message', (_data, binary) => { if (binary) received++; }));
		const sender = await joinRoom(url);
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
		a.ws.send(snapshot(1, 60));
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
		await mkdir(directory, { recursive: true });
		await writeFile(`${directory}/${ROOM_STEM}.auth`, 'half-writ');
		const peer = await openSocket(url);
		expect(await peer.closed).toBe(1011);
		expect(peer.controls).toEqual([{ type: 'error', reason: 'storage' }]);
	});
	it('syncs the data directory after renaming the claim into place', async () => {
		await joinRoom(await start());
		const renamed = fsSpy.calls.indexOf(`rename ${directory}/${ROOM_STEM}.auth`);
		expect(renamed).toBeGreaterThanOrEqual(0);
		expect(fsSpy.calls.indexOf(`sync ${directory}`)).toBeGreaterThan(renamed);
	});
	it.each(['EPERM', 'EINVAL', 'EISDIR', 'ENOTSUP', 'ENOSYS'])('still claims a room where the platform cannot sync a directory (%s)', async (code) => {
		fsSpy.directorySyncError = code;
		await joinRoom(await start());
		expect(fsSpy.calls).toContain(`sync ${directory}`);
	});
	it('fails the claim when the directory sync fails for any other reason', async () => {
		fsSpy.directorySyncError = 'EIO';
		const peer = await openSocket(await start());
		expect(await peer.closed).toBe(1011);
		expect(peer.controls).toEqual([{ type: 'error', reason: 'storage' }]);
	});
	it('forgets an idle room and loads it from disk again on the next connection', async () => {
		const url = await start(); const first = await joinRoom(url);
		first.ws.send(packet(1));
		await until(() => first.controls.some((m) => m.type === 'ack'));
		first.ws.close();
		await until(() => server.clients.size === 0);
		const second = await joinRoom(url);
		expect(second.binary).toHaveLength(1);
		expect(fsSpy.calls.filter((call) => call === `read ${directory}/${ROOM_STEM}.jsonl`)).toHaveLength(2);
	});
	it('keeps a room in memory while writes from a closed socket are still queued', async () => {
		const url = await start(); const sender = await joinRoom(url);
		for (let i = 0; i < 200; i++) sender.ws.send(packet(i));
		sender.ws.close();
		await sender.closed;
		const reader = await joinRoom(url);
		expect(reader.binary).toHaveLength(200);
		reader.ws.send(packet(5));
		reader.ws.send(JSON.stringify({ type: 'barrier', id: 'end' }));
		await until(() => reader.controls.some((m) => m.type === 'caught-up'));
		expect(reader.controls.find((m) => m.type === 'ack')).toMatchObject({ revision: 6 });
		expect(reader.controls.at(-1)).toMatchObject({ type: 'caught-up', revision: 200 });
	}, 30_000);
	it('forgets a room whose last socket closed before its queued writes finished', async () => {
		const url = await start(); const sender = await joinRoom(url);
		for (let i = 0; i < 20; i++) sender.ws.send(largePacket());
		sender.ws.close();
		await sender.closed;
		await until(() => server.clients.size === 0);
		await attach.drain();
		const reader = await joinRoom(url);
		expect(reader.binary).toHaveLength(20);
		expect(fsSpy.calls.filter((call) => call === `read ${directory}/${ROOM_STEM}.jsonl`)).toHaveLength(2);
	}, 30_000);
	it('does not let a denied socket that closes late evict the room that replaced its own', async () => {
		const url = await start(); const owner = await joinRoom(url);
		const intruder = await openSocket(url, 'Q'.repeat(43));
		// never reads the denial, so its close handshake only finishes after the room was evicted and recreated
		intruder.ws.pause();
		owner.ws.send(JSON.stringify({ type: 'barrier', id: 'intruder-processed' }));
		await until(() => owner.controls.some((m) => m.type === 'caught-up'));
		owner.ws.close();
		await owner.closed;
		await until(() => server.clients.size === 1);
		const second = await joinRoom(url);
		intruder.ws.resume();
		await intruder.closed;
		const third = await joinRoom(url);
		third.ws.send(packet(7));
		await until(() => second.binary.length === 1, 2000);
	});
	it('keeps an update from a socket that closes straight after sending it', async () => {
		const url = await start(); const sender = await joinRoom(url);
		for (let i = 0; i < 20; i++) sender.ws.send(packet(i));
		sender.ws.close();
		await sender.closed;
		const receiver = await joinRoom(url);
		expect(receiver.binary).toHaveLength(20);
	});
	it('accepts the write that exactly fills the cap and refuses the next one', async () => {
		const url = await start(); const sender = await joinRoom(url);
		const filling = packetsFillingTheCap();
		for (const [index, update] of filling.entries()) {
			sender.ws.send(update);
			await until(() => sender.controls.some((m) => m.type === 'ack' && m.revision === index + 1));
		}
		sender.ws.send(packet(1));
		expect(await sender.closed).toBe(1011);
		expect(sender.controls.at(-1)).toEqual({ type: 'error', reason: 'full' });
	}, 60_000);
	it('refuses writes past the room storage cap and keeps what was acknowledged', async () => {
		const url = await start(); const sender = await joinRoom(url);
		let acknowledged = 0;
		for (let i = 0; i < 40 && !sender.controls.some((m) => m.type === 'error'); i++) {
			sender.ws.send(largePacket());
			await until(() => sender.controls.some((m) => m.type === 'ack' && m.revision === acknowledged + 1) || sender.controls.some((m) => m.type === 'error'));
			if (!sender.controls.some((m) => m.type === 'error')) acknowledged++;
		}
		expect(sender.controls.at(-1)).toEqual({ type: 'error', reason: 'full' });
		expect(acknowledged).toBe(32);
		expect(await sender.closed).toBe(1011);
		const reader = await joinRoom(url);
		expect(reader.binary).toHaveLength(32);
	}, 60_000);
});

describe('room entry cap', () => {
	async function seedEntries(count: number) {
		directory = await mkdtemp(join(tmpdir(), 'kostos-relay-'));
		const lines = Array.from({ length: count }, (_, seed) => {
			const payload = Buffer.alloc(28);
			payload.writeUInt32BE(seed, 0);
			return JSON.stringify({ hash: createHash('sha256').update(payload).digest('hex'), data: payload.toString('base64') });
		});
		await writeFile(`${directory}/${ROOM_STEM}.jsonl`, `${lines.join('\n')}\n`);
	}

	it('refuses a write that would pass the entry cap and keeps what was stored', async () => {
		await seedEntries(MAX_ROOM_ENTRIES - 1);
		const sender = await joinRoom(await start(directory));
		sender.ws.send(packet(1));
		await until(() => sender.controls.some((m) => m.type === 'ack'));
		expect(sender.controls.find((m) => m.type === 'ack')).toMatchObject({ revision: MAX_ROOM_ENTRIES });
		sender.ws.send(packet(2));
		expect(await sender.closed).toBe(1011);
		expect(sender.controls.at(-1)).toEqual({ type: 'error', reason: 'full' });
		expect(sender.controls.filter((m) => m.type === 'ack')).toHaveLength(1);
	}, 30_000);

	it('still acknowledges an update it already stored when the room is at the entry cap', async () => {
		await seedEntries(MAX_ROOM_ENTRIES - 1);
		const url = await start(directory);
		const sender = await joinRoom(url);
		sender.ws.send(packet(1));
		await until(() => sender.controls.some((m) => m.type === 'ack'));
		const retry = await joinRoom(url);
		retry.ws.send(packet(1));
		await until(() => retry.controls.some((m) => m.type === 'ack'));
		expect(retry.ws.readyState).toBe(WebSocket.OPEN);
	}, 30_000);
});

describe('relay disk log recovery', () => {
	const logFile = () => `${directory}/${ROOM_STEM}.jsonl`;
	const loggedLines = async () => (await readFile(logFile(), 'utf8')).split('\n');

	async function writeThree() {
		const url = await start(); const sender = await joinRoom(url);
		for (let i = 0; i < 3; i++) sender.ws.send(packet(i));
		await until(() => sender.controls.some((m) => m.type === 'ack' && m.revision === 3));
		await stop();
	}

	it('drops an interrupted final append, keeps acknowledged updates and appends cleanly afterwards', async () => {
		await writeThree();
		await appendFile(logFile(), '{"hash":"ab","data":"AAA');
		const restarted = await start(directory); const peer = await joinRoom(restarted);
		expect(peer.binary).toHaveLength(3);
		expect(peer.controls.at(-1)).toMatchObject({ type: 'ready', revision: 3 });
		peer.ws.send(packet(10));
		await until(() => peer.controls.some((m) => m.type === 'ack' && m.revision === 4));
		await stop();
		const lines = await loggedLines();
		expect(lines).toHaveLength(5);
		expect(lines.at(-1)).toBe('');
		for (const line of lines.slice(0, -1)) expect(() => JSON.parse(line)).not.toThrow();
		const reread = await joinRoom(await start(directory));
		expect(reread.binary).toHaveLength(4);
	});

	it('still refuses a room with a corrupt line in the middle of its log', async () => {
		await writeThree();
		const [first, , third] = await loggedLines();
		await writeFile(logFile(), `${first}\n{"hash":"ab","data":"AAA\n${third}\n`);
		const peer = await openSocket(await start(directory));
		expect(await peer.closed).toBe(1011);
		expect(peer.controls).toEqual([{ type: 'error', reason: 'storage' }]);
	});

	it('truncates a half-written append when the write fails, so the room carries on', async () => {
		await writeThree();
		const before = await readFile(logFile());
		const url = await start(directory); const sender = await joinRoom(url);
		fsSpy.armed = true;
		sender.ws.send(packet(20));
		expect(await sender.closed).toBe(1011);
		expect(sender.controls.some((m) => m.type === 'ack')).toBe(false);
		expect(await readFile(logFile())).toEqual(before);
		const retry = await joinRoom(url);
		retry.ws.send(packet(20));
		await until(() => retry.controls.some((m) => m.type === 'ack' && m.revision === 4));
		expect(retry.binary).toHaveLength(3);
	});

	it('logs why a room failed without leaking the proof', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const url = await start();
			await mkdir(directory, { recursive: true });
			await writeFile(`${directory}/${ROOM_STEM}.auth`, 'half-writ');
			await (await openSocket(url)).closed;
			const logged = errors.mock.calls.flat().join(' ');
			expect(logged).toContain(ROOM_STEM.slice(0, 8));
			expect(logged).not.toContain(PROOF);
		} finally {
			errors.mockRestore();
		}
	});
});
