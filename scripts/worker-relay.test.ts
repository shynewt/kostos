/* Exercise the production Durable Object inside the same Workers runtime used
 * by Wrangler, including legacy KV migration and a cold storage restart. */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES } from '../src/lib/sync/relay-protocol.js';
import { joinRoom, openSocket, PROOF, proofProtocol, terminateOpenSockets, until } from './test-helpers.js';

const room = (name: string) => createHash('sha256').update(name).digest('hex');

let mf: Miniflare;
let directory: string;
let scriptPath: string;
let script: string;
const legacyScript = `export class SyncRoom {
 constructor(ctx) { this.ctx = ctx; }
 async fetch(request) {
  const count = Number(new URL(request.url).searchParams.get('count'));
  await this.ctx.storage.put('history', Array.from({length:count}, (_, i) => { const data = new Uint8Array(40); new DataView(data.buffer).setUint32(0, i); return data.buffer; }));
  return new Response('seeded');
 }
}
export default {fetch(request,env) { const room = new URL(request.url).pathname.split('/').pop(); return env.SYNC_ROOM.get(env.SYNC_ROOM.idFromName(room)).fetch(request); }};`;
function options() {
	return { name: 'kostos-relay-test', modules: true, compatibilityDate: '2025-05-01', host: '127.0.0.1', port: 0, durableObjects: { SYNC_ROOM: { className: 'SyncRoom', useSQLite: true } }, durableObjectsPersist: join(directory, 'storage') };
}
beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), 'kostos-worker-'));
	scriptPath = join(directory, 'worker.mjs');
	await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', outfile: scriptPath, external: ['cloudflare:workers'], logLevel: 'silent' });
	script = await readFile(scriptPath, 'utf8');
	mf = new Miniflare({ ...options(), script: legacyScript });
	await mf.ready;
	await mf.dispatchFetch(`http://local/sync/${room('small')}?count=3`);
	await mf.dispatchFetch(`http://local/sync/${room('capped')}?count=1000`);
	await mf.setOptions({ ...options(), script });
	await mf.ready;
}, 30_000);
afterAll(async () => {
	terminateOpenSockets();
	await mf?.dispose();
	await rm(directory, { recursive: true, force: true });
});
async function open(name: string, proof = PROOF) {
	const { host } = await mf.ready;
	return openSocket(`ws://${host}/sync/${room(name)}`, proof);
}
async function connect(name: string, proof = PROOF) {
	const { host } = await mf.ready;
	return joinRoom(`ws://${host}/sync/${room(name)}`, proof);
}

describe('Cloudflare Durable Object sync', () => {
	it('migrates every legacy ciphertext without claiming a capped history is complete', async () => {
		const small = await connect('small');
		expect(small.binary).toHaveLength(3);
		expect(small.controls.at(-1)).toMatchObject({ type: 'ready', revision: 3, complete: true, durable: true });
		const capped = await connect('capped');
		expect(capped.binary).toHaveLength(1000);
		expect(capped.controls.at(-1)).toMatchObject({ revision: 1000, complete: false });
	});
	it('commits, fans out, acknowledges and establishes the same barrier as Node', async () => {
		const a = await connect('live'); const b = await connect('live');
		const packet = Buffer.alloc(45); packet.set([75, 79, 83, 51, 1]);
		a.ws.send(packet); a.ws.send(JSON.stringify({ type: 'barrier', id: 'done' }));
		await until(() => a.controls.some((m) => m.type === 'caught-up'));
		expect(a.controls.find((m) => m.type === 'ack')).toMatchObject({ revision: 1 });
		expect(a.controls.at(-1)).toEqual({ type: 'caught-up', id: 'done', revision: 1 });
		expect(b.binary).toEqual([packet.subarray(5)]);
		expect(b.controls.at(-1)).toEqual({ type: 'revision', revision: 1 });
	});
	it('replays after a cold restart with all peers gone and preserves the migration marker', async () => {
		terminateOpenSockets();
		await mf.dispose(); mf = new Miniflare({ ...options(), script }); await mf.ready;
		const live = await connect('live');
		expect(live.binary).toHaveLength(1);
		expect(live.controls.at(-1)).toMatchObject({ revision: 1, complete: true });
		const small = await connect('small'); expect(small.binary).toHaveLength(3);
		const capped = await connect('capped'); expect(capped.binary).toHaveLength(1000);
		expect(capped.controls.at(-1)?.complete).toBe(false);
	});
	it('lets a device holding the data declare a trimmed history complete, for everyone, permanently', async () => {
		const repairer = await connect('capped');
		repairer.ws.send(JSON.stringify({ type: 'complete' }));
		repairer.ws.send(JSON.stringify({ type: 'barrier', id: 'after' }));
		await until(() => repairer.controls.some((m) => m.type === 'caught-up'));
		const other = await connect('capped');
		expect(other.controls.at(-1)).toMatchObject({ type: 'ready', complete: true });
	});
	it('replaces a long history with a snapshot, keeping revision numbers and later entries', async () => {
		const a = await connect('compact');
		for (let i = 0; i < 5; i++) { const p = Buffer.alloc(45); p.set([75, 79, 83, 51, 1]); p.writeUInt32BE(i, 8); a.ws.send(p); }
		await until(() => a.controls.some((m) => m.type === 'ack' && m.revision === 5));
		const snap = Buffer.alloc(60); snap.set([75, 79, 83, 51, 2]); snap.writeUInt32BE(5, 5); snap.write('snapshot', 20);
		a.ws.send(snap);
		await until(() => a.controls.some((m) => m.type === 'compacted'));
		const later = Buffer.alloc(45); later.set([75, 79, 83, 51, 1]); later.writeUInt32BE(99, 8); a.ws.send(later);
		await until(() => a.controls.some((m) => m.type === 'ack' && m.revision === 6));
		const b = await connect('compact');
		expect(b.binary).toHaveLength(2);
		expect(b.binary[0]).toEqual(snap.subarray(9));
		expect(b.controls.at(-1)).toMatchObject({ type: 'ready', revision: 6 });
	});
});

describe('room access', () => {
	const upgrade = { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': proofProtocol(PROOF) };
	const packet = (seed: number) => { const out = Buffer.alloc(45); out.set([75, 79, 83, 51, 1]); out.writeUInt32BE(seed, 8); return out; };

	it('answers 400 for a relay room ID that is not 64 lowercase hex, before any Durable Object runs', async () => {
		for (const bad of ['SMALL', 'PRT-AAAA-BBBB', room('x').toUpperCase(), room('x').slice(1), `${room('x')}0`, '%2F']) {
			const response = await mf.dispatchFetch(`http://local/sync/${bad}`, { headers: upgrade });
			expect(response.status, bad).toBe(400);
		}
	});

	it('answers 401 when no proof, or a malformed one, is offered', async () => {
		const bare = await mf.dispatchFetch(`http://local/sync/${room('open')}`, { headers: { Upgrade: 'websocket' } });
		expect(bare.status).toBe(401);
		const malformed = await mf.dispatchFetch(`http://local/sync/${room('open')}`, { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': proofProtocol('short') } });
		expect(malformed.status).toBe(401);
	});

	it('echoes the proof subprotocol so browsers accept the upgrade', async () => {
		const owner = await connect('echo');
		expect(owner.ws.protocol).toBe(proofProtocol(PROOF));
	});

	it('tells a different proof it was denied, closes it with 1008 and ignores what it sends', async () => {
		const owner = await connect('claimed');
		owner.ws.send(packet(1)); owner.ws.send(JSON.stringify({ type: 'barrier', id: 'a' }));
		await until(() => owner.controls.some((m) => m.type === 'caught-up'));
		const intruder = await open('claimed', 'Q'.repeat(43));
		intruder.ws.send(packet(2));
		await until(() => intruder.controls.length > 0);
		expect(intruder.controls).toEqual([{ type: 'denied' }]);
		expect(intruder.ws.protocol).toBe(proofProtocol('Q'.repeat(43)));
		expect(await intruder.closed).toBe(1008);
		expect(intruder.binary).toHaveLength(0);
		const reader = await connect('claimed');
		expect(reader.binary).toHaveLength(1);
		expect(reader.controls.at(-1)).toMatchObject({ type: 'ready', revision: 1 });
	});

	it('keeps the claim across a cold restart', async () => {
		await connect('restart');
		terminateOpenSockets();
		await mf.dispose(); mf = new Miniflare({ ...options(), script }); await mf.ready;
		const intruder = await open('restart', 'Q'.repeat(43));
		await until(() => intruder.controls.length > 0);
		expect(intruder.controls[0]).toEqual({ type: 'denied' });
		await connect('restart');
	});

	it('gives an unclaimed room to exactly one of two simultaneous first connections', async () => {
		const peers = await Promise.all([open('race', 'A'.repeat(43)), open('race', 'B'.repeat(43))]);
		await until(() => peers.every((peer) => peer.controls.length > 0));
		expect(peers.map((peer) => peer.controls[0].type).sort()).toEqual(['denied', 'ready']);
	});
});

describe('room storage cap', () => {
	const largePacket = () => Buffer.concat([Buffer.from([75, 79, 83, 51, 1]), randomBytes(MAX_MESSAGE_BYTES - 5)]);
	const smallPacket = (seed: number) => { const out = Buffer.alloc(45); out.set([75, 79, 83, 51, 1]); out.writeUInt32BE(seed, 8); return out; };
	const snapshot = (through: number, size: number) => {
		const out = Buffer.alloc(size); out.set([75, 79, 83, 51, 2]); out.writeUInt32BE(through, 5); return out;
	};
	const hasType = (peer: { controls: Record<string, unknown>[] }, type: string) => peer.controls.some((m) => m.type === type);

	/** Writes until the room refuses. Returns what was stored, in order, and leaves the closed socket behind. */
	async function fillToCap(name: string, leading: Buffer[] = []) {
		const full = await connect(name);
		const stored: Buffer[] = [];
		for (const packet of [...leading, ...Array.from({ length: 40 }, largePacket)]) {
			full.ws.send(packet);
			await until(() => full.controls.some((m) => m.type === 'ack' && m.revision === stored.length + 1) || hasType(full, 'error'));
			if (hasType(full, 'error')) break;
			stored.push(packet);
		}
		expect(full.controls.at(-1)).toEqual({ type: 'error', reason: 'storage' });
		expect(await full.closed).toBe(1011);
		return stored;
	}

	it('refuses writes once the live history reaches the cap, and keeps what was acknowledged', async () => {
		const stored = await fillToCap('full');
		expect(stored).toHaveLength(32);
		const again = await connect('full');
		expect(again.binary).toHaveLength(32);
	}, 60_000);

	it('still acknowledges an update it already stored when the room is at the cap', async () => {
		const stored = await fillToCap('full-retry');
		const retry = await connect('full-retry');
		retry.ws.send(stored[3]);
		await until(() => hasType(retry, 'ack'));
		expect(retry.controls.find((m) => m.type === 'ack')).toMatchObject({ revision: 4 });
		expect(retry.ws.readyState).toBe(WebSocket.OPEN);
	}, 60_000);

	it('accepts writes again after a compaction frees live history', async () => {
		const stored = await fillToCap('recover');
		const device = await connect('recover');
		device.ws.send(snapshot(stored.length, 200));
		await until(() => hasType(device, 'compacted'));
		device.ws.send(largePacket());
		await until(() => device.controls.some((m) => m.type === 'ack' && m.revision === stored.length + 1));
		const reader = await connect('recover');
		expect(reader.binary).toHaveLength(2);
	}, 60_000);

	it('ignores a snapshot that would push the live history past the cap', async () => {
		const stored = await fillToCap('snapshot-overflow', [smallPacket(1), smallPacket(2)]);
		const device = await connect('snapshot-overflow');
		device.ws.send(snapshot(2, MAX_MESSAGE_BYTES));
		device.ws.send(JSON.stringify({ type: 'barrier', id: 'after' }));
		await until(() => hasType(device, 'caught-up'));
		expect(hasType(device, 'compacted')).toBe(false);
		expect(device.ws.readyState).toBe(WebSocket.OPEN);
		const reader = await connect('snapshot-overflow');
		expect(reader.binary).toHaveLength(stored.length);
	}, 60_000);
});
