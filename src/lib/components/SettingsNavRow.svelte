<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { href: string; title: string; summary?: string; icon: Snippet };

	let { href, title, summary, icon }: Props = $props();
</script>

<a class="card nav-row" {href}>
	<span class="nav-icon">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			{@render icon()}
		</svg>
	</span>
	<span class="nav-title">{title}</span>
	{#if summary}
		<span class="dim mono nav-summary">{summary}</span>
	{/if}
	<span class="nav-chevron" aria-hidden="true">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 6l6 6-6 6" /></svg>
	</span>
</a>

<style>
	.nav-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
		text-decoration: none;
		color: inherit;
	}

	.nav-row:active {
		background: color-mix(in oklab, var(--accent) 12%, transparent);
	}

	.nav-icon {
		display: inline-flex;
		width: 28px;
		height: 28px;
		align-items: center;
		justify-content: center;
		color: var(--ink-2);
		flex-shrink: 0;
	}

	.nav-icon svg {
		width: 20px;
		height: 20px;
	}

	.nav-title {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 500;
	}

	.nav-summary {
		font-size: 12px;
	}

	.nav-chevron {
		color: var(--ink-3);
	}

	.nav-chevron svg {
		width: 18px;
		height: 18px;
	}
</style>
