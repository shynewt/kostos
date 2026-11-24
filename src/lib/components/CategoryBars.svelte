<script lang="ts">
	import { formatAmount } from '$lib/money';

	export type CategoryRow = {
		key: string;
		name: string;
		emoji: string;
		amount: number;
		percent: number;
		href: string;
	};

	type Props = {
		rows: CategoryRow[];
		symbol: string;
		currency: string;
	};

	let { rows, symbol, currency }: Props = $props();

	const max = $derived(Math.max(1, ...rows.map((r) => r.amount)));
</script>

<ul class="card category-card">
	{#each rows as row, i (row.key)}
		<li>
			{#if i > 0}<hr class="hairline" />{/if}
			<a class="category-row" href={row.href} aria-label="{row.name}: {formatAmount(row.amount, symbol, currency)}, {row.percent}%. Show these expenses">
				<span class="cat-tile category-emoji" aria-hidden="true">{row.emoji}</span>
				<span class="category-body">
					<span class="category-top">
						<span class="category-name">{row.name}</span>
						<span class="num category-amount">{formatAmount(row.amount, symbol, currency)}</span>
					</span>
					<span class="category-bottom">
						<span class="bar-track category-track">
							<span class="bar-fill category-fill" style="width: {(row.amount / max) * 100}%;"></span>
						</span>
						<span class="dim mono category-percent">{row.percent}%</span>
					</span>
				</span>
				<svg class="category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
			</a>
		</li>
	{/each}
</ul>

<style>
	.category-card {
		list-style: none;
		margin: 0;
		padding: 4px;
	}

	.category-card .hairline {
		margin-left: 64px;
	}

	.category-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 8px 12px 12px;
		color: inherit;
		text-decoration: none;
		border-radius: var(--radius);
		-webkit-tap-highlight-color: transparent;
	}

	/* touch screens keep :hover after a tap, which would leave a row looking selected */
	@media (hover: hover) {
		.category-row:hover {
			background: color-mix(in oklab, var(--ink) 4%, transparent);
		}
	}

	.category-row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.category-emoji {
		font-size: 19px;
	}

	.category-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.category-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}

	.category-name {
		font-size: 14px;
		font-weight: 600;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.category-amount {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 600;
	}

	.category-bottom {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.category-track {
		flex: 1;
		height: 4px;
	}

	.category-fill {
		display: block;
	}

	.category-percent {
		flex-shrink: 0;
		min-width: 32px;
		text-align: right;
		font-size: 11px;
	}

	.category-chevron {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		color: var(--ink-3);
	}
</style>
