<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import {
		ALL_TIME,
		isSamePeriod,
		last12MonthsOf,
		monthOf,
		periodBounds,
		periodKey,
		periodLabel,
		previousMonthOf,
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
		{ title: 'Last 12 months', period: last12MonthsOf(now) },
		{ title: 'This month', period: monthOf(now) },
		{ title: 'Last month', period: previousMonthOf(now) }
	]);

	const years = $derived.by(() => {
		const groups: { year: Period; months: Period[] }[] = [];
		for (const month of months) {
			if (month.kind !== 'month') continue;
			const last = groups.at(-1);
			if (last?.year.kind === 'year' && last.year.year === month.year) last.months.push(month);
			else groups.push({ year: { kind: 'year', year: month.year }, months: [month] });
		}
		return groups;
	});

	const monthName = (period: Period) =>
		period.kind === 'month'
			? new Date(Date.UTC(period.year, period.month, 1)).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' })
			: periodLabel(period);

	function presetSubtitle(period: Period): string | undefined {
		if (period.kind === 'all') return undefined;
		if (period.kind !== 'last12Months') return periodLabel(period);
		const bounds = periodBounds(period);
		if (!bounds) return undefined;
		return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }).formatRange(
			bounds.start,
			bounds.end - 1
		);
	}
</script>

{#snippet option(title: string, period: Period, sub?: string, isNested = false)}
	{@const isOn = isSamePeriod(period, selected)}
	<button
		type="button"
		class="period-row"
		class:on={isOn}
		class:nested={isNested}
		aria-pressed={isOn}
		aria-label={isNested ? periodLabel(period) : undefined}
		onclick={() => onSelect(period)}
	>
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
				presetSubtitle(preset.period)
			)}
		{/each}
		{#each years as group (periodKey(group.year))}
			<div class="year-group">
				{@render option(periodLabel(group.year), group.year, 'Whole year')}
				{#each group.months as month (periodKey(month))}
					{@render option(monthName(month), month, undefined, true)}
				{/each}
			</div>
		{/each}
	</div>
</BottomSheet>

<style>
	.period-list {
		margin-top: 8px;
		padding-bottom: 4px;
	}

	.year-group {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--line);
	}

	.period-row.nested {
		padding-left: 22px;
	}

	.period-row.nested .row-title {
		font-weight: 500;
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
