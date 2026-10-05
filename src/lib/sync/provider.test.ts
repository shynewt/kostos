import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { EncryptedSyncProvider } from './provider';
import { deriveKey, decryptPayload, encryptPayload } from './crypto';
import { frame, parse, MSG_UPDATE } from './protocol';
import { payloadHash } from './relay-protocol.js';

class Socket {
	static OPEN = 1;
	static instances: Socket[] = [];
	readyState = 0;
	binaryType = '';
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	sent: (string | Uint8Array)[] = [];
	constructor() { Socket.instances.push(this); }
	open() { this.readyState = 1; this.onopen?.(); }
	send(data: string | Uint8Array) { this.sent.push(data); }
	close() { this.readyState = 3; this.onclose?.(); }
	control(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
	binary(data: Uint8Array) { this.onmessage?.({ data: data.slice().buffer }); }
}
const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(1))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
let provider: EncryptedSyncProvider;
let doc: Y.Doc;
let events: EventTarget;

beforeEach(() => {
	Socket.instances = [];
	events = new EventTarget();
	vi.stubGlobal('WebSocket', Socket);
	vi.stubGlobal('window', events);
	vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
	vi.stubGlobal('navigator', { onLine: true });
	doc = new Y.Doc();
});
afterEach(() => { provider?.destroy(); doc.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function start() {
	provider = new EncryptedSyncProvider(doc, 'ws://test', 'ROOM', secret);
	await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
	const ws = Socket.instances[0]; ws.open(); return ws;
}
async function ready(ws: Socket, options = {}) {
	ws.control({ type: 'ready', protocol: 3, revision: 0, durable: true, complete: true, ...options });
	await vi.waitFor(() => expect(ws.sent.filter((v) => v instanceof Uint8Array)).toHaveLength(2));
}
async function acknowledge(ws: Socket, revision = 1) {
	const durable = ws.sent.filter((v): v is Uint8Array => v instanceof Uint8Array && v[4] === 1);
	for (const packet of durable) ws.control({ type: 'ack', hash: await payloadHash(packet.slice(5)), revision: revision++ });
	await vi.waitFor(() => expect(ws.sent.some((v) => typeof v === 'string' && v.includes('barrier'))).toBe(true));
	const barrier = JSON.parse(ws.sent.filter((v): v is string => typeof v === 'string').at(-1)!);
	ws.control({ type: 'caught-up', id: barrier.id, revision: revision - 1 });
}

describe('verified encrypted sync', () => {
	it('does not claim freshness on socket open, replay or send without durable acknowledgement', async () => {
		const ws = await start(); expect(provider.status).toBe('syncing');
		await ready(ws); expect(provider.status).toBe('syncing');
		expect(ws.sent.filter((v) => typeof v === 'string')).toEqual([]);
		await acknowledge(ws);
		await vi.waitFor(() => expect(provider.status).toBe('synced'));
		expect(provider.snapshot.lastSyncedAt).not.toBeNull();
	});
	it('uploads saved state without any peer request', async () => {
		doc.getArray('expenses').push(['saved-offline']);
		const ws = await start(); await ready(ws);
		const packet = ws.sent.find((v): v is Uint8Array => v instanceof Uint8Array && v[4] === 1)!;
		const message = parse(await decryptPayload(await deriveKey(secret), packet.slice(5)));
		const receiver = new Y.Doc(); Y.applyUpdate(receiver, message.body);
		expect(receiver.getArray('expenses').toArray()).toEqual(['saved-offline']); receiver.destroy();
	});
	it('waits for asynchronous decryption before processing the replay boundary', async () => {
		const peer = new Y.Doc(); peer.getArray('expenses').push(['remote']);
		const encrypted = await encryptPayload(await deriveKey(secret), frame(MSG_UPDATE, Y.encodeStateAsUpdate(peer)));
		const ws = await start(); ws.binary(encrypted); await ready(ws);
		expect(doc.getArray('expenses').toArray()).toEqual(['remote']); peer.destroy();
	});
	it('never clears a decryption failure by receiving a later valid acknowledgement', async () => {
		const ws = await start(); ws.binary(new Uint8Array(40));
		ws.control({ type: 'ready', protocol: 3, revision: 0, durable: true, complete: true });
		await vi.waitFor(() => expect(provider.snapshot.problem).toBe('decrypt'));
		ws.control({ type: 'ack', hash: 'unrelated', revision: 1 });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(provider.status).toBe('error');
		expect(ws.sent).toEqual([]);
	});
	it('refuses to verify truncated legacy history', async () => {
		const ws = await start(); await ready(ws, { complete: false }); await acknowledge(ws);
		await vi.waitFor(() => expect(provider.snapshot.problem).toBe('history'));
		expect(provider.snapshot.lastSyncedAt).toBeNull();
	});
	it('detects a missing server revision', async () => {
		const ws = await start(); await ready(ws);
		ws.control({ type: 'revision', revision: 5 });
		await vi.waitFor(() => expect(provider.snapshot.problem).toBe('history'));
	});
	it('reconnects immediately on returning to the foreground', async () => {
		const ws = await start(); await ready(ws); await acknowledge(ws);
		await vi.waitFor(() => expect(provider.status).toBe('synced'));
		document.dispatchEvent(new Event('visibilitychange'));
		expect(Socket.instances).toHaveLength(2);
		expect(ws.readyState).toBe(3);
		expect(provider.snapshot.checking).toBe(true);
	});
	it('ignores callbacks and encrypted sends belonging to an obsolete socket', async () => {
		const ws = await start();
		ws.control({ type: 'ready', protocol: 3, revision: 0, durable: true, complete: true });
		provider.retry(); ws.onclose?.(); ws.control({ type: 'revision', revision: 100 });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(provider.status).toBe('connecting');
		expect(ws.sent).toEqual([]);
	});
	it('stops checking and reports offline immediately when the network disappears', async () => {
		await start(); vi.stubGlobal('navigator', { onLine: false });
		events.dispatchEvent(new Event('offline'));
		expect(provider.status).toBe('offline'); expect(provider.snapshot.checking).toBe(false);
	});
	it('times out a connection that never opens', async () => {
		vi.useFakeTimers(); provider = new EncryptedSyncProvider(doc, 'ws://test', 'ROOM', secret);
		await Promise.resolve(); await vi.advanceTimersByTimeAsync(12_001);
		expect(provider.status).toBe('error');
	});
});
