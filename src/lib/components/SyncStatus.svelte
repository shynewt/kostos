<script lang="ts">
	import { getContext } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { describeSync } from '$lib/sync/describe';
	import type { RoomState } from '$lib/sync/useRoom.svelte';
	import SyncSheet from './SyncSheet.svelte';

	/** `line` replaces the room code under the group name; `dot` is a small marker that
	 *  only appears next to a screen title when something needs attention. */
	let { variant = 'line' }: { variant?: 'line' | 'dot' } = $props();

	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const room = $derived(context?.room);

	let open = $state(false);
	let now = $state(Date.now());
	let trigger = $state<HTMLButtonElement>();
	let settled = $state(false);
	let previousTone: string | null = null;

	const view = $derived(room ? describeSync(room.sync, room.local, now, { demo: room.handle.roomId === 'DEMO' }) : null);
	const text = $derived(view ? (view.label ?? room?.handle.roomId ?? '') : '');

	$effect(() => {
		const tone = view?.tone ?? null;
		const finished = previousTone === 'busy' && tone === 'ok';
		previousTone = tone;
		if (!finished) return;
		settled = true;
		const timer = setTimeout(() => (settled = false), 1100);
		return () => clearTimeout(timer);
	});

	function show() {
		now = Date.now();
		open = true;
	}
	function close() {
		open = false;
		trigger?.focus({ preventScroll: true });
	}
	function retry() {
		room?.handle.syncProvider?.retry();
		close();
	}
	const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

{#if room && view}
	<span class="anchor" data-sync-state={view.state}>
		{#if variant === 'line'}
			<button
				bind:this={trigger}
				class="sync-line"
				class:settled
				type="button"
				data-tone={view.tone}
				aria-label={`${view.headline}. Sync details`}
				aria-haspopup="dialog"
				onclick={show}
			>
				<span class="dot" aria-hidden="true"></span>
				{#key text}
					<span class="text" class:code={view.label === null} in:fade={{ duration: reduced ? 0 : 200 }}>{text}</span>
				{/key}
			</button>
		{:else if view.attention}
			<button
				bind:this={trigger}
				class="marker"
				type="button"
				data-tone={view.tone}
				aria-label={`${view.headline}. Sync details`}
				aria-haspopup="dialog"
				onclick={show}
				transition:scale={{ duration: reduced ? 0 : 180, start: 0.4 }}
			>
				<span class="dot" aria-hidden="true"></span>
			</button>
		{/if}
		{#if open}<SyncSheet {view} onClose={close} onRetry={retry} />{/if}
	</span>
{/if}

<style>
	.anchor { display: contents; }
	.sync-line {
		display: inline-flex; align-items: center; gap: 6px; max-width: 100%; align-self: flex-start;
		margin: 0 0 0 -6px; padding: 3px 8px 3px 6px; border: 0; border-radius: 999px; background: transparent; cursor: pointer;
		font: inherit; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em; color: var(--ink-3);
		transition: background-color 160ms, color 160ms;
	}
	.sync-line:hover, .sync-line:focus-visible { background: color-mix(in oklab, var(--ink) 7%, transparent); }
	.sync-line:not([data-tone='ok']):not([data-tone='idle']) { color: var(--ink-2); }
	.text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	.dot {
		position: relative; width: 6px; height: 6px; border-radius: 999px; flex-shrink: 0; background: var(--ink-3);
		transition: background-color 240ms, box-shadow 240ms;
	}
	[data-tone='ok'] .dot { background: var(--accent); box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 25%, transparent); }
	[data-tone='busy'] .dot { background: transparent; box-shadow: inset 0 0 0 1.5px var(--accent); animation: breathe 1.4s ease-in-out infinite; }
	[data-tone='warn'] .dot { background: var(--warn); box-shadow: 0 0 0 2px color-mix(in oklab, var(--warn) 25%, transparent); }
	[data-tone='offline'] .dot { background: var(--owe); box-shadow: 0 0 0 2px color-mix(in oklab, var(--owe) 25%, transparent); }
	.settled .dot::after {
		content: ''; position: absolute; inset: -2px; border-radius: inherit; border: 1.5px solid var(--accent);
		animation: ripple 900ms ease-out forwards;
	}

	.marker {
		display: grid; place-items: center; width: 28px; height: 28px; margin-left: 2px; padding: 0; border: 0; border-radius: 999px;
		background: transparent; cursor: pointer; flex-shrink: 0;
	}
	.marker .dot { width: 8px; height: 8px; }
	.marker:hover, .marker:focus-visible { background: color-mix(in oklab, var(--ink) 7%, transparent); }

	@keyframes breathe { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
	@keyframes ripple { from { transform: scale(1); opacity: 0.9; } to { transform: scale(3.2); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) {
		[data-tone='busy'] .dot { animation: none; opacity: 0.7; }
		.settled .dot::after { animation: none; opacity: 0; }
		.sync-line { transition: none; }
	}
</style>
