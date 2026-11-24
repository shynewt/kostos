<script lang="ts">
	import { POPULAR_COUNT, searchCurrencies, type CurrencyPreset } from '$lib/currencies';
	import BottomSheet from './BottomSheet.svelte';

	type Props = {
		code: string;
		onSelect: (preset: CurrencyPreset) => void;
		onCustom: (symbol: string) => void;
		onclose: () => void;
	};

	let { code, onSelect, onCustom, onclose }: Props = $props();

	let customSymbol = $state('');
	let query = $state('');

	const isSearching = $derived(query.trim().length > 0);
	const results = $derived(searchCurrencies(query));

	function commitCustom() {
		const cleaned = customSymbol.trim().slice(0, 4);
		if (!cleaned) return;
		onCustom(cleaned);
		onclose();
	}

	function selectPreset(preset: CurrencyPreset) {
		onSelect(preset);
		onclose();
	}
</script>

<BottomSheet title="Currency" {onclose}>
	<input
		class="input currency-search"
		type="search"
		bind:value={query}
		placeholder="Search currencies"
		aria-label="Search currencies"
		autocomplete="off"
		spellcheck="false"
	/>
	<!-- a fixed height, so the sheet doesn't jump while the results shrink and grow -->
	<ul class="currency-list">
		{#each results as preset, index (preset.code)}
			{#if !isSearching && (index === 0 || index === POPULAR_COUNT)}
				<li class="currency-group">{index === 0 ? 'Popular' : 'All currencies'}</li>
			{/if}
			<li>
				<button type="button" class="currency-row" class:on={preset.code === code} onclick={() => selectPreset(preset)}>
					<span class="currency-sym num" class:long={preset.sym.length > 2}>{preset.sym}</span>
					<span class="col currency-text">
						<span class="currency-code">{preset.code}</span>
						<span class="dim currency-name">{preset.name}</span>
					</span>
					{#if preset.code === code}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="currency-check" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
					{/if}
				</button>
			</li>
		{:else}
			<li class="dim currency-empty">No match. Try the code, or use a custom symbol below.</li>
		{/each}
	</ul>
	<div class="picker-custom">
		<label class="picker-custom-label" for="currency-custom-input">Or use a custom symbol</label>
		<div class="row gap-6">
			<input
				id="currency-custom-input"
				class="input picker-input mono"
				bind:value={customSymbol}
				maxlength="4"
				placeholder="e.g. ₿ or kr"
				autocomplete="off"
				onkeydown={(event) => {
					if (event.key === 'Enter') commitCustom();
				}}
			/>
			<button type="button" class="btn btn-primary picker-apply" onclick={commitCustom} disabled={!customSymbol.trim()}>
				Use
			</button>
		</div>
		<p class="dim picker-hint">Up to 4 characters.</p>
	</div>
</BottomSheet>

<style>
	.currency-search {
		margin-top: 14px;
		padding: 12px 14px;
		font-size: 15px;
	}

	.currency-list {
		list-style: none;
		margin: 8px -4px 0;
		padding: 0 4px;
		height: min(50dvh, 420px);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.currency-list li + li:not(.currency-group) {
		border-top: 1px solid var(--line);
	}

	.currency-group {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 12px 4px 6px;
	}

	.currency-empty {
		font-size: 13px;
		padding: 12px 4px;
	}

	.currency-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 4px;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.currency-sym {
		width: 36px;
		text-align: center;
		font-size: 16px;
		font-weight: 600;
		color: var(--accent);
	}

	.currency-sym.long {
		font-size: 11px;
	}

	.currency-text {
		flex: 1;
		gap: 2px;
	}

	.currency-code {
		font-size: 14px;
		font-weight: 600;
	}

	.currency-name {
		font-size: 12px;
	}

	.currency-check {
		width: 18px;
		height: 18px;
		color: var(--accent);
	}

	.currency-row.on .currency-code {
		color: var(--accent);
	}

	.picker-custom {
		margin-top: 4px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}

	.picker-custom-label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-2);
		margin-bottom: 8px;
	}

	.picker-input {
		flex: 1;
		padding: 10px 12px;
		font-size: 14px;
	}

	.picker-apply {
		padding: 8px 16px;
		font-size: 13px;
	}

	.picker-apply:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.picker-hint {
		font-size: 12px;
		margin: 8px 0 0;
	}
</style>
