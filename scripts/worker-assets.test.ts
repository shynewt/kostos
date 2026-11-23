/* The Worker's static side: real files, the SPA fallback, and requests a static site has no use for. */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let mf: Miniflare;
let directory: string;

// like the real binding, it reads the request body, so a request can only be handed to it once
async function assets(request: Request): Promise<Response> {
	await request.text();
	const { pathname } = new URL(request.url);
	if (pathname === '/') return new Response('landing');
	if (pathname === '/200') return new Response('app shell');
	return new Response('not found', { status: 404 });
}

beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), 'kostos-worker-assets-'));
	const scriptPath = join(directory, 'worker.mjs');
	await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', outfile: scriptPath, external: ['cloudflare:workers'], logLevel: 'silent' });
	mf = new Miniflare({
		modules: true,
		script: await readFile(scriptPath, 'utf8'),
		compatibilityDate: '2025-05-01',
		serviceBindings: { ASSETS: assets },
		durableObjects: { SYNC_ROOM: { className: 'SyncRoom', useSQLite: true } }
	});
	await mf.ready;
}, 30_000);
afterAll(async () => {
	await mf?.dispose();
	await rm(directory, { recursive: true, force: true });
});

describe('static requests', () => {
	it('serves real files and the app shell for unknown routes', async () => {
		expect(await (await mf.dispatchFetch('http://local/')).text()).toBe('landing');
		const route = await mf.dispatchFetch('http://local/p/abc/expenses');
		expect(route.status).toBe(200);
		expect(await route.text()).toBe('app shell');
	});

	it('refuses a request with a body instead of crashing on it', async () => {
		const response = await mf.dispatchFetch('http://local/wp-login.php', { method: 'POST', body: 'log=admin&pwd=admin' });
		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toBe('GET, HEAD');
	});
});
