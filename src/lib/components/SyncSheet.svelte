<script lang="ts">
	import type { SyncView } from '$lib/sync/describe';
	import BottomSheet from './BottomSheet.svelte';
	import SyncIcon from './SyncIcon.svelte';

	type Props = { view: SyncView; onClose: () => void; onRetry: () => void };
	let { view, onClose, onRetry }: Props = $props();
</script>

<BottomSheet title={view.headline} onclose={onClose}>
	{#snippet icon()}
		<span class="mark" data-tone={view.tone}><SyncIcon tone={view.tone} /></span>
	{/snippet}
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
</BottomSheet>

<style>
	.mark {
		--tone: var(--accent);
		display: grid; place-items: center; width: 40px; height: 40px; padding: 11px; border-radius: 50%;
		color: var(--tone); background: color-mix(in oklab, var(--tone) 15%, transparent);
	}
	.mark[data-tone='warn'] { --tone: var(--warn); }
	.mark[data-tone='offline'] { --tone: var(--owe); }
	.mark[data-tone='busy'], .mark[data-tone='idle'] { --tone: var(--ink-2); }
	.body { margin: 10px auto 0; font-size: 14px; line-height: 1.55; color: var(--ink-2); max-width: 42ch; text-align: center; text-wrap: balance; }
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
