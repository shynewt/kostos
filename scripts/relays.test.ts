/* Lifecycle checks for both Node relays (self-hosted serve.js and the dev sync-server.js):
 * a hostile client must never be able to stop the process. */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { openSocket, PROOF, proofProtocol, until } from './test-helpers.js';

const ROOM = 'a'.repeat(64);

const UPGRADE_BASE =
	'Host: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
	'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n';
const UPGRADE_HEADERS = `${UPGRADE_BASE}Sec-WebSocket-Protocol: ${proofProtocol(PROOF)}\r\n\r\n`;
const UPGRADE_WITHOUT_PROOF = `${UPGRADE_BASE}\r\n`;

// an unmasked client frame, which the protocol forbids; ws raises an 'error' on it
const UNMASKED_FRAME = Buffer.from([0x82, 0x01, 0x41]);
const STEP_TIMEOUT_MS = 3000;

type Relay = { child: ChildProcess; stderr: () => string; dataDirectory: string };

async function startRelay(script: string, port: number): Promise<Relay> {
	// admitting a socket writes a claim file, so keep it out of the default directory in the working tree
	const dataDirectory = await mkdtemp(join(tmpdir(), 'kostos-relay-test-'));
	const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
		env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', KOSTOS_DATA_DIR: dataDirectory },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let stderr = '';
	child.stderr!.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
	const relay = { child, stderr: () => stderr, dataDirectory };

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

async function stopRelay(relay: Relay | undefined) {
	relay?.child.kill();
	if (relay) await rm(relay.dataDirectory, { recursive: true, force: true });
}

function sendBadFrame(port: number, path: string, headers = UPGRADE_HEADERS): Promise<Probe> {
	return new Promise((resolve, reject) => {
		let outcome: Probe = 'rejected';
		const socket = connect(port, '127.0.0.1', () => {
			socket.write(`GET ${path} HTTP/1.1\r\n${headers}`);
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
		const ws = new WebSocket(`ws://127.0.0.1:${port}/sync/${ROOM}`, [proofProtocol(PROOF)]);
		const timer = setTimeout(() => {
			ws.terminate();
			reject(new Error('no pong'));
		}, STEP_TIMEOUT_MS);
		ws.on('open', () => ws.send('ping'));
		ws.on('message', (data) => {
			if (data.toString() !== 'pong') return;
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

const relays: { script: string; port: number; probes: Record<string, Probe>; withoutProof: Probe }[] = [
	{
		script: './serve.js',
		port: 18_731,
		// serve.js drops bad room ids, non-sync paths and requests without a proof before upgrading
		probes: { [`/sync/${ROOM}`]: 'upgraded', '/sync/PRT-AAAA-BBBB': 'rejected', '/sync/%ZZ': 'rejected', '/not-sync': 'rejected' },
		withoutProof: 'rejected'
	},
	{
		script: './sync-server.js',
		port: 18_732,
		// the dev relay upgrades everything, then closes sockets with no usable room or proof
		probes: { [`/sync/${ROOM}`]: 'upgraded', '/sync/%ZZ': 'upgraded', '/': 'upgraded' },
		withoutProof: 'upgraded'
	}
];

for (const { script, port, probes, withoutProof } of relays) {
	describe(script, () => {
		let relay: Relay | undefined;
		beforeAll(async () => {
			relay = await startRelay(script, port);
		});
		afterAll(() => stopRelay(relay));

		for (const [path, expected] of Object.entries(probes)) {
			it(`survives a malformed frame on ${path}`, async () => {
				expect(await sendBadFrame(port, path)).toBe(expected);
				expect(await pingPong(port), relay!.stderr()).toBe('pong');
				expect(relay!.child.exitCode, relay!.stderr()).toBeNull();
			});
		}

		it('handles a request without a proof as the relay promises', async () => {
			expect(await sendBadFrame(port, `/sync/${ROOM}`, UPGRADE_WITHOUT_PROOF)).toBe(withoutProof);
			expect(await pingPong(port)).toBe('pong');
		});
		it('tells a client with the wrong proof it was denied, then closes it', async () => {
			const url = `ws://127.0.0.1:${port}/sync/${ROOM}`;
			const owner = await openSocket(url, PROOF);
			await until(() => owner.controls.length > 0, STEP_TIMEOUT_MS);
			const intruder = await openSocket(url, 'Q'.repeat(43));
			expect(await intruder.closed).toBe(1008);
			expect(intruder.controls).toEqual([{ type: 'denied' }]);
			owner.ws.terminate();
		});
	});
}

describe('serve.js http', () => {
	let relay: Relay | undefined;
	const port = 18_733;
	beforeAll(async () => {
		relay = await startRelay('./serve.js', port);
	});
	afterAll(() => stopRelay(relay));

	it('answers a malformed escape with 400 and keeps running', async () => {
		const res = await fetch(`http://127.0.0.1:${port}/%ZZ`);
		expect(res.status).toBe(400);
		expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
	});
});
