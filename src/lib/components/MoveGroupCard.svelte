<script lang="ts">
	import { getContext } from 'svelte';
	import { backupFile, saveFile } from '$lib/io/exportFiles';
	import { APP_HOST, canRetryMove, exportWarning, moveStage, NEW_ORIGIN, newInviteLink, openOnNewSiteLink, RETIREMENT_DATE } from '$lib/migration';
	import { getCurrentMember } from '$lib/storage';
	import type { RoomState } from '$lib/sync/useRoom.svelte';

	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const room = $derived(context?.room);
	const v3Secret = $derived(room?.move?.secret ?? null);
	const currentStage = $derived(room?.move ? moveStage(room.move, room.sync) : null);
	// every edit sends both copies through a quick sync again; once ready, the button stays unless the copy fails
	let wasReady = $state(false);
	$effect(() => { if (currentStage === 'ready') wasReady = true; });
	const stage = $derived(wasReady && currentStage !== 'failed' ? 'ready' : currentStage);
	const warning = $derived(room ? exportWarning(room.sync, room.local) : null);
	let copied = $state(false);

	function exportBackup() {
		if (room?.project) saveFile(backupFile(room.project, room.members, room.expenses));
	}

	async function copyInvite() {
		if (!v3Secret) return;
		const link = newInviteLink(v3Secret);
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			window.prompt('Copy this invite link', link);
		}
	}
</script>

{#if room?.project && stage}
	<section class="move" data-move-card data-move-stage={stage} role="status">
		{#if stage === 'ready' && v3Secret}
			<p class="lead">This group is ready on {APP_HOST}</p>
			<p class="body">
				Everything came along, history included. Changes made here keep reaching it until {RETIREMENT_DATE}, and everyone
				in the group gets this same button.
			</p>
			<div class="actions">
				<a class="btn btn-primary" href={openOnNewSiteLink(v3Secret, getCurrentMember(room.handle.roomId))}>Open on {APP_HOST}</a>
				<button type="button" class="btn" onclick={copyInvite}>{copied ? 'Copied' : 'Copy invite link'}</button>
			</div>
		{:else if stage === 'failed'}
			<p class="lead">This group couldn’t move by itself</p>
			<p class="body">Export a backup and restore it on {APP_HOST}{room.move && canRetryMove(room.move) ? ', or try again' : ''}.</p>
			{#if warning}<p class="warning" role="alert">{warning}</p>{/if}
			<div class="actions">
				{#if room.move && canRetryMove(room.move)}
					<button type="button" class="btn btn-primary" onclick={() => room.handle.move?.retry()}>Try again</button>
				{/if}
				<button type="button" class="btn" onclick={exportBackup}>{warning ? 'Export anyway' : 'Export backup'}</button>
				<a class="btn" href="{NEW_ORIGIN}/restore">Restore on {APP_HOST}</a>
			</div>
		{:else if stage === 'waiting'}
			<p class="lead">Waiting to reach {APP_HOST}</p>
			<p class="body">This group moves by itself as soon as this phone can reach {APP_HOST}. Keep this page open, or come back later.</p>
		{:else}
			<p class="lead">Moving this group to {APP_HOST}…</p>
			<p class="body">Nothing to do, it only takes a moment.</p>
		{/if}
	</section>
{/if}

<style>
	.move { margin: 0 22px 10px; padding: 12px; border-radius: var(--radius-sm); background: color-mix(in oklab, var(--warn) 11%, transparent); color: var(--ink); font-size: 13px; line-height: 1.4; }
	.lead { margin: 0 0 4px; font-weight: 600; }
	.body, .warning { margin: 0 0 8px; }
	.body:last-child { margin-bottom: 0; }
	.warning { font-weight: 600; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
