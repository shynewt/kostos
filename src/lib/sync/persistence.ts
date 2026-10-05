/* Uses the existing y-indexeddb database/stores so installed apps retain their data.
 * Unlike y-indexeddb's fire-and-forget writes, flush() waits for transaction commit.
 * Dirty metadata and the update are committed together. A full document upload on
 * reconnect is the durable outbox: it includes all saved, unacknowledged changes.
 */
import * as Y from 'yjs';

export const LOCAL_LOAD = Symbol('kostos-local-load');
export const REMOTE_ORIGIN = Symbol('kostos-sync-remote');

export type LocalState = {
	phase: 'loading' | 'saving' | 'saved' | 'error';
	pendingChanges: number;
	lastSyncedAt: number | null;
	unverifiedSince: number | null;
	/** Everything here came from a server whose history was incomplete, so this phone cannot vouch for it. */
	partial?: boolean;
};

function committed(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject(tx.error ?? new Error('Local storage transaction was aborted'));
		tx.onerror = () => reject(tx.error ?? new Error('Could not save on this device'));
	});
}

export class RoomPersistence {
	readonly ready: Promise<void>;
	state: LocalState = { phase: 'loading', pendingChanges: 0, lastSyncedAt: null, unverifiedSince: null };
	changeVersion = 0;
	private db: IDBDatabase | null = null;
	private writes: Promise<void> = Promise.resolve();
	private failure: unknown = null;
	private listeners = new Set<(state: LocalState) => void>();
	private queued = 0;
	private destroyed = false;
	private recovery: Promise<void> | null = null;
	private invalidated = false;
	private channel: BroadcastChannel | null = null;

	constructor(private name: string, private doc: Y.Doc) {
		this.ready = this.load();
		// The caller receives rejection through ready/flush; keep it handled even
		// before a route attaches, rather than generating an unhandled rejection.
		void this.ready.catch(() => {});
		doc.on('update', this.storeUpdate);
	}

	onChange(listener: (state: LocalState) => void): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => this.listeners.delete(listener);
	}

	private notify(patch: Partial<LocalState>): void {
		this.state = { ...this.state, ...patch };
		for (const listener of this.listeners) listener(this.state);
	}

	private async load(): Promise<void> {
		try {
			this.db = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open(this.name);
				const timeout = setTimeout(() => reject(new Error('Local storage did not open')), 10_000);
				request.onupgradeneeded = () => {
					request.result.createObjectStore('updates', { autoIncrement: true });
					request.result.createObjectStore('custom');
				};
				request.onsuccess = () => { clearTimeout(timeout); resolve(request.result); };
				request.onerror = () => { clearTimeout(timeout); reject(request.error); };
				request.onblocked = () => { clearTimeout(timeout); reject(new Error('Local storage is blocked')); };
			});
			this.db.onversionchange = () => { this.db?.close(); this.notify({ phase: 'error' }); };
			const tx = this.db.transaction(['updates', 'custom'], 'readonly');
			const done = committed(tx);
			const updates = tx.objectStore('updates').getAll();
			const meta = tx.objectStore('custom').get('sync-state');
			await done;
			const saved = meta.result as Partial<LocalState> | undefined;
			this.notify({
				pendingChanges: saved?.pendingChanges ?? 0,
				lastSyncedAt: saved?.lastSyncedAt ?? null,
				unverifiedSince: saved?.unverifiedSince ?? Date.now(),
				partial: saved?.partial ?? false
			});
			Y.transact(this.doc, () => {
				for (const update of updates.result as Uint8Array[]) Y.applyUpdate(this.doc, update, LOCAL_LOAD);
			}, LOCAL_LOAD);
			if (typeof BroadcastChannel !== 'undefined') {
				this.channel = new BroadcastChannel(this.name);
				this.channel.onmessage = (event) => {
					if (event.data instanceof Uint8Array) Y.applyUpdate(this.doc, event.data, this.channel);
				};
			}
			this.notify({ phase: 'saved' });
		} catch (error) {
			this.failure = error;
			this.notify({ phase: 'error' });
			throw error;
		}
	}

	private storeUpdate = (update: Uint8Array, origin: unknown): void => {
		if (origin === LOCAL_LOAD || this.destroyed) return;
		if (origin !== REMOTE_ORIGIN) {
			this.changeVersion++;
			this.notify({ pendingChanges: this.state.pendingChanges + 1, unverifiedSince: this.state.unverifiedSince ?? Date.now() });
		}
		if (origin !== this.channel) this.channel?.postMessage(update);
		const metadata = { ...this.state };
		this.enqueue(async () => {
			const tx = this.db!.transaction(['updates', 'custom'], 'readwrite');
			const done = committed(tx);
			tx.objectStore('updates').add(update);
			tx.objectStore('custom').put(metadata, 'sync-state');
			await done;
		});
	};

	private enqueue(work: () => Promise<void>): void {
		this.queued++;
		this.notify({ phase: 'saving' });
		this.writes = this.writes.then(async () => {
			await this.ready;
			await work();
		}).catch((error) => {
			this.failure = error;
		}).then(() => {
			this.queued--;
			this.notify({ phase: this.failure ? 'error' : this.queued ? 'saving' : 'saved' });
		});
	}

	async flush(): Promise<void> {
		await this.ready;
		// Include writes enqueued while earlier transactions were committing.
		let writes: Promise<void>;
		do { writes = this.writes; await writes; } while (writes !== this.writes);
		if (this.failure) await this.recover();
	}

	/** Retry a failed write using a full snapshot, including any earlier update
	 * whose transaction aborted. Never clear old updates: another offline tab
	 * may have appended data this tab has not observed yet. */
	private async recover(): Promise<void> {
		if (this.recovery) return this.recovery;
		this.recovery = (async () => {
			try {
				const update = Y.encodeStateAsUpdate(this.doc);
				const metadata = { ...this.state };
				const tx = this.db!.transaction(['updates', 'custom'], 'readwrite');
				const done = committed(tx);
				tx.objectStore('updates').add(update);
				tx.objectStore('custom').put(metadata, 'sync-state');
				await done;
				this.failure = null;
				this.notify({ phase: this.queued ? 'saving' : 'saved' });
			} catch (error) {
				this.failure = error;
				this.notify({ phase: 'error' });
				throw error;
			}
		})().finally(() => { this.recovery = null; });
		return this.recovery;
	}

	markPartial(): void {
		if (this.state.partial || this.destroyed) return;
		this.notify({ partial: true });
		const metadata = { ...this.state };
		this.enqueue(async () => {
			const tx = this.db!.transaction('custom', 'readwrite');
			const done = committed(tx);
			tx.objectStore('custom').put(metadata, 'sync-state');
			await done;
		});
	}

	invalidate(): void {
		if (this.invalidated || this.destroyed) return;
		this.invalidated = true;
		this.notify({ unverifiedSince: this.state.unverifiedSince ?? Date.now() });
		const metadata = { ...this.state };
		this.enqueue(async () => {
			const tx = this.db!.transaction('custom', 'readwrite');
			const done = committed(tx);
			tx.objectStore('custom').put(metadata, 'sync-state');
			await done;
		});
	}

	async confirm(version: number, at: number): Promise<void> {
		await this.flush();
		if (version !== this.changeVersion) return;
		const metadata = { ...this.state, pendingChanges: 0, lastSyncedAt: at, unverifiedSince: null };
		try {
			const tx = this.db!.transaction('custom', 'readwrite');
			const done = committed(tx);
			tx.objectStore('custom').put(metadata, 'sync-state');
			await done;
		} catch (error) {
			this.failure = error;
			this.notify({ phase: 'error' });
			throw error;
		}
		if (version !== this.changeVersion) return;
		this.invalidated = false;
		this.notify({ pendingChanges: 0, lastSyncedAt: at, unverifiedSince: null });
	}

	async destroy(): Promise<void> {
		this.destroyed = true;
		this.doc.off('update', this.storeUpdate);
		this.channel?.close();
		await this.writes;
		this.db?.close();
		this.listeners.clear();
	}

	async clearData(): Promise<void> {
		await this.destroy();
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(this.name);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
			request.onblocked = () => reject(new Error('Close other Kostos tabs before removing this group'));
		});
	}
}
