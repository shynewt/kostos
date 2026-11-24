<script lang="ts">
	import { formatAmount } from '$lib/money';
	import type { BucketSize, SpendBucket, SpendSeries } from '$lib/stats';

	type Props = {
		series: SpendSeries;
		symbol: string;
		currency: string;
		onPickMonth: (monthStart: number) => void;
	};

	let { series, symbol, currency, onPickMonth }: Props = $props();

	const max = $derived(Math.max(1, ...series.buckets.map((b) => b.total)));
	const sizeLabel: Record<BucketSize, string> = { day: 'By day', week: 'By week', month: 'By month' };

	// bucket starts are UTC midnights, see $lib/stats
	function formatBucket(start: number, size: BucketSize): string {
		if (size === 'month') {
			return new Date(start).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
		}
		const day = new Date(start).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		});
		return size === 'week' ? `Week of ${day}` : day;
	}

	function formatAxis(start: number, size: BucketSize): string {
		const options: Intl.DateTimeFormatOptions =
			size === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' };
		return new Date(start).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
	}

	const axisLabels = $derived.by(() => {
		const buckets = series.buckets;
		if (buckets.length === 0) return [];
		const picks = buckets.length < 3 ? [buckets[0], buckets.at(-1)!] : [buckets[0], buckets[Math.floor(buckets.length / 2)], buckets.at(-1)!];
		const unique = [...new Set(picks)];
		return unique.map((b) => formatAxis(b.start, series.size));
	});

	const describe = (b: SpendBucket) => `${formatBucket(b.start, series.size)}: ${formatAmount(b.total, symbol, currency)}`;
</script>

<div class="card spend-card">
	<div class="row between spend-head">
		<div class="eyebrow">Over time</div>
		<div class="dim mono spend-size">{sizeLabel[series.size]}</div>
	</div>
	<div class="spend-bars">
		{#each series.buckets as b (b.start)}
			{@const heightPct = (b.total / max) * 100}
			{@const isPeak = b.total === max && b.total > 0}
			{#if series.size === 'month'}
				<button
					type="button"
					class="spend-col is-month"
					aria-label="{describe(b)}. Show this month"
					title={describe(b)}
					onclick={() => onPickMonth(b.start)}
				>
					<span class="spend-bar" class:peak={isPeak} style="height: max(2px, {heightPct}%);"></span>
				</button>
			{:else}
				<div class="spend-col" role="img" aria-label={describe(b)} title={describe(b)}>
					<span class="spend-bar" class:peak={isPeak} style="height: max(2px, {heightPct}%);"></span>
				</div>
			{/if}
		{/each}
	</div>
	<div class="row between spend-axis" aria-hidden="true">
		{#each axisLabels as label, i (i)}<span>{label}</span>{/each}
	</div>
	{#if series.size === 'month'}
		<p class="dim spend-hint">Tap a month to see just that month.</p>
	{/if}
</div>

<style>
	.spend-card {
		margin-top: 18px;
	}

	.spend-head {
		margin-bottom: 12px;
	}

	.spend-size {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.spend-bars {
		display: flex;
		align-items: stretch;
		gap: 3px;
		height: 96px;
	}

	.spend-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		min-width: 1px;
		height: 100%;
		padding: 0;
		margin: 0;
		background: transparent;
		border: 0;
		border-radius: 4px;
	}

	.spend-col.is-month {
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.spend-col.is-month:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.spend-bar {
		display: block;
		width: 100%;
		background: var(--line-2);
		border-radius: 3px;
		transition: background 0.12s ease;
	}

	.spend-bar.peak {
		background: var(--accent);
	}

	.spend-col.is-month:hover .spend-bar:not(.peak) {
		background: var(--ink-3);
	}

	.spend-axis {
		margin-top: 8px;
		color: var(--ink-3);
		font-size: 10px;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
	}

	.spend-hint {
		margin: 10px 0 0;
		font-size: 12px;
	}
</style>
