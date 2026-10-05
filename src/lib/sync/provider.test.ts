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
	it('lets a phone that held the data repair a trimmed server history', async () => {
		doc.getArray('expenses').push(['had-it-all']);
		const ws = await start(); await ready(ws, { complete: false }); await acknowledge(ws);
		await vi.waitFor(() => expect(ws.sent).toContain(JSON.stringify({ type: 'complete' })));
		const barrier = JSON.parse(ws.sent.filter((v): v is string => typeof v === 'string' && v.includes('barrier')).at(-1)!);
		ws.control({ type: 'caught-up', id: barrier.id, revision: 1 });
		await vi.waitFor(() => expect(provider.status).toBe('synced'));
	});
	it('does not let a phone that only received a trimmed history vouch for it', async () => {
		const ws = await start(); await ready(ws, { complete: false }); await acknowledge(ws);
		await vi.waitFor(() => expect(provider.snapshot.problem).toBe('history'));
		expect(ws.sent).not.toContain(JSON.stringify({ type: 'complete' }));
	});
	it('is not stopped forever by changes that refer to data no device still has', async () => {
		const origin = new Y.Doc(); const list = origin.getArray('expenses');
		list.push(['lost on the old server']);
		const lost = Y.encodeStateAsUpdate(origin);
		const before = Y.encodeStateVector(origin);
		list.delete(0, 1);
		Y.applyUpdate(doc, Y.encodeStateAsUpdate(origin, before));
		expect(doc.store.pendingDs ?? doc.store.pendingStructs).toBeTruthy();
		expect(lost.length).toBeGreaterThan(0);
		const ws = await start(); await ready(ws); await acknowledge(ws);
		await vi.waitFor(() => expect(provider.status).toBe('synced'));
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
	it('treats a server it cannot reach as offline, and keeps saying so while retrying', async () => {
		vi.useFakeTimers(); provider = new EncryptedSyncProvider(doc, 'ws://test', 'ROOM', secret);
		await vi.advanceTimersByTimeAsync(6_001);
		expect(provider.snapshot).toMatchObject({ phase: 'offline', checking: false, problem: null });
		const seen: string[] = []; provider.onStatusChange((s) => seen.push(s.phase));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(Socket.instances.length).toBeGreaterThan(2);
		expect(new Set(seen)).toEqual(new Set(['offline']));
	});
	it('says offline when a connection is refused, not paused', async () => {
		provider = new EncryptedSyncProvider(doc, 'ws://test', 'ROOM', secret);
		await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
		Socket.instances[0].onerror?.(); Socket.instances[0].close();
		expect(provider.snapshot).toMatchObject({ phase: 'offline', problem: null });
	});
	it('keeps waiting while a long history is still arriving', async () => {
		vi.useFakeTimers(); provider = new EncryptedSyncProvider(doc, 'ws://test', 'ROOM', secret);
		await vi.advanceTimersByTimeAsync(0);
		const ws = Socket.instances[0]; ws.open();
		const key = await deriveKey(secret);
		const entry = await encryptPayload(key, frame(MSG_UPDATE, Y.encodeStateAsUpdate(new Y.Doc())));
		for (let i = 0; i < 5; i++) { await vi.advanceTimersByTimeAsync(8_000); ws.binary(entry); }
		expect(provider.status).not.toBe('error');
		expect(Socket.instances).toHaveLength(1);
	});
	it('reports a timeout, not an outdated server, when an open connection goes silent', async () => {
		vi.useFakeTimers(); provider = new EncryptedSyncProvider(doc, 'ws://test', 'ROOM', secret);
		await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();
		await vi.advanceTimersByTimeAsync(12_001);
		expect(provider.snapshot.problem).toBe('timeout');
	});
	it('does not re-upload what the server already has', async () => {
		const ws = await start();
		const other = new Y.Doc(); other.getArray('expenses').push(['from the group']);
		const key = await deriveKey(secret);
		ws.binary(await encryptPayload(key, frame(MSG_UPDATE, Y.encodeStateAsUpdate(other))));
		await vi.waitFor(() => expect(doc.getArray('expenses').length).toBe(1));
		const persistence = { state: { pendingChanges: 0, lastSyncedAt: 1 }, changeVersion: 0, flush: async () => {}, confirm: async () => {}, invalidate: () => {} };
		(provider as unknown as { persistence: unknown }).persistence = persistence;
		ws.control({ type: 'ready', protocol: 3, revision: 1, durable: true, complete: true });
		await new Promise((r) => setTimeout(r, 30));
		expect(ws.sent.filter((v) => v instanceof Uint8Array && v[4] === 1)).toHaveLength(0);
	});
	it('uploads only the part the server is missing', async () => {
		const ws = await start();
		const other = new Y.Doc(); other.getArray('expenses').push(['from the group'.repeat(500)]);
		const key = await deriveKey(secret);
		const shared = Y.encodeStateAsUpdate(other);
		ws.binary(await encryptPayload(key, frame(MSG_UPDATE, shared)));
		await vi.waitFor(() => expect(doc.getArray('expenses').length).toBe(1));
		doc.getArray('expenses').push(['only on this phone'.repeat(50)]);
		ws.control({ type: 'ready', protocol: 3, revision: 1, durable: true, complete: true });
		await vi.waitFor(() => expect(ws.sent.filter((v) => v instanceof Uint8Array && v[4] === 1).length).toBeGreaterThan(0));
		const packet = ws.sent.find((v): v is Uint8Array => v instanceof Uint8Array && v[4] === 1)!;
		const body = parse(await decryptPayload(key, packet.slice(5))).body;
		const check = new Y.Doc(); Y.applyUpdate(check, shared); Y.applyUpdate(check, body);
		expect(check.getArray('expenses').toArray()).toEqual(['from the group'.repeat(500), 'only on this phone'.repeat(50)]);
		expect(body.length).toBeLessThan(shared.length / 3);
	});
	it('recovers from a numbering gap by reconnecting quietly instead of pausing', async () => {
		const ws = await start(); await ready(ws);
		ws.control({ type: 'revision', revision: 5 });
		await vi.waitFor(() => expect(Socket.instances).toHaveLength(2));
		expect(provider.status).not.toBe('error');
	});
	it('replaces a bloated history with one snapshot once up to date', async () => {
		const ws = await start();
		const key = await deriveKey(secret);
		const other = new Y.Doc(); const list = other.getArray('expenses');
		for (let i = 0; i < 60; i++) {
			const before = Y.encodeStateVector(other); list.push(['x'.repeat(5000)]);
			ws.binary(await encryptPayload(key, frame(MSG_UPDATE, Y.encodeStateAsUpdate(other, before))));
		}
		await vi.waitFor(() => expect(doc.getArray('expenses').length).toBe(60));
		const bloat = await encryptPayload(key, frame(MSG_UPDATE, Y.encodeStateAsUpdate(other)));
		for (let i = 0; i < 4; i++) ws.binary(bloat);
		(provider as unknown as { persistence: unknown }).persistence = { state: { pendingChanges: 0, lastSyncedAt: 1 }, changeVersion: 0, flush: async () => {}, confirm: async () => {}, invalidate: () => {} };
		ws.control({ type: 'ready', protocol: 3, revision: 64, durable: true, complete: true });
		await vi.waitFor(() => expect(ws.sent.some((v) => typeof v === 'string' && v.includes('barrier'))).toBe(true));
		const barrier = JSON.parse(ws.sent.filter((v): v is string => typeof v === 'string').at(-1)!);
		ws.control({ type: 'caught-up', id: barrier.id, revision: 64 });
		await vi.waitFor(() => expect(provider.status).toBe('synced'));
		await vi.waitFor(() => expect(ws.sent.some((v) => v instanceof Uint8Array && v[4] === 2)).toBe(true));
		const compact = ws.sent.find((v): v is Uint8Array => v instanceof Uint8Array && v[4] === 2)!;
		expect(new DataView(compact.buffer, compact.byteOffset).getUint32(5)).toBe(64);
		const snapshot = new Y.Doc(); Y.applyUpdate(snapshot, parse(await decryptPayload(key, compact.slice(9))).body);
		expect(snapshot.getArray('expenses').length).toBe(60);
	});
});
