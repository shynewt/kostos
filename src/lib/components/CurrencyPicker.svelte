<script lang="ts">
	import { findCurrency, type CurrencyPreset } from '$lib/currencies';
	import CurrencySheet from './CurrencySheet.svelte';

	type Props = {
		code: string;
		symbol: string;
		onSelect: (preset: CurrencyPreset) => void;
		onCustom: (symbol: string) => void;
		label?: string;
		locked?: boolean;
		/** id of the element explaining why the picker is locked */
		describedBy?: string;
	};

	let { code, symbol, onSelect, onCustom, label = 'Default currency', locked = false, describedBy }: Props = $props();

	let isOpen = $state(false);

	const currentName = $derived(code === '—' ? 'Custom' : (findCurrency(code)?.name ?? code));
</script>

<div class="currency-picker">
	<button
		type="button"
		class="field field-button"
		aria-haspopup="dialog"
		aria-disabled={locked}
		aria-describedby={describedBy}
		onclick={() => {
			if (!locked) isOpen = true;
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
</div>

{#if isOpen && !locked}
	<CurrencySheet {code} {onSelect} {onCustom} onclose={() => (isOpen = false)} />
{/if}

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

</style>
