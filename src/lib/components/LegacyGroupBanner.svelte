<script lang="ts">
	import { backupFile, saveFile } from '$lib/io/exportFiles';
	import { LEGACY_GROUP_SUMMARY } from '$lib/legacy';
	import { useRoomContext } from '$lib/sync/useRoom.svelte';

	const context = useRoomContext();
	const room = $derived(context?.room);

	function exportBackup() {
		if (room?.project) saveFile(backupFile(room.project, room.members, room.expenses));
	}
</script>

{#if room?.handle.legacy}
	<section class="legacy" data-legacy-banner aria-labelledby="legacy-banner-lead">
		<p class="lead" id="legacy-banner-lead">This group no longer syncs.</p>
		<p class="body">
			{LEGACY_GROUP_SUMMARY} One person does this, then shares the new invite link. The restore keeps members, categories,
			payment methods, trips and expenses, but drops the activity log and conflict history, and everyone picks who they are again.
		</p>
		<p class="body"><strong>Don’t add expenses or record payments here. They won’t carry over to the new group.</strong></p>
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
	.body { margin: 0 0 8px; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
