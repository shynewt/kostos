<script lang="ts">
	import { mathInput } from '$lib/actions/mathInput';
	import { currencyDecimals } from '$lib/currencies';
	import { formatAmount } from '$lib/money';

	type Props = {
		value: string;
		cents: number;
		symbol: string;
		currency: string;
		isExpression: boolean;
		invalid?: boolean;
	};
	let { value = $bindable(), cents, symbol, currency, isExpression, invalid = false }: Props = $props();

	const placeholder = $derived((0).toFixed(currencyDecimals(currency)));
	const sizeStep = $derived(value.length > 12 ? 'small' : value.length > 7 ? 'medium' : 'large');
</script>

<div class="amount-block">
	<label class="amount-line" data-size={sizeStep}>
		<span class="amount-symbol" class:long={symbol.length > 2}>{symbol}</span>
		<!-- the hidden copy of the text sizes the input, so the amount stays centred as it grows -->
		<span class="amount-sizer" data-value={value || placeholder}>
			<input
				class="amount-input"
				size="1"
				bind:value
				use:mathInput
				{placeholder}
				inputmode="decimal"
				autocomplete="off"
				aria-label="Amount, accepts math expressions"
				aria-invalid={invalid}
				aria-describedby={isExpression ? 'amount-result' : undefined}
			/>
		</span>
	</label>
	{#if isExpression}
		<p class="amount-result num" id="amount-result" aria-live="polite">
			{invalid ? 'Not a valid sum yet' : `= ${formatAmount(cents, symbol, currency)}`}
		</p>
	{/if}
</div>

<style>
	.amount-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 28px 0 6px;
	}

	.amount-line {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
		max-width: 100%;
		cursor: text;
		--amount-size: 64px;
	}

	.amount-line[data-size='medium'] {
		--amount-size: 46px;
	}

	.amount-line[data-size='small'] {
		--amount-size: 32px;
	}

	.amount-symbol {
		flex: none;
		font-family: var(--font-display);
		font-size: calc(var(--amount-size) * 0.5);
		line-height: 1;
		color: var(--ink-2);
	}

	.amount-symbol.long {
		font-family: var(--font-sans);
		font-size: 18px;
		font-weight: 600;
	}

	.amount-sizer {
		display: inline-grid;
		min-width: 0;
		max-width: 100%;
	}

	.amount-sizer::after,
	.amount-input {
		grid-area: 1 / 1;
		font-family: var(--font-display);
		font-size: var(--amount-size);
		line-height: 1.1;
		letter-spacing: -0.02em;
		padding: 0 2px;
	}

	.amount-sizer::after {
		content: attr(data-value);
		visibility: hidden;
		white-space: pre;
		overflow: hidden;
	}

	.amount-input {
		width: 100%;
		min-width: 1ch;
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		outline: none;
		color: var(--accent);
		text-align: center;
		transition: border-color 0.12s ease;
	}

	.amount-input::placeholder {
		color: var(--accent);
		opacity: 0.35;
	}

	.amount-input:focus-visible {
		border-bottom-color: color-mix(in oklab, var(--accent) 45%, transparent);
	}

	.amount-input[aria-invalid='true'] {
		border-bottom-color: var(--owe);
	}

	.amount-result {
		margin: 0;
		font-size: 15px;
		color: var(--ink-2);
	}
</style>
