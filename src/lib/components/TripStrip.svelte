<script lang="ts">
	import type { Snippet } from 'svelte';
	import { partitionTrips } from '$lib/trips';
	import type { Trip } from '$lib/types';

	type Props = {
		trips: Trip[];
		selectedTripId: string | null;
		expenseCountAll: number;
		expenseCountForTrip: (tripId: string) => number;
		onSelect: (tripId: string | null) => void;
		onOverflowOpen: () => void;
		/** extra chips at the start of the row, outside the trip tabs */
		leading?: Snippet;
	};

	let {
		trips,
		selectedTripId,
		expenseCountAll,
		expenseCountForTrip,
		onSelect,
		onOverflowOpen,
		leading
	}: Props = $props();

	const partition = $derived(partitionTrips(trips));
	const activeTrips = $derived(partition.active);
	const pastCount = $derived(partition.past.length);
	const selectedIsPast = $derived(
		selectedTripId !== null && partition.past.some((t) => t.id === selectedTripId)
	);
</script>

{#if trips.length > 0 || leading}
	<div class="trip-strip">
		{#if leading}
			{@render leading()}
			{#if trips.length > 0}<span class="strip-divider" aria-hidden="true"></span>{/if}
		{/if}
		{#if trips.length > 0}
			<div class="trip-tabs" role="tablist" aria-label="Trips">
				<button
					type="button"
					class="trip-chip"
					class:on={selectedTripId === null}
					role="tab"
					aria-selected={selectedTripId === null}
					onclick={() => onSelect(null)}
				>
					<span class="chip-label">All</span>
					<span class="chip-count mono">{expenseCountAll}</span>
				</button>
				{#each activeTrips as t (t.id)}
					<button
						type="button"
						class="trip-chip"
						class:on={selectedTripId === t.id}
						role="tab"
						aria-selected={selectedTripId === t.id}
						onclick={() => onSelect(t.id)}
					>
						<span class="chip-emoji">{t.emoji}</span>
						<span class="chip-label">{t.name}</span>
						<span class="chip-count mono">{expenseCountForTrip(t.id)}</span>
					</button>
				{/each}
				{#if pastCount > 0 || selectedIsPast}
					<button
						type="button"
						class="trip-chip overflow-chip"
						class:on={selectedIsPast}
						onclick={onOverflowOpen}
						aria-label="Show all trips"
					>
						<span class="chip-label">Past</span>
						<span class="chip-count mono">{pastCount}</span>
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.trip-strip {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding: 4px 0 10px;
		margin: 0 -16px;
		padding-left: 16px;
		padding-right: 16px;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.trip-strip::-webkit-scrollbar {
		display: none;
	}

	.trip-tabs {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}

	.strip-divider {
		width: 1px;
		margin: 4px 2px;
		background: var(--line-2);
		flex-shrink: 0;
	}

	.trip-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-2);
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		flex-shrink: 0;
		text-decoration: none;
		transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
	}

	.trip-chip.on {
		background: color-mix(in oklab, var(--accent) 16%, var(--bg-2));
		border-color: var(--accent);
		color: var(--ink);
	}

	.chip-emoji {
		font-size: 14px;
		line-height: 1;
	}

	.chip-label {
		white-space: nowrap;
	}

	.chip-count {
		font-size: 10px;
		opacity: 0.6;
		padding: 1px 5px;
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		border-radius: 999px;
	}

	.trip-chip.on .chip-count {
		opacity: 0.85;
	}

	.overflow-chip {
		border-style: dashed;
		color: var(--ink-3);
	}

	.overflow-chip.on {
		color: var(--ink);
	}
</style>
