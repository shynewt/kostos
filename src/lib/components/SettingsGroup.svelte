<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		heading?: string;
		count?: number;
		footnote?: string;
		footnoteId?: string;
		children: Snippet;
	};

	let { heading, count, footnote, footnoteId, children }: Props = $props();
</script>

<section class="settings-group">
	{#if heading}
		<h2 class="group-heading">
			<span>{heading}</span>
			{#if count !== undefined}<span class="group-count">{count}</span>{/if}
		</h2>
	{/if}
	<div class="group-list">
		{@render children()}
	</div>
	{#if footnote}
		<p class="group-footnote" id={footnoteId}>{footnote}</p>
	{/if}
</section>

<style>
	.settings-group {
		margin-top: 24px;
	}

	.group-heading {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 0 4px 8px;
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		color: var(--ink-2);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.group-count {
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}

	.group-list {
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 18px;
		overflow: hidden;
	}

	.group-list > :global(* + *) {
		border-top: 1px solid var(--line);
	}

	.group-footnote {
		margin: 8px 4px 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--ink-3);
		text-wrap: pretty;
	}
</style>
