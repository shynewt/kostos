/* Exercise the production Durable Object inside the same Workers runtime used
 * by Wrangler, including legacy KV migration and a cold storage restart. */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let mf: Miniflare;
let directory: string;
let scriptPath: string;
let script: string;
const clients: WebSocket[] = [];
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
	await mf.dispatchFetch('http://local/sync/SMALL?count=3');
	await mf.dispatchFetch('http://local/sync/CAPPED?count=1000');
	await mf.setOptions({ ...options(), script });
	await mf.ready;
}, 30_000);
afterAll(async () => { for (const client of clients) client.terminate(); await mf?.dispose(); await rm(directory, { recursive: true, force: true }); });
async function connect(room: string) {
	const url = await mf.ready;
	const ws = new WebSocket(`ws://${url.host}/sync/${room}`); clients.push(ws);
	const binary: Buffer[] = [];
	const controls: Record<string, unknown>[] = [];
	ws.on('message', (data, isBinary) => { if (isBinary) binary.push(Buffer.from(data as Buffer)); else controls.push(JSON.parse(data.toString())); });
	await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
	await until(() => controls.some((m) => m.type === 'ready'));
	return { ws, binary, controls };
}
async function until(check: () => boolean) {
	const deadline = Date.now() + 10_000;
	while (!check()) { if (Date.now() > deadline) throw new Error('Worker did not respond'); await new Promise((r) => setTimeout(r, 5)); }
}

describe('Cloudflare Durable Object sync', () => {
	it('migrates every legacy ciphertext without claiming a capped history is complete', async () => {
		const small = await connect('SMALL');
		expect(small.binary).toHaveLength(3);
		expect(small.controls.at(-1)).toMatchObject({ type: 'ready', revision: 3, complete: true, durable: true });
		const capped = await connect('CAPPED');
		expect(capped.binary).toHaveLength(1000);
		expect(capped.controls.at(-1)).toMatchObject({ revision: 1000, complete: false });
	});
	it('commits, fans out, acknowledges and establishes the same barrier as Node', async () => {
		const a = await connect('LIVE'); const b = await connect('LIVE');
		const packet = Buffer.alloc(45); packet.set([75, 79, 83, 51, 1]);
		a.ws.send(packet); a.ws.send(JSON.stringify({ type: 'barrier', id: 'done' }));
		await until(() => a.controls.some((m) => m.type === 'caught-up'));
		expect(a.controls.find((m) => m.type === 'ack')).toMatchObject({ revision: 1 });
		expect(a.controls.at(-1)).toEqual({ type: 'caught-up', id: 'done', revision: 1 });
		expect(b.binary).toEqual([packet.subarray(5)]);
		expect(b.controls.at(-1)).toEqual({ type: 'revision', revision: 1 });
	});
	it('replays after a cold restart with all peers gone and preserves the migration marker', async () => {
		for (const client of clients.splice(0)) client.terminate();
		await mf.dispose(); mf = new Miniflare({ ...options(), script }); await mf.ready;
		const live = await connect('LIVE');
		expect(live.binary).toHaveLength(1);
		expect(live.controls.at(-1)).toMatchObject({ revision: 1, complete: true });
		const small = await connect('SMALL'); expect(small.binary).toHaveLength(3);
		const capped = await connect('CAPPED'); expect(capped.binary).toHaveLength(1000);
		expect(capped.controls.at(-1)?.complete).toBe(false);
	});
	it('lets a device holding the data declare a trimmed history complete, for everyone, permanently', async () => {
		const repairer = await connect('CAPPED');
		repairer.ws.send(JSON.stringify({ type: 'complete' }));
		repairer.ws.send(JSON.stringify({ type: 'barrier', id: 'after' }));
		await until(() => repairer.controls.some((m) => m.type === 'caught-up'));
		const other = await connect('CAPPED');
		expect(other.controls.at(-1)).toMatchObject({ type: 'ready', complete: true });
	});
});
