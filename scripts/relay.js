/* Shared Node relay: complete append-only encrypted history, serialized room
 * operations, and acknowledgements after fsync. KOSTOS_DATA_DIR should be on a
 * persistent volume in Docker. There is deliberately no lossy history cap.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unwrapPacket, payloadHash } from '../src/lib/sync/relay-protocol.js';

/** @param {string} directory */
export function createRelay(directory) {
	/** @type {Map<string, ReturnType<typeof makeRoom>>} */
	const rooms = new Map();
	/** @param {string} id */
	function makeRoom(id) {
		const room = {
			/** @type {Set<import('ws').WebSocket>} */ sockets: new Set(),
			/** @type {{hash: string, payload: Buffer}[]} */ history: [],
			/** @type {Map<string, number>} */ hashes: new Map(),
			tail: Promise.resolve(),
			file: resolve(directory, `${createHash('sha256').update(id).digest('hex')}.jsonl`),
			loaded: false
		};
		return room;
	}
	/** @param {import('ws').WebSocket} ws @param {object} message */
	function control(ws, message) {
		try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); }
		catch { ws.terminate(); }
	}
	/** @param {ReturnType<typeof makeRoom>} room */
	async function load(room) {
		if (room.loaded) return;
		await mkdir(directory, { recursive: true });
		let contents = '';
		try { contents = await readFile(room.file, 'utf8'); }
		catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error; }
		// Never acknowledge a room whose disk history is corrupt or incomplete.
		// An interrupted final append is reported rather than silently discarded.
		/** @type {{hash: string, payload: Buffer}[]} */
		const history = [];
		const hashes = new Map();
		for (const line of contents.split('\n').filter(Boolean)) {
			const entry = JSON.parse(line);
			const payload = Buffer.from(entry.data, 'base64');
			if (await payloadHash(payload) !== entry.hash) throw new Error('Corrupt sync history');
			history.push({ hash: entry.hash, payload });
			hashes.set(entry.hash, history.length);
		}
		room.history = history;
		room.hashes = hashes;
		room.loaded = true;
	}
	/** @param {ReturnType<typeof makeRoom>} room @param {import('ws').WebSocket} ws @param {() => Promise<void>} work */
	function enqueue(room, ws, work) {
		room.tail = room.tail.then(async () => { await load(room); await work(); }).catch(() => {
			room.loaded = false;
			control(ws, { type: 'error', reason: 'storage' });
			ws.close(1011, 'Could not persist sync data');
		});
	}
	/** @param {import('ws').WebSocket} ws @param {string} id */
	return function attach(ws, id) {
		let room = rooms.get(id);
		if (!room) { room = makeRoom(id); rooms.set(id, room); }
		const activeRoom = room;
		ws.on('error', () => { activeRoom.sockets.delete(ws); ws.terminate(); });
		ws.on('close', () => activeRoom.sockets.delete(ws));
		enqueue(activeRoom, ws, async () => {
			await load(activeRoom);
			if (ws.readyState !== ws.OPEN) return;
			activeRoom.sockets.add(ws);
			for (const entry of activeRoom.history) ws.send(entry.payload);
			control(ws, { type: 'ready', protocol: 3, revision: activeRoom.history.length, durable: true, complete: true });
		});
		ws.on('message', (data, binary) => {
			if (!binary) {
				const text = data.toString();
				if (text === 'ping') { if (ws.readyState === ws.OPEN) ws.send('pong'); return; }
				let message;
				try { message = JSON.parse(text); } catch { return; }
				if (!message || typeof message !== 'object') return;
				if (message.type === 'barrier' && typeof message.id === 'string' && message.id.length <= 80) {
					enqueue(activeRoom, ws, async () => {
						control(ws, { type: 'caught-up', id: message.id, revision: activeRoom.history.length });
					});
				}
				return;
			}
			enqueue(activeRoom, ws, async () => {
				const packet = data instanceof Buffer ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
				let decoded;
				try { decoded = unwrapPacket(packet); }
				catch { control(ws, { type: 'error', reason: 'size' }); ws.close(1009, 'Invalid message size'); return; }
				const payload = Buffer.from(decoded.payload);
				if (!decoded.durable) {
					for (const peer of activeRoom.sockets) {
						if (peer === ws || peer.readyState !== peer.OPEN) continue;
						try { peer.send(payload); } catch { peer.terminate(); }
					}
					return;
				}
				const hash = await payloadHash(payload);
				const existing = activeRoom.hashes.get(hash);
				if (existing) { control(ws, { type: 'ack', hash, revision: existing }); return; }
				const file = await open(activeRoom.file, 'a');
				try {
					await file.writeFile(`${JSON.stringify({ hash, data: payload.toString('base64') })}\n`);
					await file.sync();
				} finally { await file.close(); }
				activeRoom.history.push({ hash, payload });
				const revision = activeRoom.history.length;
				activeRoom.hashes.set(hash, revision);
				for (const peer of activeRoom.sockets) {
					if (peer === ws || peer.readyState !== peer.OPEN) continue;
					try { peer.send(payload); control(peer, { type: 'revision', revision }); }
					catch { peer.terminate(); }
				}
				control(ws, { type: 'ack', hash, revision });
			});
		});
	};
}
