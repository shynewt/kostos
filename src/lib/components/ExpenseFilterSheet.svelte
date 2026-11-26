<script lang="ts">
	import { untrack } from 'svelte';
	import Avatar from './Avatar.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import { currencyDecimals } from '$lib/currencies';
	import { EMPTY_FILTER, NONE, type ExpenseFilter } from '$lib/expense-filter';
	import { partitionTrips } from '$lib/trips';
	import type { Category, Member, PaymentMethodItem, Trip } from '$lib/types';

	type Props = {
		filter: ExpenseFilter;
		members: Member[];
		categories: Category[];
		methods: PaymentMethodItem[];
		trips: Trip[];
		currencySymbol: string;
		currency: string;
		resultCount: number;
		onChange: (filter: ExpenseFilter) => void;
		onClose: () => void;
	};

	let {
		filter,
		members,
		categories,
		methods,
		trips,
		currencySymbol,
		currency,
		resultCount,
		onChange,
		onClose
	}: Props = $props();

	type ListKey = 'categoryIds' | 'methodIds' | 'payerIds' | 'tripIds';

	function toggle(key: ListKey, id: string) {
		const list = filter[key];
		onChange({ ...filter, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
	}

	const now = new Date();
	const thisYear = now.getUTCFullYear();
	const thisMonth = now.getUTCMonth();
	const isoDay = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
	const datePresets = [
		{ label: 'This month', from: isoDay(thisYear, thisMonth, 1), to: isoDay(thisYear, thisMonth + 1, 0) },
		{ label: 'Last month', from: isoDay(thisYear, thisMonth - 1, 1), to: isoDay(thisYear, thisMonth, 0) },
		{ label: 'This year', from: isoDay(thisYear, 0, 1), to: isoDay(thisYear, 11, 31) },
		{ label: String(thisYear - 1), from: isoDay(thisYear - 1, 0, 1), to: isoDay(thisYear - 1, 11, 31) }
	];

	function toggleDatePreset(preset: { from: string; to: string }) {
		const isOn = filter.from === preset.from && filter.to === preset.to;
		onChange({ ...filter, from: isOn ? null : preset.from, to: isOn ? null : preset.to });
	}

	const scale = $derived(10 ** currencyDecimals(currency));
	const formatCents = (cents: number | null) => (cents === null ? '' : String(cents / scale));
	// seeded once: the sheet opens fresh each time, and the fields own their text while it's open
	let minText = $state(untrack(() => formatCents(filter.minAmount)));
	let maxText = $state(untrack(() => formatCents(filter.maxAmount)));

	function parseCents(text: string): number | null {
		const cleaned = text.trim().replace(',', '.');
		if (!cleaned) return null;
		const value = Number(cleaned);
		return Number.isFinite(value) && value >= 0 ? Math.round(value * scale) : null;
	}

	const tripPartition = $derived(partitionTrips(trips));
	const tripOptions = $derived([...tripPartition.active, ...tripPartition.past]);
</script>

{#snippet pick(isOn: boolean, onclick: () => void, label: string, emoji?: string, member?: Member)}
	<button type="button" class="pick" class:on={isOn} aria-pressed={isOn} {onclick}>
		{#if member}<Avatar {member} size="xs" />{:else if emoji}<span class="pick-emoji" aria-hidden="true">{emoji}</span>{/if}
		<span>{label}</span>
	</button>
{/snippet}

<BottomSheet title="Filter expenses" onclose={onClose}>
	<div class="filters">
		<section class="filter-section" aria-labelledby="filter-date">
			<h3 class="eyebrow section-title" id="filter-date">Date</h3>
			<div class="picks">
				{#each datePresets as preset (preset.label)}
					{@render pick(filter.from === preset.from && filter.to === preset.to, () => toggleDatePreset(preset), preset.label)}
				{/each}
			</div>
			<div class="range">
				<label class="range-field">
					<span class="range-label">From</span>
					<input
						class="input range-input"
						type="date"
						value={filter.from ?? ''}
						max={filter.to ?? undefined}
						onchange={(e) => onChange({ ...filter, from: e.currentTarget.value || null })}
					/>
				</label>
				<label class="range-field">
					<span class="range-label">To</span>
					<input
						class="input range-input"
						type="date"
						value={filter.to ?? ''}
						min={filter.from ?? undefined}
						onchange={(e) => onChange({ ...filter, to: e.currentTarget.value || null })}
					/>
				</label>
			</div>
		</section>

		<section class="filter-section" aria-labelledby="filter-amount">
			<h3 class="eyebrow section-title" id="filter-amount">Amount</h3>
			<div class="range">
				<label class="range-field">
					<span class="range-label">Min {currencySymbol}</span>
					<input
						class="input range-input"
						inputmode="decimal"
						autocomplete="off"
						placeholder="0"
						bind:value={minText}
						oninput={() => onChange({ ...filter, minAmount: parseCents(minText) })}
					/>
				</label>
				<label class="range-field">
					<span class="range-label">Max {currencySymbol}</span>
					<input
						class="input range-input"
						inputmode="decimal"
						autocomplete="off"
						placeholder="Any"
						bind:value={maxText}
						oninput={() => onChange({ ...filter, maxAmount: parseCents(maxText) })}
					/>
				</label>
			</div>
		</section>

		<section class="filter-section" aria-labelledby="filter-payer">
			<h3 class="eyebrow section-title" id="filter-payer">Paid by</h3>
			<div class="picks">
				{#each members as member (member.id)}
					{@render pick(filter.payerIds.includes(member.id), () => toggle('payerIds', member.id), member.name, undefined, member)}
				{/each}
			</div>
		</section>

		{#if categories.length > 0}
			<section class="filter-section" aria-labelledby="filter-category">
				<h3 class="eyebrow section-title" id="filter-category">Category</h3>
				<div class="picks">
					{#each categories as category (category.id)}
						{@render pick(filter.categoryIds.includes(category.id), () => toggle('categoryIds', category.id), category.name, category.emoji)}
					{/each}
					{@render pick(filter.categoryIds.includes(NONE), () => toggle('categoryIds', NONE), 'No category')}
				</div>
			</section>
		{/if}

		{#if methods.length > 0}
			<section class="filter-section" aria-labelledby="filter-method">
				<h3 class="eyebrow section-title" id="filter-method">Payment method</h3>
				<div class="picks">
					{#each methods as method (method.id)}
						{@render pick(filter.methodIds.includes(method.id), () => toggle('methodIds', method.id), method.name, method.emoji)}
					{/each}
					{@render pick(filter.methodIds.includes(NONE), () => toggle('methodIds', NONE), 'Not set')}
				</div>
			</section>
		{/if}

		{#if tripOptions.length > 0}
			<section class="filter-section" aria-labelledby="filter-trip">
				<h3 class="eyebrow section-title" id="filter-trip">Trip</h3>
				<div class="picks">
					{#each tripOptions as trip (trip.id)}
						{@render pick(filter.tripIds.includes(trip.id), () => toggle('tripIds', trip.id), trip.name, trip.emoji)}
					{/each}
					{@render pick(filter.tripIds.includes(NONE), () => toggle('tripIds', NONE), 'No trip')}
				</div>
			</section>
		{/if}
	</div>

	<div class="sheet-footer">
		<button
			type="button"
			class="btn btn-ghost"
			onclick={() => {
				minText = '';
				maxText = '';
				onChange(EMPTY_FILTER);
			}}
		>
			Clear all
		</button>
		<button type="button" class="btn btn-primary show-btn" onclick={onClose}>
			Show {resultCount} {resultCount === 1 ? 'expense' : 'expenses'}
		</button>
	</div>
</BottomSheet>

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 8px 0 16px;
	}

	.section-title {
		margin: 0 0 8px;
	}

	.picks {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.pick {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 34px;
		padding: 5px 12px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.pick:has(:global(.av)) {
		padding-left: 6px;
	}

	.pick.on {
		background: color-mix(in oklab, var(--accent) 16%, var(--bg-2));
		border-color: var(--accent);
		color: var(--ink);
	}

	.pick-emoji {
		font-size: 14px;
		line-height: 1;
	}

	.range {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 8px;
	}

	.picks + .range {
		margin-top: 10px;
	}

	.section-title + .range {
		margin-top: 0;
	}

	.range-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.range-label {
		font-size: 12px;
		color: var(--ink-3);
	}

	.range-input {
		padding: 10px 12px;
		font-size: 15px;
		min-width: 0;
	}

	.sheet-footer {
		position: sticky;
		bottom: 0;
		display: flex;
		gap: 8px;
		padding: 12px 0 4px;
		background: var(--bg-2);
		border-top: 1px solid var(--line);
	}

	.show-btn {
		flex: 1;
	}
</style>
