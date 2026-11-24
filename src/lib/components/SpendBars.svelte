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

	let pickedStart = $state<number | null>(null);
	const peak = $derived(series.buckets.reduce<SpendBucket | null>((best, b) => (b.total > (best?.total ?? 0) ? b : best), null));
	// a pick from an earlier filter no longer exists once the series changes
	const picked = $derived(series.buckets.find((b) => b.start === pickedStart) ?? null);
	const shown = $derived(picked ?? peak);
</script>

<div class="card spend-card">
	<div class="row between spend-head">
		<div class="eyebrow">Over time</div>
		<div class="dim mono spend-size">{sizeLabel[series.size]}</div>
	</div>
	<div class="spend-bars">
		{#each series.buckets as b (b.start)}
			{@const heightPct = (b.total / max) * 100}
			<button
				type="button"
				class="spend-col"
				aria-label={describe(b)}
				aria-pressed={shown?.start === b.start}
				onclick={() => (pickedStart = b.start)}
			>
				<span class="spend-bar" class:on={shown?.start === b.start} style="height: max(2px, {heightPct}%);"></span>
			</button>
		{/each}
	</div>
	<div class="row between spend-axis" aria-hidden="true">
		{#each axisLabels as label, i (i)}<span>{label}</span>{/each}
	</div>
	{#if shown}
		<div class="row between spend-caption" aria-live="polite">
			<span>
				<span class="dim">{picked ? '' : 'Busiest: '}{formatBucket(shown.start, series.size)}</span>
				<span class="num spend-caption-amount">{formatAmount(shown.total, symbol, currency)}</span>
			</span>
			{#if series.size === 'month'}
				<button type="button" class="spend-only" onclick={() => onPickMonth(shown.start)}>Show only this month</button>
			{/if}
		</div>
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

	.spend-col {
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.spend-col:focus-visible {
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

	.spend-bar.on {
		background: var(--accent);
	}

	@media (hover: hover) {
		.spend-col:hover .spend-bar:not(.on) {
			background: var(--ink-3);
		}
	}

	.spend-axis {
		margin-top: 8px;
		color: var(--ink-3);
		font-size: 10px;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
	}

	.spend-caption {
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
		gap: 10px;
		flex-wrap: wrap;
		font-size: 13px;
	}

	.spend-caption-amount {
		margin-left: 6px;
		font-weight: 600;
	}

	.spend-only {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
</style>
