/* Lifecycle checks for both Node relays (self-hosted serve.js and the dev sync-server.js):
 * a hostile client must never be able to stop the process. */

import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const UPGRADE_HEADERS =
	'Host: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
	'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n';

// an unmasked client frame, which the protocol forbids; ws raises an 'error' on it
const UNMASKED_FRAME = Buffer.from([0x82, 0x01, 0x41]);
const STEP_TIMEOUT_MS = 3000;

type Relay = { child: ChildProcess; stderr: () => string };

function startRelay(script: string, port: number): Promise<Relay> {
	const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
		env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let stderr = '';
	child.stderr!.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
	const relay = { child, stderr: () => stderr };

	return new Promise((resolve, reject) => {
		const fail = (reason: string) => {
			clearTimeout(timer);
			child.kill();
			reject(new Error(`${script} ${reason}\n${stderr}`));
		};
		const timer = setTimeout(() => fail('never reported listening'), STEP_TIMEOUT_MS);
		child.once('exit', (code) => fail(`exited during startup with ${code}`));
		child.stdout!.on('data', (chunk: Buffer) => {
			if (!/listening/i.test(chunk.toString())) return;
			clearTimeout(timer);
			child.removeAllListeners('exit');
			resolve(relay);
		});
	});
}

/** 'upgraded': the relay answered 101 and the bad frame went out on the WebSocket.
 *  'rejected': the relay closed the connection without upgrading, on purpose. */
type Probe = 'upgraded' | 'rejected';

function sendBadFrame(port: number, path: string): Promise<Probe> {
	return new Promise((resolve, reject) => {
		let outcome: Probe = 'rejected';
		const socket = connect(port, '127.0.0.1', () => {
			socket.write(`GET ${path} HTTP/1.1\r\n${UPGRADE_HEADERS}`);
		});
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`no response for ${path}`));
		}, STEP_TIMEOUT_MS);
		socket.once('data', (data: Buffer) => {
			if (!data.toString().startsWith('HTTP/1.1 101')) return;
			outcome = 'upgraded';
			socket.write(UNMASKED_FRAME);
		});
		socket.on('error', (err: NodeJS.ErrnoException) => {
			// the relay resetting the socket is the expected reaction to the bad frame
			if (err.code === 'ECONNRESET') return;
			clearTimeout(timer);
			reject(err);
		});
		socket.on('close', () => {
			clearTimeout(timer);
			resolve(outcome);
		});
	});
}

function pingPong(port: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}/sync/PRT-AAAA-BBBB`);
		const timer = setTimeout(() => {
			ws.terminate();
			reject(new Error('no pong'));
		}, STEP_TIMEOUT_MS);
		ws.on('open', () => ws.send('ping'));
		ws.on('message', (data) => {
			clearTimeout(timer);
			resolve(data.toString());
			ws.close();
		});
		ws.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

const relays: { script: string; port: number; probes: Record<string, Probe> }[] = [
	{
		script: './serve.js',
		port: 18_731,
		// serve.js drops bad room ids and non-sync paths before upgrading
		probes: { '/sync/PRT-AAAA-BBBB': 'upgraded', '/sync/%ZZ': 'rejected', '/not-sync': 'rejected' }
	},
	{
		script: './sync-server.js',
		port: 18_732,
		// the dev relay upgrades everything, then closes sockets with no usable room
		probes: { '/sync/PRT-AAAA-BBBB': 'upgraded', '/sync/%ZZ': 'upgraded', '/': 'upgraded' }
	}
];

for (const { script, port, probes } of relays) {
	describe(script, () => {
		let relay: Relay | undefined;
		beforeAll(async () => {
			relay = await startRelay(script, port);
		});
		afterAll(() => {
			relay?.child.kill();
		});

		for (const [path, expected] of Object.entries(probes)) {
			it(`survives a malformed frame on ${path}`, async () => {
				expect(await sendBadFrame(port, path)).toBe(expected);
				await new Promise((resolve) => setTimeout(resolve, 100));
				expect(relay!.child.exitCode, relay!.stderr()).toBeNull();
				expect(await pingPong(port)).toBe('pong');
			});
		}
	});
}

describe('serve.js http', () => {
	let relay: Relay | undefined;
	const port = 18_733;
	beforeAll(async () => {
		relay = await startRelay('./serve.js', port);
	});
	afterAll(() => {
		relay?.child.kill();
	});

	it('answers a malformed escape with 400 and keeps running', async () => {
		const res = await fetch(`http://127.0.0.1:${port}/%ZZ`);
		expect(res.status).toBe(400);
		expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
	});
});
