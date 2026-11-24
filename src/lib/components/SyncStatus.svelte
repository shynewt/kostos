<script lang="ts">
	import { scale } from 'svelte/transition';
	import { useRoomContext } from '$lib/sync/useRoom.svelte';
	import SyncIcon from './SyncIcon.svelte';
	import SyncSheet from './SyncSheet.svelte';

	/** `button` is the header's sync icon; `dot` is a small marker that only appears next
	 *  to a screen title when something needs attention. */
	let { variant = 'button' }: { variant?: 'button' | 'dot' } = $props();

	const context = useRoomContext();
	const room = $derived(context?.room);

	let open = $state(false);
	let now = $state(Date.now());
	let trigger = $state<HTMLButtonElement>();
	let settled = $state(false);
	let previousTone: string | null = null;

	const view = $derived(room ? room.syncView(now) : null);

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
		{#if variant === 'button'}
			<button
				bind:this={trigger}
				class="icon-btn sync-btn"
				class:settled
				type="button"
				data-tone={view.tone}
				aria-label={`Sync status: ${view.label}`}
				title={view.label}
				aria-haspopup="dialog"
				onclick={show}
			>
				<span class="sync-glyph"><SyncIcon tone={view.tone} /></span>
			</button>
		{:else if view.attention}
			<button
				bind:this={trigger}
				class="marker"
				type="button"
				data-tone={view.tone}
				aria-label={`Sync status: ${view.label}`}
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

	.sync-btn {
		position: relative; flex-shrink: 0; color: var(--ink-2);
		transition: color 200ms, border-color 200ms;
	}
	.sync-btn[data-tone='warn'] { color: var(--warn); border-color: color-mix(in oklab, var(--warn) 40%, var(--line)); }
	.sync-btn[data-tone='offline'] { color: var(--owe); border-color: color-mix(in oklab, var(--owe) 40%, var(--line)); }
	.sync-btn[data-tone='idle'] { color: var(--ink-3); }
	.sync-glyph { display: block; width: 18px; height: 18px; }
	.sync-btn[data-tone='busy'] .sync-glyph { width: 15px; height: 15px; }
	.settled::after {
		content: ''; position: absolute; inset: -1px; border-radius: inherit; border: 1.5px solid var(--accent);
		animation: ripple 900ms ease-out forwards; pointer-events: none;
	}

	.marker {
		display: grid; place-items: center; width: 28px; height: 28px; margin-left: 2px; padding: 0; border: 0; border-radius: 999px;
		background: transparent; cursor: pointer; flex-shrink: 0;
	}
	.dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; background: var(--ink-3); }
	[data-tone='warn'] .dot { background: var(--warn); box-shadow: 0 0 0 2px color-mix(in oklab, var(--warn) 25%, transparent); }
	[data-tone='offline'] .dot { background: var(--owe); box-shadow: 0 0 0 2px color-mix(in oklab, var(--owe) 25%, transparent); }
	.marker:focus-visible { background: color-mix(in oklab, var(--ink) 7%, transparent); }
	@media (hover: hover) {
		.marker:hover { background: color-mix(in oklab, var(--ink) 7%, transparent); }
	}

	@keyframes ripple { from { transform: scale(1); opacity: 0.9; } to { transform: scale(1.5); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) {
		.settled::after { animation: none; opacity: 0; }
		.sync-btn { transition: none; }
	}
</style>
