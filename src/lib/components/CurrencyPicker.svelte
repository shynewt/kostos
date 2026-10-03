<script lang="ts">
	import { untrack } from 'svelte';
	import {
		POPULAR_COUNT,
		findCurrency,
		searchCurrencies,
		type CurrencyPreset
	} from '$lib/currencies';

	type Props = {
		code: string;
		symbol: string;
		onSelect: (preset: CurrencyPreset) => void;
		onCustom: (symbol: string) => void;
		variant?: 'card' | 'inline';
		label?: string;
		startOpen?: boolean;
		locked?: boolean;
		/** id of the element explaining why the picker is locked */
		describedBy?: string;
	};

	let {
		code,
		symbol,
		onSelect,
		onCustom,
		variant = 'card',
		label = 'Default currency',
		startOpen = false,
		locked = false,
		describedBy
	}: Props = $props();

	let open = $state(untrack(() => startOpen));
	let customSym = $state('');
	let query = $state('');

	const searching = $derived(query.trim().length > 0);
	const results = $derived(searchCurrencies(query));

	const currentName = $derived.by(() => {
		if (code === '—') return 'Custom';
		return findCurrency(code)?.name ?? code;
	});

	function commitCustom() {
		const cleaned = customSym.trim().slice(0, 4);
		if (!cleaned) return;
		onCustom(cleaned);
		customSym = '';
		open = false;
	}

	function selectPreset(p: CurrencyPreset) {
		onSelect(p);
		query = '';
		open = false;
	}
</script>

<div class="currency-picker" data-variant={variant}>
	<button
		type="button"
		class="field field-button"
		aria-expanded={open}
		aria-disabled={locked}
		aria-describedby={describedBy}
		onclick={() => {
			if (!locked) open = !open;
		}}
	>
		<span class="field-icon num" class:long={symbol.length > 2}>{symbol}</span>
		<span class="col field-text">
			<span class="field-label">{label}</span>
			<span class="field-value-static">{code === '—' ? 'Custom' : code} · {currentName}</span>
		</span>
		{#if !locked}
			<span class="field-chevron" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
					<path d="M6 9l6 6 6-6" />
				</svg>
			</span>
		{/if}
	</button>
	{#if open && !locked}
		<div class="currency-search">
			<input
				class="input picker-input"
				type="search"
				bind:value={query}
				placeholder="Search currencies"
				aria-label="Search currencies"
				autocomplete="off"
				spellcheck="false"
			/>
		</div>
		<ul class="currency-list">
			{#each results as p, i (p.code)}
				{#if !searching && (i === 0 || i === POPULAR_COUNT)}
					<li class="currency-group">{i === 0 ? 'Popular' : 'All currencies'}</li>
				{/if}
				<li>
					<button
						type="button"
						class="currency-row"
						class:on={p.code === code}
						onclick={() => selectPreset(p)}
					>
						<span class="currency-sym num" class:long={p.sym.length > 2}>{p.sym}</span>
						<span class="col currency-text">
							<span class="currency-code">{p.code}</span>
							<span class="dim currency-name">{p.name}</span>
						</span>
						{#if p.code === code}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="currency-check"><path d="M5 12l5 5L20 7" /></svg>
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
					bind:value={customSym}
					maxlength="4"
					placeholder="e.g. ₿ or kr"
					autocomplete="off"
				/>
				<button
					type="button"
					class="btn btn-primary picker-apply"
					onclick={commitCustom}
					disabled={!customSym.trim()}
				>
					Use
				</button>
			</div>
			<p class="dim picker-hint">Up to 4 characters.</p>
		</div>
	{/if}
</div>

<style>
	.currency-picker {
		display: flex;
		flex-direction: column;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 12px;
	}

	.field-button {
		width: 100%;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.field-button[aria-disabled='true'] {
		cursor: default;
	}

	.field-icon {
		font-family: var(--font-mono);
		font-size: 18px;
		width: 40px;
		text-align: center;
		font-weight: 700;
		color: var(--accent);
	}

	.field-icon.long {
		font-size: 12px;
	}

	.field-text {
		flex: 1;
		align-items: flex-start;
	}

	.field-label {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.field-value-static {
		font-size: 14px;
		color: var(--ink);
		padding-top: 4px;
	}

	.field-chevron {
		color: var(--ink-3);
		display: grid;
		place-items: center;
	}

	.field-chevron svg {
		width: 18px;
		height: 18px;
	}

	.currency-list {
		list-style: none;
		margin: 0;
		padding: 8px;
		max-height: 320px;
		overflow-y: auto;
	}

	.currency-list li + li:not(.currency-group) {
		border-top: 1px solid var(--line);
	}

	.currency-search {
		display: flex;
		padding: 10px 10px 0;
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
		font-size: 11px;
		font-family: var(--font-mono);
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
		padding: 12px 10px 14px;
		border-top: 1px solid var(--line);
	}

	.picker-custom-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
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
		font-size: 11px;
		font-family: var(--font-mono);
		margin: 8px 0 0;
	}
</style>
