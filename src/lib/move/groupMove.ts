/* Keeps one v2 group's copy on the v3 server current while the group is open here. */
import type * as Y from 'yjs';
import { NEW_ORIGIN } from '$lib/migration';
import type { RoomPersistence } from '$lib/sync/persistence';
import { deriveMovedSecret } from './crypto';
import { markMoved } from './marker';
import { MirrorProvider, type MirrorStatus } from './provider';

/** `secret` is the group's v3 secret, null until derived. */
export type MoveStatus = MirrorStatus & { secret: string | null };

const moveSyncUrl = (): string => `${NEW_ORIGIN.replace(/^http/, 'ws')}/sync`;

export class GroupMove {
	private provider: MirrorProvider | null = null;
	private destroyed = false;
	private state: MoveStatus = { phase: 'connecting', problem: null, secret: null };
	private listeners = new Set<(status: MoveStatus) => void>();

	constructor(private doc: Y.Doc, private persistence: RoomPersistence | undefined, private v2Secret: string) {
		this.start();
	}

	get snapshot(): MoveStatus { return this.state; }

	onStatusChange(listener: (status: MoveStatus) => void): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => this.listeners.delete(listener);
	}

	retry(): void {
		if (this.provider) this.provider.retry();
		else this.start();
	}

	destroy(): void {
		this.destroyed = true;
		this.provider?.destroy();
		this.listeners.clear();
	}

	/** Waits for the phone's stored copy of the group, so the first upload is the whole group. */
	private start(): void {
		this.setState({ phase: 'connecting', problem: null });
		Promise.all([this.persistence?.ready, deriveMovedSecret(this.v2Secret)]).then(([, secret]) => {
			if (this.destroyed) return;
			const isPartial = () => this.persistence?.state.partial === true;
			this.provider = new MirrorProvider(this.doc, moveSyncUrl(), secret, isPartial);
			this.setState({ secret });
			this.provider.onStatusChange((status) => {
				if (status.phase === 'synced') markMoved(this.doc);
				this.setState(status);
			});
		}).catch((error) => {
			console.error('Could not start moving this group', error);
			this.setState({ phase: 'error', problem: 'storage' });
		});
	}

	private setState(patch: Partial<MoveStatus>): void {
		this.state = { ...this.state, ...patch };
		for (const listener of this.listeners) listener(this.state);
	}
}
