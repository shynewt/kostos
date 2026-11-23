<script lang="ts">
	import { getContext } from 'svelte';
	import { APP_HOST, NEW_ORIGIN, openOnNewSiteLink } from '$lib/migration';
	import { getCurrentMember } from '$lib/storage';
	import type { RoomState } from '$lib/sync/useRoom.svelte';
	import ScreenAppBar from './ScreenAppBar.svelte';

	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const room = $derived(context?.room);
	const openHref = $derived.by(() => {
		const secret = room?.move?.secret;
		return secret && room ? openOnNewSiteLink(secret, getCurrentMember(room.handle.roomId)) : NEW_ORIGIN;
	});
</script>

<div class="screen" data-page="moved-lock">
	<ScreenAppBar title={room?.project?.name ?? 'Group'} backHref="/p/{room?.handle.roomId ?? ''}" />
	<div class="scroll">
		<section class="lock" role="status">
			<p class="lead">This group has moved to {APP_HOST}</p>
			<p class="body">Adding and changing things happens there now. Here you can still look at the group and export a backup.</p>
			<a class="btn btn-primary btn-block" href={openHref}>Open on {APP_HOST}</a>
		</section>
	</div>
</div>

<style>
	.lock {
		margin: 16px 22px; padding: 18px; border: 1px solid color-mix(in oklab, var(--accent) 45%, transparent);
		border-radius: var(--radius); background: color-mix(in oklab, var(--accent) 12%, var(--bg-2)); color: var(--ink);
	}
	.lead { margin: 0 0 6px; font-weight: 600; font-size: 16px; }
	.body { margin: 0 0 14px; color: var(--ink-2); font-size: 14px; line-height: 1.45; }
</style>
