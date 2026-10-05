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

export class EncryptedSyncProvider {
	private ws: WebSocket | null = null;
	private destroyed = false;
	private key: Promise<CryptoKey>;
	private listeners = new Set<(status: SyncStatus) => void>();
	private state: SyncStatus = { phase: 'loading', checking: true, problem: null, lastSyncedAt: null, unverifiedSince: Date.now(), pendingChanges: 0 };
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private deadline: ReturnType<typeof setTimeout> | null = null;
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
		this.sendQueue = this.receiveQueue = Promise.resolve();
		this.setState({ phase: 'connecting', checking: true, problem: null, unverifiedSince: this.state.unverifiedSince ?? Date.now() });
		let ws: WebSocket;
		try { ws = new WebSocket(`${this.url}/${encodeURIComponent(this.roomId)}`); }
		catch { this.fail('network'); return; }
		this.ws = ws;
		ws.binaryType = 'arraybuffer';
		this.armDeadline(ws);
		ws.onopen = () => {
			if (!this.isCurrent(ws)) return;
			this.setState({ phase: 'syncing' });
			this.heartbeat = setInterval(() => {
				if (!this.isCurrent(ws) || document.visibilityState === 'hidden') return;
				this.requestBarrier();
			}, 20_000);
		};
		ws.onmessage = (event) => {
			this.receiveQueue = this.receiveQueue.then(async () => {
				if (!this.isCurrent(ws)) return;
				if (typeof event.data === 'string') await this.receiveControl(ws, event.data);
				else {
					const plain = await decryptPayload(await this.key, new Uint8Array(event.data as ArrayBuffer));
					if (!this.isCurrent(ws)) return;
					const message = parse(plain);
					if (message.kind === 'step1') this.scheduleReply();
					else {
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
			this.ws = null;
			this.clearTimers();
			if (navigator.onLine === false) this.setState({ phase: 'offline', checking: false, problem: null });
			else {
				this.setState({ phase: 'error', checking: false, problem: this.state.problem ?? 'network', unverifiedSince: this.state.unverifiedSince ?? Date.now() });
				this.scheduleReconnect();
			}
		};
		ws.onerror = () => { if (this.isCurrent(ws)) this.fail('network'); };
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
			this.revision = message.revision!;
			// Includes old local edits and deletes, even if their state vector did
			// not advance. Also publishes a brand-new group when its creator is alone.
			if (this.sessionProblem) return;
			this.send(MSG_UPDATE, Y.encodeStateAsUpdate(this.doc));
			this.send(MSG_STEP1, Y.encodeStateVector(this.doc));
			return;
		}
		if (message.type === 'error') { this.fail(message.reason === 'size' ? 'size' : 'storage'); return; }
		if (message.type === 'ack' || message.type === 'revision') {
			if (!Number.isSafeInteger(message.revision) || message.revision! > this.revision + 1) { this.fail('history'); return; }
			this.revision = Math.max(this.revision, message.revision!);
			if (message.hash) this.pending.delete(message.hash);
			this.requestBarrier();
			return;
		}
		if (message.type === 'caught-up' && this.barrier && message.id === this.barrier.id) {
			const version = this.barrier.version;
			this.barrier = null;
			if (message.revision !== this.revision) { this.fail('history'); return; }
			if (this.sessionProblem) return;
			if (!this.durable) { this.fail('storage', false); return; }
			if (!this.complete || this.doc.store.pendingStructs || this.doc.store.pendingDs) { this.fail('history', false); return; }
			if (this.pending.size || this.sending || version !== (this.persistence?.changeVersion ?? 0)) { this.requestBarrier(); return; }
			const at = Date.now();
			try { await this.persistence?.confirm(version, at); }
			catch { this.fail('storage', false); return; }
			if (!this.isCurrent(ws) || this.pending.size || this.sending || version !== (this.persistence?.changeVersion ?? 0)) return;
			this.clearDeadline();
			this.reconnectDelay = 1000;
			this.setState({ phase: 'synced', checking: false, problem: null, lastSyncedAt: at, unverifiedSince: null, pendingChanges: 0 });
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

	private scheduleReply(): void {
		if (this.pullTimer) return;
		this.pullTimer = setTimeout(() => {
			this.pullTimer = null;
			this.send(MSG_UPDATE, Y.encodeStateAsUpdate(this.doc));
		}, 250);
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

	private armDeadline(ws: WebSocket): void {
		if (this.deadline) return;
		this.deadline = setTimeout(() => {
			this.deadline = null;
			if (this.isCurrent(ws)) this.fail(this.supported ? 'timeout' : 'protocol');
		}, TIMEOUT_MS);
	}
	private clearDeadline(): void { if (this.deadline) clearTimeout(this.deadline); this.deadline = null; }
	private clearTimers(): void {
		this.clearDeadline();
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
