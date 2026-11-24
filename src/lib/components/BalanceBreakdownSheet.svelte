<script lang="ts">
	import type { BalanceBreakdown } from '$lib/balance-breakdown';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import { formatAmount, formatSigned } from '$lib/money';
	import { plural } from '$lib/plural';

	type Props = {
		breakdown: BalanceBreakdown;
		roomId: string;
		symbol: string;
		currency: string;
		onclose: () => void;
	};

	let { breakdown, roomId, symbol, currency, onclose }: Props = $props();

	const rows = $derived([
		{ label: 'You paid', note: 'towards group expenses', value: breakdown.paid },
		{ label: 'Your share', note: 'your part of each expense', value: -breakdown.share },
		{ label: 'Settlements you paid', note: 'money you sent', value: breakdown.settlementsPaid },
		{ label: 'Settlements you received', note: 'money sent to you', value: -breakdown.settlementsReceived }
	]);

	const resultLabel = $derived(
		breakdown.net > 0 ? 'You’re owed' : breakdown.net < 0 ? 'You owe' : 'You’re settled up'
	);
</script>

<BottomSheet title="How your balance adds up" {onclose}>
	<p class="dim helper">
		{breakdown.expenseCount === 0
			? 'You’re not in any expenses yet.'
			: `Added up in ${currency} from the ${plural(breakdown.expenseCount, 'expense', 'expenses')} you’re in.`}
	</p>

	<dl class="sum">
		{#each rows as row (row.label)}
			<div class="sum-row" class:is-zero={row.value === 0}>
				<dt>
					<span class="sum-label">{row.label}</span>
					<span class="dim sum-note">{row.note}</span>
				</dt>
				<dd class="num">{formatSigned(row.value, symbol, currency)}</dd>
			</div>
		{/each}
		<div class="sum-row sum-result">
			<dt><span class="sum-label">{resultLabel}</span></dt>
			<dd
				class="sum-total"
				class:tone-owed={breakdown.net > 0}
				class:tone-owe={breakdown.net < 0}
			>
				{formatAmount(Math.abs(breakdown.net), symbol, currency)}
			</dd>
		</div>
	</dl>

	{#if breakdown.net === 0}
		<p class="dim settled-note">Nothing to pay or collect.</p>
	{/if}

	<button class="btn btn-primary done" type="button" onclick={onclose}>Done</button>
	<a class="see-expenses" href="/p/{roomId}/expenses">See every expense</a>
</BottomSheet>

<style>
	.helper {
		margin: 6px 0 18px;
		font-size: 13px;
		line-height: 1.5;
		text-align: center;
		text-wrap: balance;
	}

	.sum {
		margin: 0;
		border-top: 1px solid var(--line);
	}

	.sum-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}

	.sum-row dt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.sum-row dd {
		margin: 0;
		flex-shrink: 0;
		font-size: 15px;
	}

	.sum-label {
		font-size: 15px;
	}

	.sum-note {
		font-size: 12px;
	}

	.sum-row.is-zero .sum-label,
	.sum-row.is-zero dd {
		color: var(--ink-3);
	}

	.sum-result {
		border-bottom: 0;
		padding-top: 16px;
		border-top: 1px solid var(--line-2);
		margin-top: -1px;
	}

	.sum-result .sum-label {
		font-weight: 600;
	}

	.sum-total {
		font-family: var(--font-display);
		font-size: 40px;
		line-height: 1;
	}

	.settled-note {
		margin: 0;
		font-size: 13px;
		text-align: center;
	}

	.done {
		margin-top: 20px;
		padding: 12px;
		font-size: 14px;
	}

	.see-expenses {
		align-self: center;
		margin-top: 14px;
		font-size: 13px;
		color: var(--accent);
		text-decoration: none;
	}
</style>
