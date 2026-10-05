<script lang="ts">
	import { getContext } from 'svelte';
	import { slide } from 'svelte/transition';
	import { describeSync } from '$lib/sync/describe';
	import type { RoomState } from '$lib/sync/useRoom.svelte';
	import SyncIcon from './SyncIcon.svelte';

	/** Appears while this phone is still fetching the latest changes (the data on screen may be
	 *  slightly behind), or when there is something to act on: a sync that stays broken, a missing
	 *  invite, or an expense edited in two places. Healthy and offline states stay in the app bar. */
	let { conflicts = false }: { conflicts?: boolean } = $props();

	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const room = $derived(context?.room);
	const view = $derived(room ? describeSync(room.sync, room.local, 0, { demo: room.handle.roomId === 'DEMO' }) : null);
	const message = $derived(view?.banner ?? null);

	// A short blip shouldn't flash a banner; wait before announcing a problem.
	let visible = $state(false);
	$effect(() => {
		if (!message) { visible = false; return; }
		if (visible) return;
		const timer = setTimeout(() => (visible = true), view?.state === 'local' ? 0 : 1500);
		return () => clearTimeout(timer);
	});

	// Data shows straight away; only say we're updating it if that takes more than a moment.
	const updating = $derived(view?.tone === 'busy' && room?.sync.checking === true);
	let showUpdating = $state(false);
	$effect(() => {
		if (!updating) { showUpdating = false; return; }
		const timer = setTimeout(() => (showUpdating = true), 700);
		return () => clearTimeout(timer);
	});

	const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const motion = { duration: reduced ? 0 : 200 };
	const pendingReview = $derived(conflicts && room ? room.conflicts : []);
</script>

{#if room}
	{#if showUpdating && !(visible && message)}
		<div class="banner" data-kind="busy" role="status" transition:slide={motion}>
			<span class="icon busy"><SyncIcon tone="busy" /></span>
			<span class="message">Getting the latest changes…</span>
		</div>
	{/if}
	{#if visible && message}
		<div class="banner" data-kind="warn" role="status" transition:slide={motion}>
			<span class="icon"><SyncIcon tone="warn" /></span>
			<span class="message">{message}</span>
			{#if view?.retry}
				<button class="action" type="button" onclick={() => room.handle.syncProvider?.retry()}>Try again</button>
			{/if}
		</div>
	{/if}
	{#if pendingReview.length}
		<a class="banner review" href="/p/{room.handle.roomId}/expenses/{pendingReview[0].id}" transition:slide={motion}>
			<span class="icon"><SyncIcon tone="warn" /></span>
			<span class="message">{pendingReview.length === 1 ? '1 expense was edited on two phones' : `${pendingReview.length} expenses were edited on two phones`}</span>
			<span class="action">Review</span>
		</a>
	{/if}
{/if}

<style>
	.banner {
		display: flex; align-items: center; gap: 10px; margin: 0 22px 10px; padding: 9px 8px 9px 12px; flex-shrink: 0;
		border-radius: var(--radius-sm); background: color-mix(in oklab, var(--warn) 11%, transparent);
		color: var(--ink); font-size: 13px; line-height: 1.35; text-decoration: none;
	}
	.icon { width: 18px; height: 18px; padding: 4px; box-sizing: border-box; border-radius: 50%; flex-shrink: 0; background: var(--warn); color: #1a1100; }
	.message { flex: 1; min-width: 0; }
	.banner[data-kind='busy'] { padding-block: 8px; background: color-mix(in oklab, var(--ink) 6%, transparent); color: var(--ink-2); font-size: 12.5px; }
	.icon.busy { width: 14px; height: 14px; padding: 0; margin: 0 2px; background: none; color: var(--accent); }
	.action {
		flex-shrink: 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-weight: 600;
		padding: 6px 8px; border-radius: 999px; cursor: pointer; transition: background-color 140ms;
	}
	.action:hover, .action:focus-visible { background: color-mix(in oklab, var(--ink) 9%, transparent); }
	.review { transition: background-color 140ms; }
	.review:hover { background: color-mix(in oklab, var(--warn) 17%, transparent); }
</style>
