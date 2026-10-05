/* Encrypted, acknowledged Yjs transport. WebSocket OPEN is never a freshness
 * guarantee. A replay boundary + committed upload acknowledgements + a barrier
 * establish what the server has received. Local IndexedDB state is re-uploaded
 * on every connection, so recovery never needs another member to be online.
 */
import * as Y from 'yjs';
import { browser } from '$app/environment';
import { decryptPayload, deriveKey, encryptPayload } from './crypto';
import { frame, parse, MSG_STEP1, MSG_UPDATE } from './protocol';
import { REMOTE_ORIGIN, LOCAL_LOAD, type RoomPersistence } from './persistence';
import { type SyncStatus, type SyncProblem } from './status';

export type ConnectionStatus = SyncStatus['phase'];
const MAX_MESSAGE_BYTES = 1_048_576;
const TRANSPORT_MAGIC = new Uint8Array([75, 79, 83, 51]); // KOS3
const TIMEOUT_MS = 12_000;
/** A socket that hasn't opened by now means the server is out of reach: treat it as offline. */
const OPEN_TIMEOUT_MS = 6_000;
/** History worth replacing with a single snapshot once this phone is up to date. */
const COMPACT_MIN_ENTRIES = 50;
const COMPACT_MIN_BYTES = 256 * 1024;

export class EncryptedSyncProvider {
	private ws: WebSocket | null = null;
	private destroyed = false;
	private key: Promise<CryptoKey>;
	private listeners = new Set<(status: SyncStatus) => void>();
	private state: SyncStatus = { phase: 'loading', checking: true, problem: null, lastSyncedAt: null, unverifiedSince: Date.now(), pendingChanges: 0 };
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private deadline: ReturnType<typeof setTimeout> | null = null;
	private openTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeat: ReturnType<typeof setInterval> | null = null;
	private pullTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectDelay = 1000;
	private sendQueue: Promise<void> = Promise.resolve();
	private receiveQueue: Promise<void> = Promise.resolve();
	private pending = new Set<string>();
	private sending = 0;
	private supported = false;
	private replayed = false;
	private durable = false;
	private complete = true;
	private sessionProblem: SyncProblem | null = null;
	private revision = 0;
	private barrier: { id: string; version: number } | null = null;
	private unsubscribeLocal: (() => void) | undefined;

	constructor(private doc: Y.Doc, private url: string, private roomId: string, secret: string, private persistence?: RoomPersistence) {
		this.key = deriveKey(secret);
		doc.on('update', this.onUpdate);
		this.unsubscribeLocal = persistence?.onChange((local) => {
			this.setState({ pendingChanges: local.pendingChanges, lastSyncedAt: local.lastSyncedAt });
		});
		if (typeof window !== 'undefined') {
			window.addEventListener('online', this.retry);
			window.addEventListener('offline', this.handleOffline);
			document.addEventListener('visibilitychange', this.handleVisibility);
			window.addEventListener('pageshow', this.handlePageShow);
		}
		void Promise.all([persistence?.ready ?? Promise.resolve(), this.key]).then(() => {
			const hasData = doc.store.clients.size > 0;
			this.seeded = hasData && !persistence?.state.partial;
			this.fresh = !hasData;
			this.setState({ lastSyncedAt: persistence?.state.lastSyncedAt ?? null, unverifiedSince: persistence?.state.unverifiedSince ?? Date.now() });
			this.connect();
		}).catch(() => this.fail(persistence?.state.phase === 'error' ? 'storage' : 'decrypt', false));
	}

	get status(): ConnectionStatus { return this.state.phase; }
	get snapshot(): SyncStatus { return this.state; }
	onStatusChange(listener: (status: SyncStatus) => void): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => this.listeners.delete(listener);
	}

	private setState(patch: Partial<SyncStatus>): void {
		if (patch.phase && patch.phase !== 'synced') this.persistence?.invalidate();
		this.state = { ...this.state, ...patch };
		for (const listener of this.listeners) listener(this.state);
	}

	private isCurrent(ws: WebSocket): boolean { return !this.destroyed && this.ws === ws; }

	private connect(): void {
		if (this.destroyed) return;
		if (typeof navigator !== 'undefined' && navigator.onLine === false) {
			this.setState({ phase: 'offline', checking: false, problem: null, unverifiedSince: this.state.unverifiedSince ?? Date.now() });
			return;
		}
		this.supported = this.replayed = this.durable = false;
		this.complete = true;
		this.sessionProblem = null;
		this.pending.clear();
		this.sending = 0;
		this.barrier = null;
		this.replay = [];
		this.replayBytes = 0;
		this.sendQueue = this.receiveQueue = Promise.resolve();
		// While the server is out of reach, retries stay quiet: the phone keeps saying "Offline".
		if (this.state.phase === 'offline') this.setState({ problem: null });
		else this.setState({ phase: 'connecting', checking: true, problem: null, unverifiedSince: this.state.unverifiedSince ?? Date.now() });
		let ws: WebSocket;
		try { ws = new WebSocket(`${this.url}/${encodeURIComponent(this.roomId)}`); }
		catch { this.unreachable(); return; }
		this.ws = ws;
		ws.binaryType = 'arraybuffer';
		let opened = false;
		this.openTimer = setTimeout(() => { if (this.isCurrent(ws) && !opened) this.unreachable(); }, OPEN_TIMEOUT_MS);
		ws.onopen = () => {
			if (!this.isCurrent(ws)) return;
			opened = true;
			if (this.openTimer) clearTimeout(this.openTimer);
			this.openTimer = null;
			this.setState({ phase: 'syncing', checking: true, problem: null });
			this.armDeadline(ws);
			this.heartbeat = setInterval(() => {
				if (!this.isCurrent(ws) || document.visibilityState === 'hidden') return;
				this.requestBarrier();
			}, 20_000);
		};
		ws.onmessage = (event) => {
			// A long history is slow, not broken: only silence counts as a timeout.
			if (this.state.phase !== 'synced') { this.clearDeadline(); this.armDeadline(ws); }
			this.receiveQueue = this.receiveQueue.then(async () => {
				if (!this.isCurrent(ws)) return;
				if (typeof event.data === 'string') await this.receiveControl(ws, event.data);
				else {
					const plain = await decryptPayload(await this.key, new Uint8Array(event.data as ArrayBuffer));
					if (!this.isCurrent(ws)) return;
					const message = parse(plain);
					if (message.kind === 'step1') this.scheduleReply(message.body);
					else {
						if (!this.replayed) { this.replay.push(message.body); this.replayBytes += (event.data as ArrayBuffer).byteLength; }
						if (this.state.phase === 'synced') this.setState({ phase: 'syncing', unverifiedSince: Date.now() });
						Y.applyUpdate(this.doc, message.body, REMOTE_ORIGIN);
					}
				}
			}).catch(() => {
				if (this.isCurrent(ws)) this.fail('decrypt', false);
			});
		};
		ws.onclose = () => {
			if (!this.isCurrent(ws)) return;
			if (!opened) { this.unreachable(); return; }
			// The server dropped an open connection (a deploy, a restart): reconnect quietly.
			this.recover('network');
		};
		ws.onerror = () => { if (this.isCurrent(ws) && !opened) this.unreachable(); };
	}

	/** No answer from the server at all. From the user's side that is simply being offline:
	 *  their data stays on screen, the status says so, and the phone keeps trying on its own. */
	private unreachable(): void {
		if (this.destroyed) return;
		const ws = this.ws;
		this.ws = null;
		this.clearTimers();
		try { ws?.close(); } catch { /* Already closed. */ }
		this.setState({ phase: 'offline', checking: false, problem: null, unverifiedSince: this.state.unverifiedSince ?? Date.now() });
		this.scheduleReconnect();
	}

	/** A transient inconsistency (a dropped socket, a gap in revision numbers) is fixed by a
	 *  fresh replay. Only if that keeps failing is it worth showing the user. */
	private recover(problem: SyncProblem): void {
		if (this.recoveries >= 3) { this.fail(problem); return; }
		this.recoveries++;
		const ws = this.ws;
		this.ws = null;
		this.clearTimers();
		try { ws?.close(); } catch { /* Already closed. */ }
		this.connect();
	}

	/** Whether this phone holds anything a peer with the given state vector lacks. */
	private hasNewFor(vector: Uint8Array): boolean {
		const theirs = Y.decodeStateVector(vector);
		for (const [client, clock] of Y.decodeStateVector(Y.encodeStateVector(this.doc))) {
			if ((theirs.get(client) ?? 0) < clock) return true;
		}
		return false;
	}

	/** Local edits or deletes the server hasn't confirmed. Deletes don't show in a state vector. */
	private unconfirmed(): boolean {
		const local = this.persistence?.state;
		return !local || local.pendingChanges > 0 || local.lastSyncedAt === null;
	}

	private async receiveControl(ws: WebSocket, data: string): Promise<void> {
		if (data === 'pong') return;
		let message: { type?: string; protocol?: number; revision?: number; durable?: boolean; complete?: boolean; hash?: string; id?: string; reason?: string };
		try { message = JSON.parse(data); } catch { return; }
		if (!message || typeof message !== 'object') return;
		if (message.type === 'ready') {
			if (message.protocol !== 3 || !Number.isSafeInteger(message.revision)) { this.fail('protocol', false); return; }
			this.supported = this.replayed = true;
			this.durable = message.durable === true;
			this.complete = message.complete === true;
			if (!this.complete && this.fresh) this.persistence?.markPartial();
			this.revision = message.revision!;
			// Upload only what the server lacks. Re-sending the whole group on every
			// connection is what made histories balloon (encryption defeats dedupe).
			let serverVector: Uint8Array = Y.encodeStateVector(new Map());
			try { if (this.replay.length) serverVector = Y.encodeStateVectorFromUpdate(Y.mergeUpdates(this.replay)); }
			catch { /* Fall back to a full upload. */ }
			this.replayCount = this.replay.length;
			this.replay = [];
			if (this.sessionProblem) return;
			if (this.hasNewFor(serverVector) || this.unconfirmed()) this.send(MSG_UPDATE, Y.encodeStateAsUpdate(this.doc, serverVector));
			this.send(MSG_STEP1, Y.encodeStateVector(this.doc));
			return;
		}
		if (message.type === 'error') { this.fail(message.reason === 'size' ? 'size' : 'storage'); return; }
		if (message.type === 'ack' || message.type === 'revision') {
			if (!Number.isSafeInteger(message.revision) || message.revision! > this.revision + 1) { this.recover('history'); return; }
			this.revision = Math.max(this.revision, message.revision!);
			if (message.hash) this.pending.delete(message.hash);
			this.requestBarrier();
			return;
		}
		if (message.type === 'caught-up' && this.barrier && message.id === this.barrier.id) {
			const version = this.barrier.version;
			this.barrier = null;
			if (message.revision !== this.revision) { this.recover('history'); return; }
			if (this.sessionProblem) return;
			if (!this.durable) { this.fail('storage', false); return; }
			// Changes that refer to data lost before this version (an old server dropped some)
			// can never be completed by any device, so they must not block sync forever.
			if (!this.complete) {
				if (!this.seeded) { this.fail('history', false); return; }
				// Everything this phone holds has been uploaded and acknowledged, so the server log is whole again.
				this.complete = true;
				ws.send(JSON.stringify({ type: 'complete' }));
				this.requestBarrier();
				return;
			}
			if (this.pending.size || this.sending || version !== (this.persistence?.changeVersion ?? 0)) { this.requestBarrier(); return; }
			const at = Date.now();
			try { await this.persistence?.confirm(version, at); }
			catch { this.fail('storage', false); return; }
			if (!this.isCurrent(ws) || this.pending.size || this.sending || version !== (this.persistence?.changeVersion ?? 0)) return;
			this.clearDeadline();
			this.reconnectDelay = 1000;
			this.recoveries = 0;
			this.setState({ phase: 'synced', checking: false, problem: null, lastSyncedAt: at, unverifiedSince: null, pendingChanges: 0 });
			this.compact(ws);
		}
	}

	private onUpdate = (update: Uint8Array, origin: unknown): void => {
		if (origin === REMOTE_ORIGIN || origin === LOCAL_LOAD) return;
		if (!this.sessionProblem) this.setState({ phase: navigator.onLine === false ? 'offline' : this.ws?.readyState === WebSocket.OPEN ? 'syncing' : this.state.phase, unverifiedSince: this.state.unverifiedSince ?? Date.now() });
		this.send(MSG_UPDATE, update);
	};

	private send(type: number, body: Uint8Array): void {
		const ws = this.ws;
		if (!ws || ws.readyState !== WebSocket.OPEN || !this.supported || this.sessionProblem) return;
		this.sending++;
		this.sendQueue = this.sendQueue.then(async () => {
			if (!this.isCurrent(ws)) return;
			await this.persistence?.flush();
			const encrypted = await encryptPayload(await this.key, frame(type, body));
			if (!this.isCurrent(ws) || ws.readyState !== WebSocket.OPEN) return;
			if (encrypted.length + 5 > MAX_MESSAGE_BYTES) { this.fail('size', false); return; }
			const durable = type === MSG_UPDATE;
			const packet = new Uint8Array(5 + encrypted.length);
			packet.set(TRANSPORT_MAGIC);
			packet[4] = durable ? 1 : 0;
			packet.set(encrypted, 5);
			if (durable) {
				const hash = await crypto.subtle.digest('SHA-256', encrypted as BufferSource);
				if (!this.isCurrent(ws)) return;
				this.pending.add(Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join(''));
			}
			ws.send(packet);
		}).catch(() => { if (this.isCurrent(ws)) this.fail('storage'); }).finally(() => {
			if (!this.isCurrent(ws)) return;
			this.sending--;
			this.requestBarrier();
		});
		this.armDeadline(ws);
	}

	private requestBarrier(): void {
		const ws = this.ws;
		if (!ws || !this.supported || !this.replayed || ws.readyState !== WebSocket.OPEN || this.barrier || this.sending || this.pending.size || this.sessionProblem) return;
		const id = crypto.randomUUID();
		this.barrier = { id, version: this.persistence?.changeVersion ?? 0 };
		ws.send(JSON.stringify({ type: 'barrier', id }));
		this.armDeadline(ws);
	}

	/** A peer just connected and told us what it has. Only answer if we hold something it lacks. */
	private scheduleReply(vector: Uint8Array): void {
		if (this.pullTimer) return;
		this.pullTimer = setTimeout(() => {
			this.pullTimer = null;
			if (this.hasNewFor(vector)) this.send(MSG_UPDATE, Y.encodeStateAsUpdate(this.doc, vector));
		}, 250);
	}

	/** Once up to date, swap a long replay for one snapshot of everything up to `revision`.
	 *  Runs at most once per session; the server keeps the replaced entries archived. */
	private compact(ws: WebSocket): void {
		if (this.compacted || this.replayCount < COMPACT_MIN_ENTRIES || this.replayBytes < COMPACT_MIN_BYTES) return;
		this.compacted = true;
		const through = this.revision;
		const replayBytes = this.replayBytes;
		const snapshot = Y.encodeStateAsUpdate(this.doc);
		void this.key.then((key) => encryptPayload(key, frame(MSG_UPDATE, snapshot))).then((encrypted) => {
			if (!this.isCurrent(ws) || ws.readyState !== WebSocket.OPEN) return;
			if (encrypted.length + 9 > MAX_MESSAGE_BYTES || encrypted.length * 2 > replayBytes) return;
			const packet = new Uint8Array(9 + encrypted.length);
			packet.set(TRANSPORT_MAGIC);
			packet[4] = 2;
			new DataView(packet.buffer).setUint32(5, through);
			packet.set(encrypted, 9);
			ws.send(packet);
		}).catch(() => { /* Compaction is an optimisation; the history stays valid without it. */ });
	}

	private fail(problem: SyncProblem, reconnect = true): void {
		if (this.destroyed) return;
		this.sessionProblem = problem;
		this.setState({ phase: navigator.onLine === false ? 'offline' : 'error', checking: false, problem, unverifiedSince: this.state.unverifiedSince ?? Date.now() });
		if (reconnect) {
			const ws = this.ws;
			this.ws = null;
			this.clearTimers();
			try { ws?.close(); } catch { /* Already closed. */ }
			this.scheduleReconnect();
		} else this.clearDeadline();
	}

	private recoveries = 0;
	private replay: Uint8Array[] = [];
	private replayBytes = 0;
	private replayCount = 0;
	private compacted = false;
	/** This phone held data of its own before connecting, so it can vouch for a trimmed server history. */
	private seeded = false;
	private fresh = false;

	private armDeadline(ws: WebSocket): void {
		if (this.deadline) return;
		this.deadline = setTimeout(() => {
			this.deadline = null;
			if (this.isCurrent(ws)) this.fail('timeout');
		}, TIMEOUT_MS);
	}
	private clearDeadline(): void { if (this.deadline) clearTimeout(this.deadline); this.deadline = null; }
	private clearTimers(): void {
		this.clearDeadline();
		if (this.openTimer) clearTimeout(this.openTimer);
		this.openTimer = null;
		if (this.heartbeat) clearInterval(this.heartbeat);
		if (this.pullTimer) clearTimeout(this.pullTimer);
		this.heartbeat = this.pullTimer = null;
	}
	private scheduleReconnect(): void {
		if (this.destroyed || this.reconnectTimer || navigator.onLine === false) return;
		const delay = this.reconnectDelay * (0.8 + Math.random() * 0.4);
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
		this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
	}

	retry = (): void => {
		if (this.destroyed) return;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		const ws = this.ws;
		this.ws = null;
		this.clearTimers();
		try { ws?.close(); } catch { /* Already closed. */ }
		this.connect();
	};
	private handleOffline = (): void => {
		this.retry();
	};
	private handleVisibility = (): void => { if (document.visibilityState === 'visible') this.retry(); };
	private handlePageShow = (event: PageTransitionEvent): void => { if (event.persisted) this.retry(); };

	destroy(): void {
		this.destroyed = true;
		this.doc.off('update', this.onUpdate);
		this.unsubscribeLocal?.();
		this.clearTimers();
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.ws?.close();
		this.ws = null;
		this.listeners.clear();
		if (typeof window !== 'undefined') {
			window.removeEventListener('online', this.retry);
			window.removeEventListener('offline', this.handleOffline);
			document.removeEventListener('visibilitychange', this.handleVisibility);
			window.removeEventListener('pageshow', this.handlePageShow);
		}
	}
}

export function createSyncProvider(doc: Y.Doc, url: string | undefined, roomId: string, secret: string, persistence?: RoomPersistence): EncryptedSyncProvider | null {
	if (!browser || !url) return null;
	return new EncryptedSyncProvider(doc, url, roomId, secret, persistence);
}
