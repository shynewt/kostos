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
		/** turns the symbol into a button that opens the currency list */
		onPickCurrency?: () => void;
	};
	let { value = $bindable(), cents, symbol, currency, isExpression, invalid = false, onPickCurrency }: Props = $props();

	const placeholder = $derived((0).toFixed(currencyDecimals(currency)));
	const sizeStep = $derived(value.length > 12 ? 'small' : value.length > 7 ? 'medium' : 'large');
</script>

<div class="amount-block">
	<div class="amount-line" data-size={sizeStep}>
		{#if onPickCurrency}
			<button
				type="button"
				class="currency-chip"
				aria-label="Change currency ({currency})"
				aria-haspopup="dialog"
				onclick={onPickCurrency}
			>
				<span class="amount-symbol" class:long={symbol.length > 2}>{symbol}</span>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
			</button>
		{:else}
			<span class="amount-symbol" class:long={symbol.length > 2}>{symbol}</span>
		{/if}
		<!-- the hidden copy of the text sizes the input, so the amount stays centred as it grows -->
		<label class="amount-sizer" data-value={value || placeholder}>
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
				aria-describedby={isExpression || invalid ? 'amount-result' : undefined}
			/>
		</label>
	</div>
	{#if invalid}
		<p class="amount-result is-invalid" id="amount-result" aria-live="polite">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4L12 4z" /><path d="M12 10v4.5M12 17.2v.1" /></svg>
			{isExpression ? 'Not a valid sum yet' : 'Not a valid amount'}
		</p>
	{:else if isExpression}
		<p class="amount-result num" id="amount-result" aria-live="polite">= {formatAmount(cents, symbol, currency)}</p>
	{/if}
</div>

<style>
	.amount-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px 0 6px;
	}

	/* the empty third column mirrors the symbol's, so the number sits on the centre line;
	   once it is too wide for that, it gives way and the symbol stays in view */
	.amount-line {
		display: grid;
		grid-template-columns: 1fr minmax(0, auto) 1fr;
		align-items: baseline;
		column-gap: 6px;
		width: 100%;
		--amount-size: 64px;
	}

	.amount-line > :first-child {
		justify-self: end;
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

	.currency-chip {
		align-self: center;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		min-height: 36px;
		padding: 4px 7px 4px 11px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: transparent;
		color: var(--ink-3);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.currency-chip:active {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}

	.currency-chip:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.currency-chip .amount-symbol {
		font-size: max(18px, calc(var(--amount-size) * 0.4));
	}

	.currency-chip .amount-symbol.long {
		font-size: 15px;
	}

	.currency-chip svg {
		width: 13px;
		height: 13px;
	}

	.amount-sizer {
		cursor: text;
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
		border-bottom: 2px solid var(--line-2);
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
		color: var(--owe);
		border-bottom-color: var(--owe);
	}

	.amount-result {
		margin: 0;
		font-size: 15px;
		color: var(--ink-2);
	}

	.amount-result.is-invalid {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 500;
		color: var(--owe);
	}

	.amount-result svg {
		width: 15px;
		height: 15px;
	}
</style>
