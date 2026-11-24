<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import {
		ALL_TIME,
		isSamePeriod,
		monthOf,
		periodKey,
		periodLabel,
		previousMonthOf,
		yearOf,
		type Period
	} from '$lib/stats';

	type Props = {
		selected: Period;
		/** months that have expenses in the current trip scope, newest first */
		months: Period[];
		now: number;
		onSelect: (period: Period) => void;
		onClose: () => void;
	};

	let { selected, months, now, onSelect, onClose }: Props = $props();

	const presets = $derived<{ title: string; period: Period }[]>([
		{ title: 'All time', period: ALL_TIME },
		{ title: 'This month', period: monthOf(now) },
		{ title: 'Last month', period: previousMonthOf(now) },
		{ title: 'This year', period: yearOf(now) }
	]);
</script>

{#snippet option(title: string, period: Period, sub?: string)}
	{@const isOn = isSamePeriod(period, selected)}
	<button type="button" class="period-row" class:on={isOn} aria-pressed={isOn} onclick={() => onSelect(period)}>
		<span class="row-text">
			<span class="row-title">{title}</span>
			{#if sub}<span class="row-sub">{sub}</span>{/if}
		</span>
		{#if isOn}<span class="row-check" aria-hidden="true">✓</span>{/if}
	</button>
{/snippet}

<BottomSheet title="Show spending for" onclose={onClose}>
	<div class="period-list">
		{#each presets as preset (preset.title)}
			{@render option(
				preset.title,
				preset.period,
				preset.period.kind === 'all' ? undefined : periodLabel(preset.period)
			)}
		{/each}
		{#if months.length > 0}
			<div class="section-label">Months with spending</div>
			{#each months as month (periodKey(month))}
				{@render option(periodLabel(month), month)}
			{/each}
		{/if}
	</div>
</BottomSheet>

<style>
	.period-list {
		margin-top: 8px;
		padding-bottom: 4px;
	}

	.section-label {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 14px 6px 4px;
	}

	.period-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 6px;
		background: transparent;
		border: 0;
		border-radius: 10px;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	@media (hover: hover) {
		.period-row:hover {
			background: color-mix(in oklab, var(--ink) 6%, transparent);
		}
	}

	.period-row.on {
		background: color-mix(in oklab, var(--accent) 16%, transparent);
	}

	.row-text {
		flex: 1;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		min-width: 0;
	}

	.row-title {
		font-size: 14px;
		font-weight: 600;
	}

	.row-sub {
		font-size: 12px;
		color: var(--ink-3);
	}

	.row-check {
		color: var(--accent);
		font-size: 16px;
		font-weight: 700;
		padding-right: 4px;
	}
</style>
