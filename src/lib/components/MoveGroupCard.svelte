<script lang="ts">
	import { getContext } from 'svelte';
	import { backupFile, saveFile } from '$lib/io/exportFiles';
	import { exportWarning, NEW_ORIGIN } from '$lib/migration';
	import type { RoomState } from '$lib/sync/useRoom.svelte';

	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const room = $derived(context?.room);
	const warning = $derived(room ? exportWarning(room.sync, room.local) : null);

	function exportBackup() {
		if (room?.project) saveFile(backupFile(room.project, room.members, room.expenses));
	}
</script>

{#if room?.project}
	<section class="move" data-move-card>
		<p class="lead">Moving this group?</p>
		<p class="body">One person per group does it. Check with your group first; if someone already moved it, don’t export, just join their new link.</p>
		{#if warning}<p class="warning" role="alert">{warning}</p>{/if}
		<div class="actions">
			<button type="button" class="btn btn-primary" onclick={exportBackup}>{warning ? 'Export anyway' : 'Export backup'}</button>
			<a class="btn" href="{NEW_ORIGIN}/restore">Restore on the new site</a>
		</div>
	</section>
{/if}

<style>
	.move { margin: 0 22px 10px; padding: 12px; border-radius: var(--radius-sm); background: color-mix(in oklab, var(--warn) 11%, transparent); color: var(--ink); font-size: 13px; line-height: 1.4; }
	.lead { margin: 0 0 4px; font-weight: 600; }
	.body, .warning { margin: 0 0 8px; }
	.warning { font-weight: 600; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
