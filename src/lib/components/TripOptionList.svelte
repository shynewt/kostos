<script lang="ts">
	import TripSheet from './TripSheet.svelte';
	import { partitionTrips } from '$lib/trips';
	import type { Trip } from '$lib/types';

	type Props = {
		trips: Trip[];
		selectedId: string | undefined;
		onSelect: (id: string | undefined) => void;
		manageHref: string;
	};

	let { trips, selectedId, onSelect, manageHref }: Props = $props();

	let sheetOpen = $state(false);

	const partition = $derived(partitionTrips(trips));
	// The selected trip may be a past one (e.g. backdated expense or edit of a stale tag),
	// so look it up across the whole list, not just active.
	const selected = $derived(trips.find((t) => t.id === selectedId));
	const showSheetEntry = $derived(partition.past.length > 0);

	function pickFromSheet(id: string | null) {
		sheetOpen = false;
		onSelect(id ?? undefined);
	}
</script>

<ul class="option-list" aria-label="Trip">
	<li>
		<button
			type="button"
			class="option"
			class:on={selectedId === undefined}
			aria-pressed={selectedId === undefined}
			onclick={() => onSelect(undefined)}
		>
			<span class="option-emoji dim-tile">—</span>
			<span class="option-name">None</span>
		</button>
	</li>
	{#each partition.active as t (t.id)}
		<li>
			<button
				type="button"
				class="option"
				class:on={t.id === selectedId}
				aria-pressed={t.id === selectedId}
				onclick={() => onSelect(t.id)}
			>
				<span class="option-emoji">{t.emoji}</span>
				<span class="option-name">{t.name}</span>
			</button>
		</li>
	{/each}
	{#if selected && !partition.active.some((t) => t.id === selected.id)}
		<li>
			<button type="button" class="option on" aria-pressed="true" onclick={() => onSelect(selected.id)}>
				<span class="option-emoji">{selected.emoji}</span>
				<span class="option-name">{selected.name} <span class="dim">· past</span></span>
			</button>
		</li>
	{/if}
	{#if showSheetEntry}
		<li>
			<button type="button" class="option manage-link" onclick={() => (sheetOpen = true)}>
				<span class="option-emoji dim-tile">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
						<path d="M5 12h14M13 6l6 6-6 6" />
					</svg>
				</span>
				<span class="option-name">View all trips</span>
			</button>
		</li>
	{/if}
</ul>

<TripSheet
	open={sheetOpen}
	{trips}
	showAllRow={false}
	selectedTripId={selectedId ?? null}
	{manageHref}
	onSelect={pickFromSheet}
	onClose={() => (sheetOpen = false)}
/>

<style>
	.option-list {
		list-style: none;
		margin: 0;
		padding: 0 8px;
	}

	.option-list li + li {
		border-top: 1px solid var(--line);
	}

	.option {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 4px;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.option-emoji {
		width: 28px;
		text-align: center;
		font-size: 18px;
	}

	.option-emoji svg {
		width: 14px;
		height: 14px;
	}

	.dim-tile {
		opacity: 0.4;
	}

	.option-name {
		flex: 1;
		font-size: 14px;
		font-weight: 500;
	}

	.option.on .option-name {
		color: var(--accent);
	}

	.manage-link {
		color: var(--accent);
	}
</style>
