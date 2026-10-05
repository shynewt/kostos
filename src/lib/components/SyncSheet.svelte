<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { SyncView } from '$lib/sync/describe';
	import SyncIcon from './SyncIcon.svelte';

	type Props = { view: SyncView; onClose: () => void; onRetry: () => void };
	let { view, onClose, onRetry }: Props = $props();

	let sheet = $state<HTMLElement>();
	const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ms = (n: number) => (reduced ? 0 : n);

	$effect(() => { sheet?.focus({ preventScroll: true }); });

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={onClose} transition:fade={{ duration: ms(160) }}></div>
<div
	class="sheet"
	role="dialog"
	aria-modal="true"
	aria-labelledby="sync-sheet-title"
	tabindex="-1"
	bind:this={sheet}
	data-tone={view.tone}
	transition:fly={{ y: 48, duration: ms(240), easing: cubicOut, opacity: 0.4 }}
>
	<div class="grabber" aria-hidden="true"></div>
	<div class="head">
		<span class="mark"><SyncIcon tone={view.tone} /></span>
		<div class="titles">
			<h2 id="sync-sheet-title">{view.headline}</h2>
		</div>
	</div>
	<p class="body">{view.body}</p>
	{#if view.facts.length}
		<dl class="facts">
			{#each view.facts as fact (fact.label)}
				<div class="fact"><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
			{/each}
		</dl>
	{/if}
	<div class="actions">
		{#if view.retry}
			<button class="btn btn-primary action" type="button" onclick={onRetry}>Try again</button>
		{:else if view.tone === 'ok'}
			<button class="btn action" type="button" onclick={onRetry}>Check now</button>
		{/if}
		<button class="btn btn-ghost action done" type="button" onclick={onClose}>Close</button>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; background: color-mix(in oklab, black 55%, transparent); z-index: 1100; }
	.sheet {
		position: fixed; left: 0; right: 0; bottom: 0; margin-inline: auto; width: 100%; max-width: 480px;
		background: var(--bg-2); border-radius: 22px 22px 0 0; padding: 6px 22px calc(18px + env(safe-area-inset-bottom, 0px));
		z-index: 1101; outline: none; box-shadow: 0 -14px 40px color-mix(in oklab, black 35%, transparent);
		--tone: var(--accent);
	}
	.sheet[data-tone='warn'] { --tone: var(--warn); }
	.sheet[data-tone='offline'] { --tone: var(--owe); }
	.sheet[data-tone='busy'], .sheet[data-tone='idle'] { --tone: var(--ink-2); }
	.grabber { width: 36px; height: 4px; border-radius: 999px; background: var(--line-2); margin: 6px auto 18px; }
	.head { display: flex; align-items: center; gap: 14px; }
	.mark {
		display: grid; place-items: center; width: 40px; height: 40px; padding: 11px; flex-shrink: 0; border-radius: 50%;
		color: var(--tone); background: color-mix(in oklab, var(--tone) 15%, transparent);
	}
	h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.2; }
	.body { margin: 14px 0 0; font-size: 14px; line-height: 1.55; color: var(--ink-2); max-width: 42ch; }
	.facts { margin: 18px 0 0; padding: 0; }
	.fact { display: flex; justify-content: space-between; gap: 16px; padding: 11px 0; font-size: 13px; }
	.fact + .fact { border-top: 1px solid var(--line); }
	dt { color: var(--ink-3); flex-shrink: 0; }
	dd { margin: 0; text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; }
	.actions { display: flex; flex-direction: column; gap: 6px; margin-top: 18px; }
	.action { width: 100%; padding: 14px; font-size: 15px; }
	.done { color: var(--ink-2); font-weight: 500; }
	.btn-ghost.done:hover { color: var(--ink); }
</style>
