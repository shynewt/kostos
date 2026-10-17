/// <reference types="@cloudflare/workers-types" />
/* One encrypted append-only log per group. The server never sees document
 * plaintext. SQL rows avoid a growing single KV value. Live rows are only ever
 * replaced by a compaction, which moves them to an archive capped at
 * MAX_ARCHIVE_BYTES (the oldest archived rows go first). MAX_ROOM_BYTES caps live
 * history, the payload bytes a new client replays, so compacting frees room;
 * MAX_ROOM_ENTRIES caps how many live entries there are.
 * Acknowledgements are sent only after a transactional write; replay and
 * barriers are serialized with writes, including across WebSocket hibernation.
 */
import { DurableObject } from 'cloudflare:workers';
import {
	MAX_ARCHIVE_BYTES, MAX_BARRIER_ID_LENGTH, MAX_ROOM_BYTES, MAX_ROOM_ENTRIES, PROTOCOL_VERSION, unwrapPacket, payloadHash
} from '../sync/relay-protocol.js';
import {
	DENIED_CLOSE_CODE, DENIED_CLOSE_REASON, DENIED_MESSAGE, INTERNAL_ERROR_CLOSE_CODE, ROOM_FULL_CLOSE_REASON, ROOM_FULL_MESSAGE,
	SIZE_CLOSE_CODE, SIZE_CLOSE_REASON, SIZE_ERROR_MESSAGE, STORAGE_CLOSE_REASON, STORAGE_ERROR_MESSAGE,
	hashesEqual, parseProofProtocol, proofHash
} from '../sync/room-access.js';

type Entry = { payload: ArrayBuffer };

/** The old KV history held at most this many entries, so a full one may have lost older ones. */
const LEGACY_HISTORY_LIMIT = 1000;

/** Running payload totals in sync_meta: summing rows bills a read per row, so writes adjust these instead. */
const LIVE_BYTES = 'live_bytes';
const ARCHIVE_BYTES = 'archive_bytes';

export class SyncRoom extends DurableObject {
	private tail: Promise<unknown> = Promise.resolve();
	private initialized: Promise<void>;

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env as never);
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
		this.initialized = ctx.blockConcurrencyWhile(async () => {
			ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY, hash TEXT UNIQUE NOT NULL, payload BLOB NOT NULL)');
			ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)');
			ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_auth (id INTEGER PRIMARY KEY CHECK (id = 1), proof_hash TEXT NOT NULL)');
			// Entries replaced by a snapshot. Never replayed, kept so a bad snapshot is recoverable.
			ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS archive (id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, hash TEXT NOT NULL, payload BLOB NOT NULL, archived_at INTEGER NOT NULL)');
			await this.migrateLegacyHistory();
			this.initByteCounters();
		});
	}

	private async migrateLegacyHistory(): Promise<void> {
		const { storage } = this.ctx;
		if (storage.sql.exec("SELECT value FROM sync_meta WHERE key = 'migrated'").toArray().length) return;
		// Keep the legacy KV entry untouched for recovery. A full capped log
		// cannot prove it includes all older data, so do not claim freshness.
		const old = await storage.get<ArrayBuffer[]>('history') ?? [];
		storage.transactionSync(() => {
			for (let i = 0; i < old.length; i++) {
				storage.sql.exec('INSERT INTO messages (hash, payload) VALUES (?, ?)', `legacy:${i}`, old[i]);
			}
			storage.sql.exec("INSERT INTO sync_meta (key, value) VALUES ('complete', ?), ('migrated', 1)", old.length < LEGACY_HISTORY_LIMIT ? 1 : 0);
		});
	}

	/** Rooms from before the counters existed get them from one scan; every later start trusts what is stored. */
	private initByteCounters(): void {
		const { sql } = this.ctx.storage;
		if (sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM sync_meta WHERE key IN (?, ?)', LIVE_BYTES, ARCHIVE_BYTES).one().n === 2) return;
		this.ctx.storage.transactionSync(() => {
			sql.exec('INSERT OR REPLACE INTO sync_meta (key, value) SELECT ?, COALESCE(SUM(length(payload)), 0) FROM messages', LIVE_BYTES);
			sql.exec('INSERT OR REPLACE INTO sync_meta (key, value) SELECT ?, COALESCE(SUM(length(payload)), 0) FROM archive', ARCHIVE_BYTES);
		});
	}

	private bytes(key: string): number {
		return this.ctx.storage.sql.exec<{ value: number }>('SELECT value FROM sync_meta WHERE key = ?', key).one().value;
	}
	private addBytes(key: string, delta: number): void {
		this.ctx.storage.sql.exec('UPDATE sync_meta SET value = value + ? WHERE key = ?', delta, key);
	}

	private serialized<T>(work: () => Promise<T>): Promise<T> {
		const result = this.tail.then(work);
		this.tail = result.catch(() => {});
		return result;
	}
	private revision(): number {
		return this.ctx.storage.sql.exec<{ revision: number }>('SELECT COALESCE(MAX(seq), 0) AS revision FROM messages').one().revision;
	}
	private control(ws: WebSocket, message: object): void { ws.send(JSON.stringify(message)); }
	// same label as the Node relay: a short prefix of the already-hashed room name, never a proof
	private logFailure(error: unknown): void {
		console.error(`[kostos] room ${this.ctx.id.toString().slice(0, 8)} storage failure: ${error instanceof Error ? error.message : error}`);
	}

	/** Whether live history (the rows a new client replays, not the archive) would pass MAX_ROOM_BYTES after growing by `deltaBytes`. */
	private exceedsCap(deltaBytes: number): boolean {
		return this.bytes(LIVE_BYTES) + deltaBytes > MAX_ROOM_BYTES;
	}

	/** Sequence numbers never shrink, so a revision under the limit proves the live count is too; the exact count only runs past it. */
	private atEntryLimit(): boolean {
		if (this.revision() < MAX_ROOM_ENTRIES) return false;
		return this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM messages').one().n >= MAX_ROOM_ENTRIES;
	}

	/** The first proof to connect claims the room (the primary key makes a second claim impossible);
	 *  every later connection must present the same one. Synchronous, so it needs no await inside serialized(). */
	private admit(hash: string): boolean {
		const sql = this.ctx.storage.sql;
		sql.exec('INSERT OR IGNORE INTO room_auth (id, proof_hash) VALUES (1, ?)', hash);
		return hashesEqual(sql.exec<{ proof_hash: string }>('SELECT proof_hash FROM room_auth WHERE id = 1').one().proof_hash, hash);
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
		const offered = parseProofProtocol(request.headers.get('Sec-WebSocket-Protocol'));
		if (!offered) return new Response('Unauthorized', { status: 401 });
		const hash = await proofHash(offered.proof);
		await this.initialized;
		return this.serialized(async () => {
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);
			const headers = { 'Sec-WebSocket-Protocol': offered.protocol };
			if (!this.admit(hash)) {
				// not hibernatable on purpose: this socket never joins the room, so no handler ever sees its messages
				server.accept();
				this.control(server, DENIED_MESSAGE);
				server.close(DENIED_CLOSE_CODE, DENIED_CLOSE_REASON);
				return new Response(null, { status: 101, webSocket: client, headers });
			}
			this.ctx.acceptWebSocket(server);
			try {
				for (const entry of this.ctx.storage.sql.exec<Entry>('SELECT payload FROM messages ORDER BY seq')) server.send(entry.payload);
				const complete = this.ctx.storage.sql.exec<{ value: number }>("SELECT value FROM sync_meta WHERE key = 'complete'").one().value === 1;
				this.control(server, { type: 'ready', protocol: PROTOCOL_VERSION, revision: this.revision(), durable: true, complete });
			} catch (error) {
				this.logFailure(error);
				server.close(INTERNAL_ERROR_CLOSE_CODE, 'Could not replay sync history');
			}
			return new Response(null, { status: 101, webSocket: client, headers });
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		await this.initialized;
		await this.serialized(async () => {
			try {
				if (typeof message === 'string') this.handleControl(ws, message);
				else await this.handleWrite(ws, message);
			} catch (error) {
				this.logFailure(error);
				try { this.control(ws, STORAGE_ERROR_MESSAGE); ws.close(INTERNAL_ERROR_CLOSE_CODE, STORAGE_CLOSE_REASON); } catch { /* Closed peer. */ }
			}
		});
	}

	private handleControl(ws: WebSocket, text: string): void {
		let message;
		try { message = JSON.parse(text); } catch { return; }
		if (!message || typeof message !== 'object') return;
		if (message.type === 'complete') {
			// A device that holds the data vouches for a history the old server trimmed.
			this.ctx.storage.sql.exec("INSERT INTO sync_meta (key, value) VALUES ('complete', 1) ON CONFLICT(key) DO UPDATE SET value = 1");
		} else if (message.type === 'barrier' && typeof message.id === 'string' && message.id.length <= MAX_BARRIER_ID_LENGTH) {
			this.control(ws, { type: 'caught-up', id: message.id, revision: this.revision() });
		}
	}

	private async handleWrite(ws: WebSocket, packet: ArrayBuffer): Promise<void> {
		let decoded;
		try { decoded = unwrapPacket(new Uint8Array(packet)); }
		catch { this.control(ws, SIZE_ERROR_MESSAGE); ws.close(SIZE_CLOSE_CODE, SIZE_CLOSE_REASON); return; }
		const { payload, durable, compact } = decoded;
		if (compact !== undefined) { this.compact(ws, compact, payload); return; }
		if (!durable) { this.broadcast(ws, payload); return; }
		const hash = await payloadHash(payload);
		let revision = this.ctx.storage.sql.exec<{ seq: number }>('SELECT seq FROM messages WHERE hash = ?', hash).toArray()[0]?.seq;
		if (revision === undefined) {
			if (this.atEntryLimit() || this.exceedsCap(payload.byteLength)) {
				this.control(ws, ROOM_FULL_MESSAGE);
				ws.close(INTERNAL_ERROR_CLOSE_CODE, ROOM_FULL_CLOSE_REASON);
				return;
			}
			revision = this.ctx.storage.transactionSync(() => {
				this.ctx.storage.sql.exec('INSERT INTO messages (hash, payload) VALUES (?, ?)', hash, payload);
				this.addBytes(LIVE_BYTES, payload.byteLength);
				return this.revision();
			});
			this.broadcast(ws, payload, revision);
		}
		this.control(ws, { type: 'ack', hash, revision });
	}

	/** The archive is recovery-only and never replayed, so its oldest rows make room for new ones. A
	 *  compaction can archive at most MAX_ROOM_BYTES (the live cap), which MAX_ARCHIVE_BYTES never undercuts. */
	private trimArchive(incomingBytes: number): void {
		const toFree = this.bytes(ARCHIVE_BYTES) + incomingBytes - MAX_ARCHIVE_BYTES;
		if (toFree <= 0) return;
		let lastDropped = 0;
		let dropped = 0;
		for (const row of this.ctx.storage.sql.exec<{ id: number; bytes: number }>('SELECT id, length(payload) AS bytes FROM archive ORDER BY id')) {
			lastDropped = row.id;
			dropped += row.bytes;
			if (dropped >= toFree) break;
		}
		this.ctx.storage.sql.exec('DELETE FROM archive WHERE id <= ?', lastDropped);
		this.addBytes(ARCHIVE_BYTES, -dropped);
	}

	/** Replace entries up to `through` with one snapshot at the same seq, so revision numbers and
	 *  everything after `through` stay as they are. Late, redundant and over-cap requests are ignored. */
	private compact(ws: WebSocket, through: number, payload: Uint8Array): void {
		if (through < 1 || through > this.revision()) return;
		const { n: covered, bytes: coveredBytes } = this.ctx.storage.sql
			.exec<{ n: number; bytes: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(length(payload)), 0) AS bytes FROM messages WHERE seq <= ?', through).one();
		if (covered < 2 || this.exceedsCap(payload.byteLength - coveredBytes)) return;
		const hash = `snapshot:${through}:${Date.now()}`;
		this.ctx.storage.transactionSync(() => {
			this.trimArchive(coveredBytes);
			this.ctx.storage.sql.exec('INSERT INTO archive (seq, hash, payload, archived_at) SELECT seq, hash, payload, ? FROM messages WHERE seq <= ? ORDER BY seq', Date.now(), through);
			this.ctx.storage.sql.exec('DELETE FROM messages WHERE seq <= ?', through);
			this.ctx.storage.sql.exec('INSERT INTO messages (seq, hash, payload) VALUES (?, ?, ?)', through, hash, payload);
			this.addBytes(ARCHIVE_BYTES, coveredBytes);
			this.addBytes(LIVE_BYTES, payload.byteLength - coveredBytes);
		});
		this.control(ws, { type: 'compacted', revision: through });
	}

	private broadcast(sender: WebSocket, payload: Uint8Array, revision?: number): void {
		for (const peer of this.ctx.getWebSockets()) {
			if (peer === sender) continue;
			try {
				peer.send(payload);
				if (revision !== undefined) this.control(peer, { type: 'revision', revision });
			} catch { try { peer.close(INTERNAL_ERROR_CLOSE_CODE, 'Reconnect to receive updates'); } catch { /* Closed peer. */ } }
		}
	}
	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		try { ws.close(code, reason); } catch { /* Already closed. */ }
	}
	async webSocketError(ws: WebSocket): Promise<void> {
		try { ws.close(INTERNAL_ERROR_CLOSE_CODE, 'Reconnect to sync'); } catch { /* Already closed. */ }
	}
}
