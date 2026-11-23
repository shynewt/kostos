<script lang="ts">
	import { getContext } from 'svelte';
	import { backupFile, saveFile } from '$lib/io/exportFiles';
	import { APP_HOST, canRetryMove, exportWarning, moveStage, NEW_ORIGIN, newInviteLink, openOnNewSiteLink, RETIREMENT_LABEL, retirementNotice, type RetirementNotice } from '$lib/migration';
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
	let notice = $state<RetirementNotice | null>(null);
	$effect(() => { notice = retirementNotice(new Date()); });
	const stopsWorking = $derived.by(() => {
		if (!notice?.urgent) return `on ${RETIREMENT_LABEL}`;
		if (notice.daysLeft === 0) return 'today';
		return `in ${notice.daysLeft} ${notice.daysLeft === 1 ? 'day' : 'days'}`;
	});

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
	<section class="move" class:alert={stage === 'failed' || notice?.urgent} data-move-card data-move-stage={stage} role="status">
		{#if stage === 'ready' && v3Secret}
			<p class="lead">This group now lives on {APP_HOST}</p>
			<p class="body">Everything came along, history included. Keep using it there: this copy stops working {stopsWorking}.</p>
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
			<p class="body">It copies itself with its full history. Nothing to do, it takes a moment.</p>
		{/if}
	</section>
{/if}

<style>
	.move {
		--tone: var(--accent);
		margin: 0 22px 10px; padding: 12px; border: 1px solid color-mix(in oklab, var(--tone) 45%, transparent); border-radius: var(--radius-sm);
		background: color-mix(in oklab, var(--tone) 12%, var(--bg-2)); color: var(--ink); font-size: 13px; line-height: 1.4;
	}
	.move.alert { --tone: var(--warn); }
	.lead { margin: 0 0 4px; font-weight: 600; }
	.body, .warning { margin: 0 0 8px; }
	.body:last-child { margin-bottom: 0; }
	.warning { font-weight: 600; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
