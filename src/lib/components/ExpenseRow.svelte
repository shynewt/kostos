<script lang="ts">
	import { expenseShares } from '$lib/balance';
	import { currencySymbolFor } from '$lib/currencies';
	import { expenseInBase } from '$lib/currency-convert';
	import { formatAmount, formatSigned } from '$lib/money';
	import type {
		Category,
		Expense,
		Member,
		PaymentMethodItem,
		Trip
	} from '$lib/types';
	import Highlight from './Highlight.svelte';

	type Props = {
		expense: Expense;
		href: string;
		membersById: Map<string, Member>;
		categoryById: Map<string, Category>;
		methodById: Map<string, PaymentMethodItem>;
		tripsById?: Map<string, Trip>;
		currentMemberId: string | null;
		symbol: string;
		currency: string;
		totalMembers: number;
		showDate?: boolean;
		showInvolvedCount?: boolean;
		query?: string;
		conflict?: boolean;
	};

	let {
		expense,
		href,
		membersById,
		categoryById,
		methodById,
		tripsById,
		currentMemberId,
		symbol,
		currency,
		totalMembers,
		showDate = true,
		showInvolvedCount = true,
		query = '',
		conflict = false
	}: Props = $props();

	const category = $derived(
		expense.categoryId ? categoryById.get(expense.categoryId) : undefined
	);
	const method = $derived(
		expense.paymentMethodId ? methodById.get(expense.paymentMethodId) : undefined
	);
	const trip = $derived(
		expense.tripId && tripsById ? tripsById.get(expense.tripId) : undefined
	);

	function payerName(id: string): string {
		const m = membersById.get(id);
		if (!m) return '—';
		return m.id === currentMemberId ? 'You' : m.name;
	}

	const payersLabel = $derived.by(() => {
		if (expense.payments.length === 0) return '—';
		const first = payerName(expense.payments[0].memberId);
		const verb = expense.payments[0].memberId === currentMemberId ? 'paid' : 'paid';
		if (expense.payments.length === 1) return `${first} ${verb}`;
		if (expense.payments.length === 2) {
			return `${first} & ${payerName(expense.payments[1].memberId)} ${verb}`;
		}
		return `${first} + ${expense.payments.length - 1} others ${verb}`;
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
			{#if conflict}
				<span class="review-dot" role="img" aria-label="Edited on two phones. Needs review"></span>
			{/if}
			{#if expense.isSettlement}
				<span class="sticker mode-sticker settle-sticker">SETTLEMENT</span>
			{:else if expense.splitMode === 'shares'}
				<span class="sticker mode-sticker">SHARES</span>
			{:else if expense.splitMode === 'amount'}
				<span class="sticker mode-sticker">AMOUNTS</span>
			{/if}
		</span>
		<span class="dim mono row-meta">
			{#if showDate}<span>{shortDate(expense.date)}</span><span class="dot">·</span>{/if}
			<span><Highlight text={payersLabel} {query} /></span>
			{#if method}
				<span class="dot">·</span>
				<span class="row-method" title={method.name}>{method.emoji}</span>
			{/if}
			{#if trip}
				<span class="dot">·</span>
				<span class="row-trip" title={trip.name}>{trip.emoji}</span>
			{/if}
			{#if showInvolvedCount}
				<span class="dot">·</span>
				<span>{expense.splits.length}/{totalMembers}</span>
			{/if}
		</span>
		{#if noteMatch}
			<span class="dim row-note-match">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 4h14v16H5z" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>
				<Highlight text={noteMatch} {query} />
			</span>
		{/if}
	</span>
	<span class="col row-amount-col">
		<span class="num row-amount">{formatAmount(expense.amount, nativeSymbol, expense.currency)}</span>
		{#if isForeign}
			<span class="dim mono row-base">≈ {formatAmount(baseExpense.amount, symbol, currency)}</span>
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
		padding: 9px 12px;
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

	.settle-sticker {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
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

	.review-dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		flex-shrink: 0;
		background: var(--warn);
	}

	.mode-sticker {
		padding: 2px 6px;
		font-size: 9px;
	}

	.row-meta {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		font-size: 11px;
	}

	.dot {
		opacity: 0.6;
	}

	.row-method,
	.row-trip {
		font-size: 13px;
		line-height: 1;
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
