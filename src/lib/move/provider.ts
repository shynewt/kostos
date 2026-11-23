/* The v3 sync client, copied from v3's sync/provider.ts and attached to a v2 group's document, so the
 * same group lives on both servers until v2 retires. Differences from the original:
 *  - No storage of its own: the v2 RoomPersistence already keeps the document on the phone, and this
 *    starts only after it has loaded. Without a record of what the v3 server confirmed, each connection
 *    rebuilds the server's state from the replay and uploads only what that state lacks, deletes included.
 *  - Updates from the v3 server carry MIRROR_ORIGIN. The v2 provider forwards them to the v2 server
 *    (they are not its REMOTE_ORIGIN), and this one forwards everything else, so edits flow both ways.
 *    With several members open at once an edit can reach a server more than once; Yjs merges the copies.
 *  - No insecure-context check: the old site is only served over HTTPS.
 * Acknowledgements, barriers and compaction are unchanged, so "synced" means the v3 server has it all.
 */
import * as Y from 'yjs';
import { frame, parse, MSG_STEP1, MSG_UPDATE } from '../sync/protocol';
import { decryptPayload, deriveKey, deriveRoomAccess, encryptPayload, type RoomAccess } from './crypto';
import { MAX_MESSAGE_BYTES, PACKET_MAGIC, PROOF_PREFIX, PROTOCOL_VERSION, ROOM_FULL_REASON, SIZE_ERROR_REASON, payloadHash } from './wire';

export const MIRROR_ORIGIN = Symbol('kostos-move-remote');

export type MirrorPhase = 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
export type MirrorProblem = 'network' | 'timeout' | 'storage' | 'decrypt' | 'protocol' | 'history' | 'size' | 'full' | 'denied';
export type MirrorStatus = { phase: MirrorPhase; problem: MirrorProblem | null };

const TIMEOUT_MS = 12_000;
/** A socket that hasn't opened by now means the server is out of reach: treat it as offline. */
const OPEN_TIMEOUT_MS = 6_000;
/** A full room stays full until someone compacts it, and every attempt replays the whole history, so wait. */
const ROOM_FULL_RETRY_MS = 5 * 60_000;
/** History worth replacing with a single snapshot once this phone is up to date. */
const COMPACT_MIN_ENTRIES = 50;
const COMPACT_MIN_BYTES = 256 * 1024;

export class MirrorProvider {
	private ws: WebSocket | null = null;
	private destroyed = false;
	private key: Promise<CryptoKey>;
	private listeners = new Set<(status: MirrorStatus) => void>();
	private state: MirrorStatus = { phase: 'connecting', problem: null };
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private deadline: ReturnType<typeof setTimeout> | null = null;
	private openTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeat: ReturnType<typeof setInterval> | null = null;
	private pullTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectDelay = 1000;
	private holdUntil = 0;
	private sendQueue: Promise<void> = Promise.resolve();
	private receiveQueue: Promise<void> = Promise.resolve();
	private pending = new Set<string>();
	private sending = 0;
	private supported = false;
	private replayed = false;
	private durable = false;
	private complete = true;
	private sessionProblem: MirrorProblem | null = null;
	private denied = false;
	private recoveries = 0;
	private replay: Uint8Array[] = [];
	private replayBytes = 0;
	private replayCount = 0;
	private compacted = false;
	private seeded = false;
	private revision = 0;
	private access: RoomAccess | null = null;
	private barrier: { id: string; version: number } | null = null;
	/** Bumped by every update this phone has that the v3 server must get. */
	private changeVersion = 0;

	constructor(private doc: Y.Doc, private url: string, secret: string, private isPartial: () => boolean) {
		this.key = deriveKey(secret);
		const accessPromise = deriveRoomAccess(secret);
		doc.on('update', this.onUpdate);
		window.addEventListener('online', this.reconnectUnlessHeld);
		window.addEventListener('offline', this.reconnectUnlessHeld);
		document.addEventListener('visibilitychange', this.handleVisibility);
		window.addEventListener('pageshow', this.handlePageShow);
		this.start(accessPromise).catch((error) => {
			console.error('Could not prepare the move to the new site', error);
			this.fail('decrypt', false);
		});
	}

	private async start(accessPromise: Promise<RoomAccess>): Promise<void> {
		[, this.access] = await Promise.all([this.key, accessPromise]);
		this.seeded = this.doc.store.clients.size > 0 && !this.isPartial();
		this.connect();
	}

	get snapshot(): MirrorStatus { return this.state; }
	onStatusChange(listener: (status: MirrorStatus) => void): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => this.listeners.delete(listener);
	}

	private setState(patch: Partial<MirrorStatus>): void {
		this.state = { ...this.state, ...patch };
		for (const listener of this.listeners) listener(this.state);
	}

	private isCurrent(ws: WebSocket): boolean { return !this.destroyed && this.ws === ws; }

	private connect(): void {
		const access = this.access;
		if (this.destroyed || this.denied || !access) return;
		if (navigator.onLine === false) { this.setState({ phase: 'offline', problem: null }); return; }
		this.holdUntil = 0;
		this.supported = this.replayed = this.durable = false;
		this.complete = true;
		this.sessionProblem = null;
		this.pending.clear();
		this.sending = 0;
		this.barrier = null;
		this.replay = [];
		this.replayBytes = 0;
		this.sendQueue = this.receiveQueue = Promise.resolve();
		if (this.state.phase === 'offline') this.setState({ problem: null });
		else this.setState({ phase: 'connecting', problem: null });
		let ws: WebSocket;
		try { ws = new WebSocket(`${this.url}/${access.relayRoomId}`, [`${PROOF_PREFIX}${access.proof}`]); }
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
			this.setState({ phase: 'syncing', problem: null });
			this.armDeadline(ws);
			this.heartbeat = setInterval(() => {
				if (!this.isCurrent(ws) || document.visibilityState === 'hidden') return;
				this.requestBarrier();
			}, 20_000);
		};
		ws.onmessage = (event) => {
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
						if (this.state.phase === 'synced') this.setState({ phase: 'syncing' });
						Y.applyUpdate(this.doc, message.body, MIRROR_ORIGIN);
					}
				}
			}).catch(() => {
				if (this.isCurrent(ws)) this.fail('decrypt', false);
			});
		};
		ws.onclose = () => {
			if (!this.isCurrent(ws)) return;
			if (!opened) { this.unreachable(); return; }
			void this.receiveQueue.then(() => { if (this.isCurrent(ws)) this.recover('network'); });
		};
		ws.onerror = () => { if (this.isCurrent(ws) && !opened) this.unreachable(); };
	}

	private unreachable(): void {
		if (this.destroyed) return;
		this.closeSocket();
		this.setState({ phase: 'offline', problem: null });
		this.scheduleReconnect();
	}

	private recover(problem: MirrorProblem): void {
		if (this.recoveries >= 3) { this.fail(problem); return; }
		this.recoveries++;
		this.closeSocket();
		this.connect();
	}

	/** Whether the server, as rebuilt from its replay, would change by applying `missing`. */
	private serverLacks(replay: Uint8Array[], missing: Uint8Array): boolean {
		const server = new Y.Doc();
		try {
			for (const update of replay) Y.applyUpdate(server, update);
			let changed = false;
			server.on('update', () => { changed = true; });
			Y.applyUpdate(server, missing);
			return changed;
		} catch {
			return true;
		} finally {
			server.destroy();
		}
	}

	private hasNewFor(vector: Uint8Array): boolean {
		const theirs = Y.decodeStateVector(vector);
		for (const [client, clock] of Y.decodeStateVector(Y.encodeStateVector(this.doc))) {
			if ((theirs.get(client) ?? 0) < clock) return true;
		}
		return false;
	}

	private async receiveControl(ws: WebSocket, data: string): Promise<void> {
		if (data === 'pong') return;
		let message: { type?: string; protocol?: number; revision?: number; durable?: boolean; complete?: boolean; hash?: string; id?: string; reason?: string };
		try { message = JSON.parse(data); } catch { return; }
		if (!message || typeof message !== 'object') return;
		if (message.type === 'ready') {
			if (message.protocol !== PROTOCOL_VERSION || !Number.isSafeInteger(message.revision)) { this.fail('protocol', false); return; }
			this.supported = this.replayed = true;
			this.durable = message.durable === true;
			this.complete = message.complete === true;
			this.revision = message.revision!;
			let serverVector: Uint8Array = Y.encodeStateVector(new Map());
			try { if (this.replay.length) serverVector = Y.encodeStateVectorFromUpdate(Y.mergeUpdates(this.replay)); }
			catch { /* Fall back to a full upload. */ }
			const replay = this.replay;
			this.replayCount = replay.length;
			this.replay = [];
			if (this.sessionProblem) return;
			const missing = Y.encodeStateAsUpdate(this.doc, serverVector);
			if (this.serverLacks(replay, missing)) this.send(MSG_UPDATE, missing);
			this.send(MSG_STEP1, Y.encodeStateVector(this.doc));
			return;
		}
		if (message.type === 'denied') { this.deny(); return; }
		if (message.type === 'error') { this.fail(this.serverErrorProblem(message.reason)); return; }
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
			if (!this.complete) {
				if (!this.seeded) { this.fail('history', false); return; }
				this.complete = true;
				ws.send(JSON.stringify({ type: 'complete' }));
				this.requestBarrier();
				return;
			}
			if (this.pending.size || this.sending || version !== this.changeVersion) { this.requestBarrier(); return; }
			this.clearDeadline();
			this.reconnectDelay = 1000;
			this.recoveries = 0;
			this.setState({ phase: 'synced', problem: null });
			this.compact(ws);
		}
	}

	private serverErrorProblem(reason: string | undefined): MirrorProblem {
		if (reason === SIZE_ERROR_REASON) return 'size';
		return reason === ROOM_FULL_REASON ? 'full' : 'storage';
	}

	private onUpdate = (update: Uint8Array, origin: unknown): void => {
		if (origin === MIRROR_ORIGIN) return;
		this.changeVersion++;
		if (!this.sessionProblem) this.setState({ phase: navigator.onLine === false ? 'offline' : this.ws?.readyState === WebSocket.OPEN ? 'syncing' : this.state.phase });
		this.send(MSG_UPDATE, update);
	};

	private send(type: number, body: Uint8Array): void {
		const ws = this.ws;
		if (!ws || ws.readyState !== WebSocket.OPEN || !this.supported || this.sessionProblem) return;
		this.sending++;
		this.sendQueue = this.sendQueue.then(async () => {
			if (!this.isCurrent(ws)) return;
			const encrypted = await encryptPayload(await this.key, frame(type, body));
			if (!this.isCurrent(ws) || ws.readyState !== WebSocket.OPEN) return;
			if (encrypted.length + 5 > MAX_MESSAGE_BYTES) { this.fail('size', false); return; }
			const durable = type === MSG_UPDATE;
			const packet = new Uint8Array(5 + encrypted.length);
			packet.set(PACKET_MAGIC);
			packet[4] = durable ? 1 : 0;
			packet.set(encrypted, 5);
			if (durable) {
				const hash = await payloadHash(encrypted);
				if (!this.isCurrent(ws)) return;
				this.pending.add(hash);
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
		this.barrier = { id, version: this.changeVersion };
		ws.send(JSON.stringify({ type: 'barrier', id }));
		this.armDeadline(ws);
	}

	private scheduleReply(vector: Uint8Array): void {
		if (this.pullTimer) return;
		this.pullTimer = setTimeout(() => {
			this.pullTimer = null;
			if (this.hasNewFor(vector)) this.send(MSG_UPDATE, Y.encodeStateAsUpdate(this.doc, vector));
		}, 250);
	}

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
			packet.set(PACKET_MAGIC);
			packet[4] = 2;
			new DataView(packet.buffer).setUint32(5, through);
			packet.set(encrypted, 9);
			ws.send(packet);
		}).catch(() => { /* Compaction is an optimisation; the history stays valid without it. */ });
	}

	private fail(problem: MirrorProblem, reconnect = true): void {
		if (this.destroyed) return;
		this.sessionProblem = problem;
		if (problem === 'full') this.holdUntil = Date.now() + ROOM_FULL_RETRY_MS;
		this.setState({ phase: reconnect && navigator.onLine === false ? 'offline' : 'error', problem });
		if (reconnect) {
			this.closeSocket();
			this.scheduleReconnect();
		} else this.clearDeadline();
	}

	private deny(): void {
		this.denied = true;
		this.closeSocket();
		this.fail('denied', false);
	}

	private closeSocket(): void {
		const ws = this.ws;
		this.ws = null;
		this.clearTimers();
		try { ws?.close(); } catch { /* Already closed. */ }
	}

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
	private nextReconnectDelay(): number {
		const hold = this.holdUntil - Date.now();
		if (hold > 0) return hold;
		const delay = this.reconnectDelay;
		this.reconnectDelay = Math.min(delay * 2, 30_000);
		return delay;
	}
	private scheduleReconnect(): void {
		if (this.destroyed || this.reconnectTimer || navigator.onLine === false) return;
		const delay = this.nextReconnectDelay() * (0.8 + Math.random() * 0.4);
		this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
	}

	retry = (): void => {
		if (this.destroyed) return;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		this.holdUntil = 0;
		this.closeSocket();
		this.connect();
	};
	private reconnectUnlessHeld = (): void => {
		if (Date.now() < this.holdUntil) this.scheduleReconnect();
		else this.retry();
	};
	private handleVisibility = (): void => { if (document.visibilityState === 'visible') this.reconnectUnlessHeld(); };
	private handlePageShow = (event: PageTransitionEvent): void => { if (event.persisted) this.reconnectUnlessHeld(); };

	destroy(): void {
		this.destroyed = true;
		this.doc.off('update', this.onUpdate);
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.closeSocket();
		this.listeners.clear();
		window.removeEventListener('online', this.reconnectUnlessHeld);
		window.removeEventListener('offline', this.reconnectUnlessHeld);
		document.removeEventListener('visibilitychange', this.handleVisibility);
		window.removeEventListener('pageshow', this.handlePageShow);
	}
}
