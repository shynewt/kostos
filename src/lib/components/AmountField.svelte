<script lang="ts">
	import { mathInput } from '$lib/actions/mathInput';
	import { currencyDecimals } from '$lib/currencies';

	type Props = {
		value: string;
		cents: number;
		symbol: string;
		currency: string;
		isExpression: boolean;
		invalid?: boolean;
	};
	let { value = $bindable(), cents, symbol, currency, isExpression, invalid = false }: Props = $props();

	const decimals = $derived(currencyDecimals(currency));
	const display = $derived((cents / 10 ** decimals).toFixed(decimals));

	let inputEl = $state<HTMLInputElement | null>(null);
</script>

<button type="button" class="amount-block" onclick={() => inputEl?.focus()} tabindex="-1">
	<span class="eyebrow">Amount</span>
	<span class="amount-display" class:is-zero={cents === 0}>
		<span class="amount-symbol">{symbol}</span><span class="amount-value mono">{display}</span>
	</span>
	<span class="amount-input-wrap" class:is-expression={isExpression}>
		<input
			bind:this={inputEl}
			class="amount-input mono"
			bind:value
			use:mathInput
			placeholder="Type 0.00 or 50/20-2"
			inputmode="decimal"
			autocomplete="off"
			aria-label="Amount, accepts math expressions"
			aria-invalid={invalid}
		/>
		{#if isExpression}
			<span class="amount-input-hint mono" aria-hidden="true">fx</span>
		{/if}
	</span>
</button>

<style>
	.amount-block {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 14px;
		padding: 22px 0 4px;
		background: transparent;
		border: 0;
		width: 100%;
		text-align: center;
		color: inherit;
		font: inherit;
		cursor: text;
	}

	.amount-block .eyebrow {
		align-self: center;
	}

	.amount-display {
		display: inline-flex;
		justify-content: center;
		align-items: baseline;
		gap: 6px;
		transition: opacity 0.15s ease;
	}

	.amount-display.is-zero {
		opacity: 0.4;
	}

	.amount-symbol {
		font-family: var(--font-display);
		font-size: 30px;
		color: var(--ink-2);
		line-height: 1;
	}

	.amount-value {
		font-family: var(--font-display);
		font-size: 64px;
		line-height: 1;
		letter-spacing: -0.02em;
		color: var(--accent);
	}

	.amount-input-wrap {
		position: relative;
		align-self: center;
		width: 100%;
		max-width: 320px;
	}

	.amount-input {
		width: 100%;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		padding: 12px 14px;
		font-size: 15px;
		text-align: center;
		letter-spacing: 0.04em;
		outline: none;
		transition: border-color 0.12s ease, box-shadow 0.12s ease;
	}

	.amount-input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent);
	}

	.amount-input::placeholder {
		color: var(--ink-3);
		letter-spacing: 0.02em;
	}

	.is-expression .amount-input {
		border-color: var(--accent);
		padding-right: 38px;
	}

	.amount-input[aria-invalid='true'] {
		border-color: var(--owe);
	}

	.amount-input-hint {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 10px;
		font-weight: 700;
		color: var(--accent-ink);
		background: var(--accent);
		border-radius: 6px;
		padding: 2px 6px;
		letter-spacing: 0.08em;
		pointer-events: none;
	}
</style>
