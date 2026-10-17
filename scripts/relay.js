/* Shared Node relay: complete append-only encrypted history, serialized room
 * operations, and acknowledgements after fsync. KOSTOS_DATA_DIR should be on a
 * persistent volume in Docker. Nothing is ever trimmed. MAX_ROOM_BYTES caps live
 * history: the payload bytes a new client replays, not the archive of entries a
 * compaction replaced; MAX_ROOM_ENTRIES caps how many there are. This relay
 * cannot compact, so both caps are permanent. The
 * first proof to connect claims a room, and the claim lives next to its log in
 * <room hash>.auth.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, truncate, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
	MAX_BARRIER_ID_LENGTH, MAX_ROOM_BYTES, MAX_ROOM_ENTRIES, PROTOCOL_VERSION, SIZE_CLOSE_CODE, SIZE_ERROR_MESSAGE,
	unwrapPacket, payloadHash
} from '../src/lib/sync/relay-protocol.js';
import {
	DENIED_CLOSE_CODE, DENIED_MESSAGE, INTERNAL_ERROR_CLOSE_CODE, ROOM_FULL_CLOSE_REASON, ROOM_FULL_MESSAGE, STORAGE_ERROR_MESSAGE,
	hashesEqual, isProofHash, proofHash
} from '../src/lib/sync/room-access.js';

/** null only when nobody has claimed the room; a damaged file throws.
 *  @param {string} file @returns {Promise<string | null>} */
async function readClaim(file) {
	let contents;
	try { contents = await readFile(file, 'utf8'); }
	catch (error) {
		if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
		throw error;
	}
	if (!isProofHash(contents)) throw new Error(`Damaged room claim: ${file}`);
	return contents;
}

// fsync on a directory is refused on Windows and on some network or Docker Desktop mounts
const DIRECTORY_SYNC_UNSUPPORTED = new Set(['EPERM', 'EINVAL', 'EISDIR', 'ENOTSUP', 'ENOSYS']);

/** @param {string} directory */
async function syncDirectory(directory) {
	try {
		const handle = await open(directory, 'r');
		try { await handle.sync(); } finally { await handle.close(); }
	} catch (error) {
		if (!DIRECTORY_SYNC_UNSUPPORTED.has(/** @type {NodeJS.ErrnoException} */ (error).code ?? '')) throw error;
	}
}

/** Writes the claim under a temporary name, then renames it into place, so a crash can't leave a
 *  half-written real file. The directory is synced afterwards so the rename itself survives power loss, where the platform allows it.
 *  Callers are serialized per room, so no second claim races this one.
 *  @param {string} file @param {string} hash @returns {Promise<string>} the hash that owns the room */
async function claimRoom(file, hash) {
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		const handle = await open(temporary, 'wx');
		try { await handle.writeFile(hash); await handle.sync(); } finally { await handle.close(); }
		await rename(temporary, file);
		await syncDirectory(dirname(file));
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
	return hash;
}

/** @param {string} directory */
export function createRelay(directory) {
	/** @type {Map<string, ReturnType<typeof makeRoom>>} */
	const rooms = new Map();
	/** @param {string} id */
	function makeRoom(id) {
		const name = createHash('sha256').update(id).digest('hex');
		const stem = resolve(directory, name);
		const room = {
			id,
			label: name.slice(0, 8),
			/** @type {Set<import('ws').WebSocket>} */ sockets: new Set(),
			/** @type {{hash: string, payload: Buffer}[]} */ history: [],
			/** @type {Map<string, number>} */ hashes: new Map(),
			tail: Promise.resolve(),
			pending: 0,
			file: `${stem}.jsonl`,
			authFile: `${stem}.auth`,
			/** @type {string | null} */ authHash: null,
			bytes: 0,
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
		/** @type {Buffer} */
		let contents = Buffer.alloc(0);
		try { contents = await readFile(room.file); }
		catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error; }
		// Acknowledgements follow the fsync, so an unterminated final line was never acknowledged
		// and is dropped. Corruption anywhere else must stop the room rather than lose history.
		const terminatedLength = contents.lastIndexOf('\n') + 1;
		/** @type {{hash: string, payload: Buffer}[]} */
		const history = [];
		const hashes = new Map();
		for (const line of contents.subarray(0, terminatedLength).toString('utf8').split('\n').filter(Boolean)) {
			const entry = JSON.parse(line);
			const payload = Buffer.from(entry.data, 'base64');
			if (await payloadHash(payload) !== entry.hash) throw new Error('Corrupt sync history');
			history.push({ hash: entry.hash, payload });
			hashes.set(entry.hash, history.length);
		}
		const authHash = await readClaim(room.authFile);
		if (terminatedLength < contents.length) await truncate(room.file, terminatedLength);
		room.history = history;
		room.hashes = hashes;
		room.authHash = authHash;
		room.bytes = history.reduce((total, entry) => total + entry.payload.length, 0);
		room.loaded = true;
	}
	/** Unauthenticated clients can mint rooms freely, so an idle one must not stay in memory;
	 *  its history reloads from disk on the next connection.
	 *  @param {ReturnType<typeof makeRoom>} room */
	function evictIfIdle(room) {
		if (room.sockets.size === 0 && room.pending === 0 && rooms.get(room.id) === room) rooms.delete(room.id);
	}
	/** @param {ReturnType<typeof makeRoom>} room @param {import('ws').WebSocket} ws @param {() => Promise<void>} work */
	function enqueue(room, ws, work) {
		room.pending++;
		room.tail = room.tail.then(async () => { await load(room); await work(); }).catch((error) => {
			console.error(`[kostos] room ${room.label} storage failure: ${error.code ?? error.message}`);
			room.loaded = false;
			control(ws, STORAGE_ERROR_MESSAGE);
			ws.close(INTERNAL_ERROR_CLOSE_CODE, 'Could not persist sync data');
		}).finally(() => { room.pending--; evictIfIdle(room); });
	}
	/** The first proof to connect claims the room; every later connection must match it.
	 *  @param {ReturnType<typeof makeRoom>} room @param {string} proof */
	async function authorize(room, proof) {
		const hash = await proofHash(proof);
		room.authHash ??= await claimRoom(room.authFile, hash);
		return hashesEqual(room.authHash, hash);
	}
	/** @param {import('ws').WebSocket} ws @param {string} id @param {string} proof */
	function attach(ws, id, proof) {
		let room = rooms.get(id);
		if (!room) { room = makeRoom(id); rooms.set(id, room); }
		const activeRoom = room;
		// Set once the proof is accepted and kept after the socket closes, so a write sent just
		// before closing is still stored. Socket-set membership can't tell those cases apart.
		let admitted = false;
		const release = () => { activeRoom.sockets.delete(ws); evictIfIdle(activeRoom); };
		ws.on('error', () => { release(); ws.terminate(); });
		ws.on('close', release);
		enqueue(activeRoom, ws, async () => {
			if (!(await authorize(activeRoom, proof))) {
				control(ws, DENIED_MESSAGE);
				ws.close(DENIED_CLOSE_CODE, 'Unauthorized');
				return;
			}
			admitted = true;
			if (ws.readyState !== ws.OPEN) return;
			activeRoom.sockets.add(ws);
			for (const entry of activeRoom.history) ws.send(entry.payload);
			control(ws, { type: 'ready', protocol: PROTOCOL_VERSION, revision: activeRoom.history.length, durable: true, complete: true });
		});
		ws.on('message', (data, binary) => {
			if (!binary) {
				const text = data.toString();
				if (text === 'ping') { if (ws.readyState === ws.OPEN) ws.send('pong'); return; }
				let message;
				try { message = JSON.parse(text); } catch { return; }
				if (!message || typeof message !== 'object') return;
				if (message.type === 'barrier' && typeof message.id === 'string' && message.id.length <= MAX_BARRIER_ID_LENGTH) {
					enqueue(activeRoom, ws, async () => {
						if (!admitted) return;
						control(ws, { type: 'caught-up', id: message.id, revision: activeRoom.history.length });
					});
				}
				return;
			}
			enqueue(activeRoom, ws, async () => {
				if (!admitted) return;
				const packet = data instanceof Buffer ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
				let decoded;
				try { decoded = unwrapPacket(packet); }
				catch { control(ws, SIZE_ERROR_MESSAGE); ws.close(SIZE_CLOSE_CODE, 'Invalid message size'); return; }
				// The disk log numbers revisions by position, so it can't splice in a snapshot. Ignore it.
				if (decoded.compact !== undefined) return;
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
				if (activeRoom.history.length >= MAX_ROOM_ENTRIES || activeRoom.bytes + payload.length > MAX_ROOM_BYTES) {
					control(ws, ROOM_FULL_MESSAGE);
					ws.close(INTERNAL_ERROR_CLOSE_CODE, ROOM_FULL_CLOSE_REASON);
					return;
				}
				const file = await open(activeRoom.file, 'a');
				try {
					const { size } = await file.stat();
					try {
						await file.writeFile(`${JSON.stringify({ hash, data: payload.toString('base64') })}\n`);
						await file.sync();
					} catch (error) {
						// a partial line would swallow the next append
						await file.truncate(size).catch(() => {});
						throw error;
					}
				} finally { await file.close(); }
				activeRoom.history.push({ hash, payload });
				activeRoom.bytes += payload.length;
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
	}
	// resolves once every room has finished the writes it already accepted
	attach.drain = () => Promise.all([...rooms.values()].map((room) => room.tail));
	return attach;
}
