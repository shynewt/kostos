<script lang="ts">
	import { page } from '$app/state';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import SyncBanner from '$lib/components/SyncBanner.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import { updateProjectMetadata } from '$lib/storage';
	import { provideRoomContext, useRoom } from '$lib/sync/useRoom.svelte';
	let { children } = $props();
	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	provideRoomContext(() => room);
	let loadedRoomId = $state('');
	let localError = $state(false);
	$effect(() => room.observe());
	$effect(() => {
		const id = roomId;
		let disposed = false;
		localError = false;
		room.handle.ready.then(() => { if (!disposed) loadedRoomId = id; }).catch(() => { if (!disposed) localError = true; });
		return () => { disposed = true; };
	});
	$effect(() => {
		const project = room.project;
		if (project) updateProjectMetadata(roomId, { name: project.name, emoji: project.emoji, color: project.color, lastActiveAt: Date.now() });
	});
</script>

{#if loadedRoomId === roomId && room.project}
	{@render children()}
{:else if localError}
	<div class="screen">
		<header class="app-bar"><a href="/" class="btn btn-ghost">Back to groups</a><SyncStatus variant="dot" /></header>
		<SyncBanner />
		<div class="scroll"><p>Saved group data couldn’t be opened on this device. Keep this app open and try again.</p><button class="btn" onclick={() => location.reload()}>Try again</button></div>
	</div>
{:else if loadedRoomId === roomId && ['error', 'offline', 'synced', 'local'].includes(room.sync.phase)}
	<div class="screen">
		<header class="app-bar"><a href="/" class="btn btn-ghost">Back to groups</a><SyncStatus variant="dot" /></header>
		<SyncBanner />
		<div class="scroll">
			{#if room.handle.legacy}
				<p>This group was made with an older version of Kostos and no longer syncs. This device has no saved data for it, so it can’t be opened.</p>
			{:else}
				<p>No saved group data is available here yet. Open the full invite link to reach the group.</p>
			{/if}
		</div>
	</div>
{:else}
	<LoadingScreen label="Loading your group…" hint="Opening saved data and checking for new expenses." />
{/if}
