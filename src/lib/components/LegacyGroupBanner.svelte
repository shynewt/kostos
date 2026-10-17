<script lang="ts">
	import { getContext } from 'svelte';
	import { backupFile, saveFile } from '$lib/io/exportFiles';
	import type { RoomState } from '$lib/sync/useRoom.svelte';

	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const room = $derived(context?.room);

	function exportBackup() {
		if (room?.project) saveFile(backupFile(room.project, room.members, room.expenses));
	}
</script>

{#if room?.handle.legacy}
	<section class="legacy" data-legacy-banner role="status">
		<p class="lead">This group no longer syncs.</p>
		<p class="body">
			It was made with an older version of Kostos, so it can’t reach the sync server any more. Everything stays readable here.
			To keep syncing, export a backup and restore it as a new group, then share the new invite link. One person per group does this.
			A restore keeps members, categories, payment methods, trips and expenses. It drops the activity log and conflict history,
			and you pick who you are again.
		</p>
		<div class="actions">
			<button type="button" class="btn btn-primary" onclick={exportBackup} disabled={!room.project}>Export backup</button>
			<a class="btn" href="/restore">Restore as a new group</a>
		</div>
	</section>
{/if}

<style>
	.legacy {
		margin: 0 22px 10px; padding: 12px; border-radius: var(--radius-sm);
		background: color-mix(in oklab, var(--warn) 11%, transparent); color: var(--ink); font-size: 13px; line-height: 1.4;
	}
	.lead { margin: 0 0 4px; font-weight: 600; }
	.body { margin: 0 0 10px; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
