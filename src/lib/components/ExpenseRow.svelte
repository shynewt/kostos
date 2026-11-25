<script lang="ts">
	import { expenseShares } from '$lib/balance';
	import { currencySymbolFor } from '$lib/currencies';
	import { expenseInBase } from '$lib/currency-convert';
	import { isIncome } from '$lib/income';
	import { formatAmount, formatSigned } from '$lib/money';
	import type { Category, Expense, Member, Trip } from '$lib/types';
	import Highlight from './Highlight.svelte';

	type Props = {
		expense: Expense;
		href: string;
		membersById: Map<string, Member>;
		categoryById: Map<string, Category>;
		/** omit to hide the trip, e.g. when the list is already filtered to one trip */
		tripsById?: Map<string, Trip>;
		currentMemberId: string | null;
		symbol: string;
		currency: string;
		totalMembers: number;
		showDate?: boolean;
		showInvolvedCount?: boolean;
		query?: string;
		conflict?: boolean;
		repeating?: boolean;
	};

	let {
		expense,
		href,
		membersById,
		categoryById,
		tripsById,
		currentMemberId,
		symbol,
		currency,
		totalMembers,
		showDate = true,
		showInvolvedCount = true,
		query = '',
		conflict = false,
		repeating = false
	}: Props = $props();

	const category = $derived(
		expense.categoryId ? categoryById.get(expense.categoryId) : undefined
	);
	const trip = $derived(
		expense.tripId && tripsById ? tripsById.get(expense.tripId) : undefined
	);

	function payerName(id: string): string {
		const m = membersById.get(id);
		if (!m) return '—';
		return m.id === currentMemberId ? 'You' : m.name;
	}

	const income = $derived(isIncome(expense));
	// money coming in reads as "+€40.00"; a plain minus would look like a correction
	const rowAmount = (cents: number, amountSymbol: string, amountCurrency: string) =>
		income ? formatSigned(-cents, amountSymbol, amountCurrency) : formatAmount(cents, amountSymbol, amountCurrency);

	const payersLabel = $derived.by(() => {
		if (expense.payments.length === 0) return '—';
		const first = payerName(expense.payments[0].memberId);
		if (expense.isSettlement) {
			const recipientId = expense.splits[0]?.memberId;
			if (!recipientId) return `${first} paid`;
			const recipient = recipientId === currentMemberId ? 'you' : payerName(recipientId);
			return `${first} paid ${recipient}`;
		}
		const verb = income ? 'received' : 'paid';
		if (expense.payments.length === 1) return `${first} ${verb}`;
		if (expense.payments.length === 2) {
			return `${first} & ${payerName(expense.payments[1].memberId)} ${verb}`;
		}
		return `${first} + ${expense.payments.length - 1} others ${verb}`;
	});

	const involvedLabel = $derived.by(() => {
		const count = expense.splits.length;
		if (count >= totalMembers) return 'Everyone';
		return `${count} of ${totalMembers} ${totalMembers === 1 ? 'person' : 'people'}`;
	});

	// the row amount stays in the expense's own currency; balance impact is in base so it
	// lines up with the balances/settlement figures.
	const isForeign = $derived(expense.currency !== currency);
	const nativeSymbol = $derived(
		isForeign ? currencySymbolFor(expense.currency) : symbol
	);
	const baseExpense = $derived(expenseInBase(expense, currency));

	const yourImpact = $derived.by(() => {
		if (!currentMemberId) return 0;
		const paid = baseExpense.payments
			.filter((p) => p.memberId === currentMemberId)
			.reduce((sum, p) => sum + p.amount, 0);
		const share = expenseShares(baseExpense).get(currentMemberId) ?? 0;
		return paid - share;
	});

	const inExpense = $derived(
		!!currentMemberId && expense.splits.some((s) => s.memberId === currentMemberId)
	);

	function shortDate(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	const noteMatch = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q || !expense.notes) return null;
		const lower = expense.notes.toLowerCase();
		const idx = lower.indexOf(q);
		if (idx === -1) return null;
		const start = Math.max(0, idx - 24);
		const end = Math.min(expense.notes.length, idx + q.length + 40);
		const prefix = start > 0 ? '…' : '';
		const suffix = end < expense.notes.length ? '…' : '';
		return prefix + expense.notes.slice(start, end) + suffix;
	});
</script>

<a class="expense-row" {href}>
	<span class="cat-tile row-cat" class:is-settlement={expense.isSettlement}>
		{expense.isSettlement ? '🤝' : (category?.emoji ?? '📦')}
	</span>
	<span class="col row-text">
		<span class="row title-row">
			<span class="row-title">
				<Highlight text={expense.description || 'Expense'} {query} />
			</span>
			{#if repeating}
				<svg class="repeat-mark" role="img" aria-label="Repeats" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></svg>
			{/if}
			{#if conflict}
				<span class="review-dot" role="img" aria-label="Edited on two phones. Needs review"></span>
			{/if}
			{#if expense.isSettlement}
				<span class="mode-badge settle-badge">Settlement</span>
			{:else if expense.splitMode === 'shares'}
				<span class="mode-badge">By shares</span>
			{:else if expense.splitMode === 'amount'}
				<span class="mode-badge">By amount</span>
			{/if}
		</span>
		<span class="dim row-meta">
			{#if showDate}<span>{shortDate(expense.date)}</span><span class="dot">·</span>{/if}
			<span><Highlight text={payersLabel} {query} /></span>
			{#if showInvolvedCount && !expense.isSettlement}
				<span class="dot">·</span>
				<span>{involvedLabel}</span>
			{/if}
		</span>
		{#if trip}
			<span class="dim row-trip">{trip.emoji} {trip.name}</span>
		{/if}
		{#if noteMatch}
			<span class="dim row-note-match">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 4h14v16H5z" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>
				<Highlight text={noteMatch} {query} />
			</span>
		{/if}
	</span>
	<span class="col row-amount-col">
		<span class="num row-amount" class:tone-owed={income}>{rowAmount(expense.amount, nativeSymbol, expense.currency)}</span>
		{#if isForeign}
			<span class="dim mono row-base">≈ {rowAmount(baseExpense.amount, symbol, currency)}</span>
		{/if}
		{#if currentMemberId}
			{#if !inExpense && yourImpact === 0}
				<span class="dim mono row-impact">not in</span>
			{:else if yourImpact !== 0}
				<span
					class="num mono row-impact"
					class:tone-owed={yourImpact > 0}
					class:tone-owe={yourImpact < 0}
				>{formatSigned(yourImpact, symbol, currency)}</span>
			{/if}
		{/if}
	</span>
</a>

<style>
	.expense-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 14px;
		text-decoration: none;
		color: inherit;
	}

	.row-cat {
		font-size: 20px;
		flex-shrink: 0;
	}

	.row-cat.is-settlement {
		background: color-mix(in oklab, var(--accent) 16%, transparent);
	}

	.mode-badge {
		flex-shrink: 0;
		padding: 1px 7px;
		border: 1px solid var(--line-2);
		border-radius: 999px;
		font-size: 11px;
		font-weight: 500;
		line-height: 1.5;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.settle-badge {
		background: color-mix(in oklab, var(--accent) 16%, transparent);
		border-color: color-mix(in oklab, var(--accent) 40%, transparent);
		color: var(--ink);
	}

	.row-text {
		flex: 1;
		min-width: 0;
		gap: 2px;
	}

	.title-row {
		align-items: center;
		gap: 6px;
	}

	.row-title {
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.repeat-mark {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		color: var(--ink-2);
	}

	.review-dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		flex-shrink: 0;
		background: var(--warn);
	}

	.row-meta {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		line-height: 1.4;
	}

	.dot {
		opacity: 0.6;
	}

	.row-trip {
		font-size: 12px;
		line-height: 1.4;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-amount-col {
		align-items: flex-end;
		gap: 2px;
		flex-shrink: 0;
	}

	.row-amount {
		font-weight: 600;
		font-size: 14px;
	}

	.row-impact {
		font-size: 11px;
	}

	.row-base {
		font-size: 10px;
	}

	.row-note-match {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		line-height: 1.4;
		margin-top: 2px;
		font-style: italic;
	}

	.row-note-match svg {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		opacity: 0.7;
	}
</style>
