import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { frame, parse, MSG_UPDATE } from '../sync/protocol';
import { REMOTE_ORIGIN } from '../sync/persistence';
import { decryptPayload, deriveKey, deriveRoomAccess, encryptPayload } from './crypto';
import { MIRROR_ORIGIN, MirrorProvider } from './provider';
import { payloadHash } from './wire';

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
	constructor(public url = '', public protocols: string | string[] = []) { Socket.instances.push(this); }
	open() { this.readyState = 1; this.onopen?.(); }
	send(data: string | Uint8Array) { this.sent.push(data); }
	close() { this.readyState = 3; this.onclose?.(); }
	control(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
	binary(data: Uint8Array) { this.onmessage?.({ data: data.slice().buffer }); }
}

const secret = Buffer.alloc(16, 1).toString('base64url');
let provider: MirrorProvider;
let doc: Y.Doc;

beforeEach(() => {
	Socket.instances = [];
	vi.stubGlobal('WebSocket', Socket);
	vi.stubGlobal('window', new EventTarget());
	vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
	vi.stubGlobal('navigator', { onLine: true });
	doc = new Y.Doc();
});
afterEach(() => { provider?.destroy(); doc.destroy(); vi.unstubAllGlobals(); });

async function connect(count = 1): Promise<Socket> {
	await vi.waitFor(() => expect(Socket.instances).toHaveLength(count));
	const ws = Socket.instances[count - 1];
	ws.open();
	return ws;
}
const durablePackets = (ws: Socket) => ws.sent.filter((v): v is Uint8Array => v instanceof Uint8Array && v[4] === 1);
async function ready(ws: Socket) {
	ws.control({ type: 'ready', protocol: 3, revision: 0, durable: true, complete: true });
	await vi.waitFor(() => expect(ws.sent.some((v) => v instanceof Uint8Array && v[4] === 0)).toBe(true));
}
async function confirm(ws: Socket) {
	let revision = 1;
	for (const packet of durablePackets(ws)) ws.control({ type: 'ack', hash: await payloadHash(packet.slice(5)), revision: revision++ });
	await vi.waitFor(() => expect(ws.sent.some((v) => typeof v === 'string' && v.includes('barrier'))).toBe(true));
	const barrier = JSON.parse(ws.sent.filter((v): v is string => typeof v === 'string').at(-1)!);
	ws.control({ type: 'caught-up', id: barrier.id, revision: revision - 1 });
	await vi.waitFor(() => expect(provider.snapshot.phase).toBe('synced'));
}
async function uploadedDoc(ws: Socket): Promise<Y.Doc> {
	const received = new Y.Doc();
	const key = await deriveKey(secret);
	for (const packet of durablePackets(ws)) Y.applyUpdate(received, parse(await decryptPayload(key, packet.slice(5))).body);
	return received;
}

describe('the group copy on the new site', () => {
	it('connects to the v3 room with the v3 proof', async () => {
		provider = new MirrorProvider(doc, 'ws://new', secret, () => false);
		const ws = await connect();
		const access = await deriveRoomAccess(secret);
		expect(ws.url).toBe(`ws://new/${access.relayRoomId}`);
		expect(ws.protocols).toEqual([`kostos1.${access.proof}`]);
	});

	it('uploads the whole stored group and says synced only once the server confirmed it', async () => {
		doc.getArray('expenses').push(['dinner', 'hotel']);
		provider = new MirrorProvider(doc, 'ws://new', secret, () => false);
		const ws = await connect();
		await ready(ws);
		expect(provider.snapshot.phase).toBe('syncing');
		expect((await uploadedDoc(ws)).getArray('expenses').toArray()).toEqual(['dinner', 'hotel']);
		await confirm(ws);
	});

	it('passes on edits that arrive from the old server', async () => {
		provider = new MirrorProvider(doc, 'ws://new', secret, () => false);
		const ws = await connect();
		await ready(ws);
		await confirm(ws);
		const friend = new Y.Doc();
		friend.getArray('expenses').push(['taxi']);
		Y.applyUpdate(doc, Y.encodeStateAsUpdate(friend), REMOTE_ORIGIN);
		await vi.waitFor(async () => expect((await uploadedDoc(ws)).getArray('expenses').toArray()).toContain('taxi'));
	});

	it('applies edits from the new site under its own origin and does not send them back', async () => {
		const origins: unknown[] = [];
		doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
		provider = new MirrorProvider(doc, 'ws://new', secret, () => false);
		const ws = await connect();
		await ready(ws);
		await confirm(ws);
		const sentBefore = durablePackets(ws).length;
		const newSite = new Y.Doc();
		newSite.getArray('expenses').push(['museum']);
		ws.binary(await encryptPayload(await deriveKey(secret), frame(MSG_UPDATE, Y.encodeStateAsUpdate(newSite))));
		await vi.waitFor(() => expect(doc.getArray('expenses').toArray()).toEqual(['museum']));
		expect(origins).toEqual([MIRROR_ORIGIN]);
		expect(durablePackets(ws)).toHaveLength(sentBefore);
	});

	it('does not re-upload on a reconnect once the server has confirmed everything', async () => {
		doc.getArray('expenses').push(['dinner']);
		provider = new MirrorProvider(doc, 'ws://new', secret, () => false);
		const first = await connect();
		await ready(first);
		await confirm(first);
		const confirmed = Y.encodeStateAsUpdate(doc);
		provider.retry();
		const second = await connect(2);
		second.binary(await encryptPayload(await deriveKey(secret), frame(MSG_UPDATE, confirmed)));
		await ready(second);
		expect(durablePackets(second)).toEqual([]);
	});

	it('uploads nothing on a new page load when the server already has the whole group', async () => {
		doc.getArray('expenses').push(['dinner']);
		doc.getArray('expenses').delete(0);
		doc.getArray('expenses').push(['hotel']);
		provider = new MirrorProvider(doc, 'ws://new', secret, () => false);
		const ws = await connect();
		ws.binary(await encryptPayload(await deriveKey(secret), frame(MSG_UPDATE, Y.encodeStateAsUpdate(doc))));
		await ready(ws);
		expect(durablePackets(ws)).toEqual([]);
	});

	it('never vouches for a trimmed server history from a phone that holds only part of the group', async () => {
		doc.getArray('expenses').push(['dinner']);
		provider = new MirrorProvider(doc, 'ws://new', secret, () => true);
		const ws = await connect();
		ws.control({ type: 'ready', protocol: 3, revision: 0, durable: true, complete: false });
		await vi.waitFor(() => expect(durablePackets(ws)).toHaveLength(1));
		ws.control({ type: 'ack', hash: await payloadHash(durablePackets(ws)[0].slice(5)), revision: 1 });
		await vi.waitFor(() => expect(ws.sent.some((v) => typeof v === 'string' && v.includes('barrier'))).toBe(true));
		const barrier = JSON.parse(ws.sent.filter((v): v is string => typeof v === 'string').at(-1)!);
		ws.control({ type: 'caught-up', id: barrier.id, revision: 1 });
		await vi.waitFor(() => expect(provider.snapshot).toEqual({ phase: 'error', problem: 'history' }));
		expect(ws.sent.some((v) => typeof v === 'string' && v.includes('"complete"'))).toBe(false);
	});
});
