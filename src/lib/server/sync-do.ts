/// <reference types="@cloudflare/workers-types" />
/* One encrypted append-only log per group. The server never sees document
 * plaintext. SQL rows avoid a growing single KV value and are never trimmed;
 * compaction moves replaced rows to an archive. MAX_ROOM_BYTES caps live
 * history, the payload bytes a new client replays, so compacting frees room;
 * MAX_ROOM_ENTRIES caps how many live entries there are.
 * Acknowledgements are sent only after a transactional write; replay and
 * barriers are serialized with writes, including across WebSocket hibernation.
 */
import { DurableObject } from 'cloudflare:workers';
import {
	MAX_ARCHIVE_BYTES, MAX_BARRIER_ID_LENGTH, MAX_ROOM_BYTES, MAX_ROOM_ENTRIES, PROTOCOL_VERSION, SIZE_CLOSE_CODE, SIZE_ERROR_MESSAGE,
	unwrapPacket, payloadHash
} from '../sync/relay-protocol.js';
import {
	DENIED_CLOSE_CODE, DENIED_MESSAGE, INTERNAL_ERROR_CLOSE_CODE, ROOM_FULL_CLOSE_REASON, ROOM_FULL_MESSAGE, STORAGE_ERROR_MESSAGE,
	hashesEqual, parseProofProtocol, proofHash
} from '../sync/room-access.js';

type Entry = { seq: number; hash: string; payload: ArrayBuffer };

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
			const migrated = ctx.storage.sql.exec<{ value: number }>("SELECT value FROM sync_meta WHERE key = 'migrated'").toArray();
			if (migrated.length) return;
			// Keep the legacy KV entry untouched for recovery. A full capped log
			// cannot prove it includes all older data, so do not claim freshness.
			const old = await ctx.storage.get<ArrayBuffer[]>('history') ?? [];
			ctx.storage.transactionSync(() => {
				for (let i = 0; i < old.length; i++) {
					ctx.storage.sql.exec('INSERT INTO messages (hash, payload) VALUES (?, ?)', `legacy:${i}`, old[i]);
				}
				ctx.storage.sql.exec("INSERT INTO sync_meta (key, value) VALUES ('complete', ?), ('migrated', 1)", old.length < 1000 ? 1 : 0);
			});
		});
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

	/** Whether live history (the rows a new client replays, not the archive) would pass MAX_ROOM_BYTES after
	 *  growing by `deltaBytes`. The database size bounds live bytes from above for free, so the exact sum,
	 *  which bills a read per live row, only runs once archived rows make that bound too loose. */
	private exceedsCap(deltaBytes: number): boolean {
		const sql = this.ctx.storage.sql;
		if (sql.databaseSize + deltaBytes <= MAX_ROOM_BYTES) return false;
		const live = sql.exec<{ bytes: number }>('SELECT COALESCE(SUM(length(payload)), 0) AS bytes FROM messages').one().bytes;
		return live + deltaBytes > MAX_ROOM_BYTES;
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
				server.close(DENIED_CLOSE_CODE, 'Unauthorized');
				return new Response(null, { status: 101, webSocket: client, headers });
			}
			this.ctx.acceptWebSocket(server);
			try {
				for (const entry of this.ctx.storage.sql.exec<Entry>('SELECT seq, hash, payload FROM messages ORDER BY seq')) server.send(entry.payload);
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
				if (typeof message === 'string') {
					let control;
					try { control = JSON.parse(message); } catch { return; }
					if (!control || typeof control !== 'object') return;
					if (control.type === 'complete') {
						// A device that holds the data vouches for a history the old server trimmed.
						this.ctx.storage.sql.exec("INSERT INTO sync_meta (key, value) VALUES ('complete', 1) ON CONFLICT(key) DO UPDATE SET value = 1");
						return;
					}
					if (control.type === 'barrier' && typeof control.id === 'string' && control.id.length <= MAX_BARRIER_ID_LENGTH) {
						this.control(ws, { type: 'caught-up', id: control.id, revision: this.revision() });
					}
					return;
				}
				let decoded;
				try { decoded = unwrapPacket(new Uint8Array(message)); }
				catch { this.control(ws, SIZE_ERROR_MESSAGE); ws.close(SIZE_CLOSE_CODE, 'Invalid message size'); return; }
				const { payload, durable, compact } = decoded;
				if (compact !== undefined) {
					this.compact(ws, compact, payload);
					return;
				}
				if (!durable) {
					this.broadcast(ws, payload);
					return;
				}
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
						return this.revision();
					});
					this.broadcast(ws, payload, revision);
				}
				this.control(ws, { type: 'ack', hash, revision });
			} catch (error) {
				this.logFailure(error);
				try { this.control(ws, STORAGE_ERROR_MESSAGE); ws.close(INTERNAL_ERROR_CLOSE_CODE, 'Could not persist sync data'); } catch { /* Closed peer. */ }
			}
		});
	}

	/** Compaction is rare, so summing the archive here is cheaper than keeping a running total honest. */
	private archiveWouldOverflow(addedBytes: number): boolean {
		const archived = this.ctx.storage.sql.exec<{ bytes: number }>('SELECT COALESCE(SUM(length(payload)), 0) AS bytes FROM archive').one().bytes;
		return archived + addedBytes > MAX_ARCHIVE_BYTES;
	}

	/** Replace entries up to `through` with one snapshot at the same seq, so revision numbers and
	 *  everything after `through` stay as they are. Late, redundant, over-cap or archive-overflowing requests are ignored. */
	private compact(ws: WebSocket, through: number, payload: Uint8Array): void {
		if (through < 1 || through > this.revision()) return;
		const { n: covered, bytes: coveredBytes } = this.ctx.storage.sql
			.exec<{ n: number; bytes: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(length(payload)), 0) AS bytes FROM messages WHERE seq <= ?', through).one();
		if (covered < 2 || this.exceedsCap(payload.byteLength - coveredBytes) || this.archiveWouldOverflow(coveredBytes)) return;
		const hash = `snapshot:${through}:${Date.now()}`;
		this.ctx.storage.transactionSync(() => {
			this.ctx.storage.sql.exec('INSERT INTO archive (seq, hash, payload, archived_at) SELECT seq, hash, payload, ? FROM messages WHERE seq <= ?', Date.now(), through);
			this.ctx.storage.sql.exec('DELETE FROM messages WHERE seq <= ?', through);
			this.ctx.storage.sql.exec('INSERT INTO messages (seq, hash, payload) VALUES (?, ?, ?)', through, hash, payload);
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
