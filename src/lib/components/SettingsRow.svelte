<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One row, whose element follows what it does: `href` navigates, `onopen` opens a sheet
	 * (both show a chevron), `onclick` acts at once, `checked` makes a switch, and none of
	 * them leaves a read-only row.
	 */
	type Props = {
		title: string;
		/** dim text right after the title, e.g. "(you)" */
		detail?: string;
		value?: string;
		icon?: Snippet;
		leading?: Snippet;
		href?: string;
		onopen?: () => void;
		onclick?: () => void;
		checked?: boolean;
		ontoggle?: (checked: boolean) => void;
		tone?: 'default' | 'danger';
		describedBy?: string;
	};

	let {
		title,
		detail,
		value,
		icon,
		leading,
		href,
		onopen,
		onclick,
		checked,
		ontoggle,
		tone = 'default',
		describedBy
	}: Props = $props();

	const hasChevron = $derived(Boolean(href || onopen));
</script>

{#snippet content()}
	{#if leading}
		<span class="row-leading" aria-hidden="true">{@render leading()}</span>
	{:else if icon}
		<span class="row-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				{@render icon()}
			</svg>
		</span>
	{/if}
	<span class="row-title">
		<span class="row-name">{title}</span>{#if detail}{' '}<span class="row-detail">{detail}</span>{/if}
	</span>
	{#if value}<span class="row-value">{value}</span>{/if}
	{#if checked !== undefined}
		<span class="row-switch" data-on={checked} aria-hidden="true"><span class="row-knob"></span></span>
	{:else if hasChevron}
		<svg class="row-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
	{/if}
{/snippet}

{#if checked !== undefined}
	<button
		type="button"
		class="settings-row"
		data-tone={tone}
		role="switch"
		aria-checked={checked}
		aria-describedby={describedBy}
		onclick={() => ontoggle?.(!checked)}
	>
		{@render content()}
	</button>
{:else if href}
	<a class="settings-row" data-tone={tone} {href} aria-describedby={describedBy}>{@render content()}</a>
{:else if onopen || onclick}
	<button
		type="button"
		class="settings-row"
		data-tone={tone}
		aria-haspopup={onopen ? 'dialog' : undefined}
		aria-describedby={describedBy}
		onclick={onopen ?? onclick}
	>
		{@render content()}
	</button>
{:else}
	<div class="settings-row is-static" data-tone={tone} aria-describedby={describedBy}>{@render content()}</div>
{/if}

<style>
	.settings-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 52px;
		padding: 10px 14px;
		background: transparent;
		border: 0;
		color: var(--ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: background-color 120ms;
	}

	.settings-row.is-static {
		cursor: default;
	}

	.settings-row:not(.is-static):active {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}

	@media (hover: hover) {
		.settings-row:not(.is-static):hover {
			background: color-mix(in oklab, var(--ink) 4%, transparent);
		}
	}

	.settings-row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.row-icon,
	.row-leading {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		color: var(--ink-2);
	}

	.row-leading {
		width: auto;
		min-width: 28px;
		height: auto;
	}

	.row-icon svg {
		width: 20px;
		height: 20px;
	}

	.row-title {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-detail {
		font-weight: 400;
		color: var(--ink-3);
	}

	.row-value {
		flex-shrink: 1;
		min-width: 0;
		max-width: 55%;
		font-size: 14px;
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-chevron {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		margin-left: -4px;
		color: var(--ink-3);
	}

	[data-tone='danger'] .row-title,
	[data-tone='danger'] .row-icon {
		color: var(--owe);
	}

	.row-switch {
		position: relative;
		flex-shrink: 0;
		width: 42px;
		height: 24px;
		border-radius: 999px;
		background: var(--line-2);
		transition: background-color 150ms;
	}

	.row-switch[data-on='true'] {
		background: var(--accent);
	}

	.row-knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 999px;
		background: var(--bg);
		transition: transform 150ms;
	}

	.row-switch[data-on='true'] .row-knob {
		transform: translateX(18px);
	}

	@media (prefers-reduced-motion: reduce) {
		.row-switch,
		.row-knob {
			transition: none;
		}
	}
</style>
