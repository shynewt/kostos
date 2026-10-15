import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const SERVE = fileURLToPath(new URL('./serve.js', import.meta.url));
let child: ChildProcess | undefined;
let directory: string | undefined;

async function startServer(port: number) {
	directory = await mkdtemp(join(tmpdir(), 'kostos-serve-'));
	child = spawn(process.execPath, [SERVE], {
		env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', KOSTOS_DATA_DIR: directory },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	await new Promise<void>((resolve, reject) => {
		child!.stdout!.on('data', (chunk: Buffer) => { if (/listening/i.test(chunk.toString())) resolve(); });
		child!.once('exit', (code) => reject(new Error(`serve.js exited with ${code}`)));
	});
}

afterEach(async () => {
	child?.kill('SIGKILL');
	child = undefined;
	if (directory) await rm(directory, { recursive: true, force: true });
});

describe('serve.js shutdown', () => {
	it('exits cleanly and quickly on SIGTERM, telling connected clients to reconnect', async () => {
		await startServer(18_762);
		const ws = new WebSocket('ws://127.0.0.1:18762/sync/ROOM');
		await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
		const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
		const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
			child!.once('exit', (code, signal) => resolve({ code, signal }))
		);

		const started = Date.now();
		child!.kill('SIGTERM');

		expect(await exited).toEqual({ code: 0, signal: null });
		expect(Date.now() - started).toBeLessThan(5_000);
		expect(await closed).toBe(1001);
	}, 15_000);
});
