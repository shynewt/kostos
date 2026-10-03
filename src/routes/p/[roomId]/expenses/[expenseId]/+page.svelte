<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { expenseShares } from '$lib/balance';
	import ActivityList from '$lib/components/ActivityList.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import ScreenAppBar from '$lib/components/ScreenAppBar.svelte';
	import { currencySymbolFor } from '$lib/currencies';
	import { expenseBaseAmount, formatRate } from '$lib/currency-convert';
	import { formatAmount, formatSigned } from '$lib/money';
	import { getCurrentMember } from '$lib/storage';
	import { removeExpense } from '$lib/sync/doc';
	import { useRoom } from '$lib/sync/useRoom.svelte';

	const roomId = $derived(page.params.roomId ?? '');
	const expenseId = $derived(page.params.expenseId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const members = $derived(room.members);
	const expenses = $derived(room.expenses);
	let confirmingDelete = $state(false);

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));
	const currencySymbol = $derived(room.currencySymbol);
	const currency = $derived(room.currency);
	const membersById = $derived(room.membersById);
	const expense = $derived(expenses.find((e) => e.id === expenseId));
	const editEvents = $derived(
		room.activity.filter((a) => a.expenseId === expenseId && a.kind === 'expense.edit').reverse()
	);

	// a single expense reads cleanest in its own currency; the base equivalent sits under
	// the hero so it still ties back to the group balances.
	const isForeign = $derived(!!expense && expense.currency !== currency);
	const nativeCurrency = $derived(expense?.currency ?? currency);
	const nativeSymbol = $derived(
		isForeign
			? currencySymbolFor(nativeCurrency)
			: currencySymbol
	);
	const baseAmount = $derived(expense ? expenseBaseAmount(expense, currency) : 0);

	const category = $derived.by(() => {
		if (!expense?.categoryId || !project) return null;
		return project.categories.find((c) => c.id === expense.categoryId) ?? null;
	});

	const paymentMethod = $derived.by(() => {
		if (!expense?.paymentMethodId || !project || project.paymentMethodsEnabled === false) return null;
		return project.paymentMethods.find((m) => m.id === expense.paymentMethodId) ?? null;
	});

	const shares = $derived(expense ? expenseShares(expense) : new Map<string, number>());
	const involvedCount = $derived(expense?.splits.length ?? 0);
	const yourShareCents = $derived.by(() => {
		if (!expense || !currentMemberId) return 0;
		return shares.get(currentMemberId) ?? 0;
	});
	const yourPaidCents = $derived.by(() => {
		if (!expense || !currentMemberId) return 0;
		return expense.payments
			.filter((p) => p.memberId === currentMemberId)
			.reduce((sum, p) => sum + p.amount, 0);
	});
	const yourImpact = $derived(yourPaidCents - yourShareCents);

	function memberLabel(id: string): string {
		const m = membersById.get(id);
		if (!m) return '—';
		return m.id === currentMemberId ? 'You' : m.name;
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, {
			weekday: 'long',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function shareLabelFor(memberId: string): string {
		if (!expense) return '';
		if (expense.splitMode === 'shares') {
			const split = expense.splits.find((s) => s.memberId === memberId);
			const total = expense.splits.reduce((s, x) => s + (x.shares ?? 0), 0);
			const value = split?.shares ?? 0;
			const pct = total > 0 ? Math.round((value / total) * 100) : 0;
			return `${value} share${value === 1 ? '' : 's'} · ${pct}%`;
		}
		if (expense.splitMode === 'amount') {
			return 'manual amount';
		}
		const pct = involvedCount > 0 ? Math.round((1 / involvedCount) * 100) : 0;
		return `even · ${pct}%`;
	}

	function onDelete() {
		if (!expense) return;
		if (!confirmingDelete) {
			confirmingDelete = true;
			return;
		}
		removeExpense(handle, expense.id);
		goto(`/p/${roomId}/expenses`);
	}

	function onEdit() {
		if (!expense) return;
		goto(`/p/${roomId}/expenses/${expense.id}/edit`);
	}
</script>

<svelte:head>
	<title>{expense?.description ?? 'Expense'} · Kostos</title>
</svelte:head>

<div class="screen" data-page="expense-detail">
	<ScreenAppBar title="Expense" backHref="/p/{roomId}/expenses">
		{#snippet right()}
			<button class="icon-btn" type="button" onclick={onEdit} aria-label="Edit" disabled={!expense}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h4l11-11-4-4L4 16v4zM14 6l4 4" /></svg>
			</button>
		{/snippet}
	</ScreenAppBar>

	{#if !expense}
		<div class="scroll empty-detail">
			<div class="card">
				<p class="muted">Expense not found. It may have been deleted on another device.</p>
				<a href="/p/{roomId}/expenses" class="btn btn-block back-btn">Back to expenses</a>
			</div>
		</div>
	{:else}
		<div class="scroll">
			<section class="hero">
				<div class="row gap-12 hero-top">
					<span class="cat-tile hero-icon">{category?.emoji ?? '📦'}</span>
					<div class="col">
						<div class="eyebrow">{category?.name ?? 'Uncategorised'} · {formatDate(expense.date)}</div>
						<div class="h2 hero-title">{expense.description || 'Expense'}</div>
					</div>
				</div>
				<div class="hero-amount">
					<span class="hero-sym">{nativeSymbol}</span>{formatAmount(expense.amount, "", nativeCurrency)}
				</div>
				{#if isForeign}
					<div class="dim mono hero-fx">
						≈ {formatAmount(baseAmount, currencySymbol, currency)}
						{#if expense.exchangeRate}· 1 {nativeCurrency} = {formatRate(expense.exchangeRate)} {currency}{/if}
					</div>
				{/if}
				<div class="row gap-8 hero-stickers">
					{#each expense.payments as p, idx (idx)}
						<span class="sticker">
							<Avatar member={membersById.get(p.memberId)} size="xs" />
							{memberLabel(p.memberId)}
							{#if expense.payments.length > 1}
								<span class="dim">{formatAmount(p.amount, nativeSymbol, nativeCurrency)}</span>
							{/if}
						</span>
					{/each}
					{#if expense.splitMode !== 'even'}
						<span class="sticker">{expense.splitMode.toUpperCase()}</span>
					{/if}
					{#if paymentMethod}
						<span class="sticker">{paymentMethod.emoji} {paymentMethod.name}</span>
					{/if}
				</div>
			</section>

			{#if currentMemberId}
				{@const inExpense = expense.splits.some((s) => s.memberId === currentMemberId)}
				{#if inExpense || yourPaidCents > 0}
					<section class="card share-callout">
						<div class="row between">
							<div class="col">
								<div class="eyebrow share-eyebrow">Your share</div>
								<div class="num share-amount">{formatAmount(yourShareCents, nativeSymbol, nativeCurrency)}</div>
								<div class="dim mono share-sub">{shareLabelFor(currentMemberId)}</div>
							</div>
							<div class="col" style="align-items: flex-end;">
								<div class="dim mono share-eyebrow">Impact on balance</div>
								<div
									class="num share-impact"
									class:tone-owed={yourImpact > 0}
									class:tone-owe={yourImpact < 0}
								>
									{formatSigned(yourImpact, nativeSymbol, nativeCurrency)}
								</div>
							</div>
						</div>
					</section>
				{/if}
			{/if}

			<div class="section-head">
				<div class="eyebrow">Breakdown</div>
				<span class="dim mono">{involvedCount} INVOLVED</span>
			</div>
			<div class="card breakdown">
				{#each expense.splits as s, i (s.memberId)}
					{@const member = membersById.get(s.memberId)}
					{@const paid = expense.payments.some((p) => p.memberId === s.memberId)}
					{@const cents = shares.get(s.memberId) ?? 0}
					{#if i > 0}<hr class="hairline" style="margin-left: 56px;" />{/if}
					<div class="row gap-10 breakdown-row">
						<Avatar member={member} size="sm" />
						<div class="col" style="flex: 1;">
							<div class="row gap-6">
								<span class="breakdown-name">{memberLabel(s.memberId)}</span>
								{#if paid}<span class="sticker sticker-on paid-tag">PAID</span>{/if}
							</div>
							<div class="dim mono breakdown-meta">{shareLabelFor(s.memberId)}</div>
						</div>
						<span class="num breakdown-amount">{formatAmount(cents, nativeSymbol, nativeCurrency)}</span>
					</div>
				{/each}
			</div>

			{#if expense.notes}
				<div class="card notes-card">
					<div class="eyebrow" style="margin-bottom: 8px;">Note</div>
					<p class="notes-body">{expense.notes}</p>
				</div>
			{/if}

			<div class="card audit-card">
				<div class="row between audit-row">
					<span class="dim mono audit-label">Added by</span>
					<span class="audit-value">{memberLabel(expense.createdBy)}</span>
				</div>
				<hr class="hairline" />
				<div class="row between audit-row">
					<span class="dim mono audit-label">Created</span>
					<span class="audit-value">{formatDate(expense.createdAt)}</span>
				</div>
				{#if editEvents.length > 0}
					<hr class="hairline" />
					<div class="audit-edits">
						<span class="dim mono audit-label edits-label">Edits</span>
						<ActivityList events={editEvents} {membersById} {currentMemberId} />
					</div>
				{/if}
			</div>

			<div class="row gap-8 action-row">
				<button class="btn action-btn" type="button" onclick={onEdit}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h4l11-11-4-4L4 16v4zM14 6l4 4" /></svg>
					<span>Edit</span>
				</button>
				<button
					class="btn action-btn delete-btn"
					class:confirming={confirmingDelete}
					type="button"
					onclick={onDelete}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>
					<span>{confirmingDelete ? 'Tap again to delete' : 'Delete'}</span>
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.empty-detail {
		padding-top: 24px;
	}

	.back-btn {
		margin-top: 14px;
	}

	.hero {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 8px 0 18px;
	}

	.hero-top {
		align-items: center;
	}

	.hero-icon {
		width: 56px;
		height: 56px;
		border-radius: 18px;
		font-size: 26px;
		background: color-mix(in oklab, var(--accent) 16%, transparent);
	}

	.hero-title {
		margin-top: 2px;
	}

	.hero-amount {
		font-family: var(--font-display);
		font-size: 56px;
		line-height: 1;
		letter-spacing: -0.02em;
	}

	.hero-sym {
		color: var(--ink-2);
		font-size: 28px;
	}

	.hero-fx {
		font-size: 12px;
		margin-top: 6px;
	}

	.hero-stickers {
		flex-wrap: wrap;
		align-items: center;
	}

	.share-callout {
		background: color-mix(in oklab, var(--accent) 8%, var(--bg-2));
		border: 1px solid color-mix(in oklab, var(--accent) 30%, var(--line));
	}

	.share-eyebrow {
		color: var(--accent);
	}

	.share-amount {
		font-size: 26px;
		font-weight: 600;
		margin-top: 6px;
	}

	.share-sub {
		font-size: 11px;
		margin-top: 4px;
	}

	.share-impact {
		font-size: 18px;
		font-weight: 600;
		margin-top: 6px;
	}

	.breakdown {
		padding: 4px;
	}

	.breakdown-row {
		padding: 12px;
	}

	.breakdown-name {
		font-size: 14px;
		font-weight: 600;
	}

	.paid-tag {
		padding: 1px 6px;
		font-size: 9px;
	}

	.breakdown-meta {
		font-size: 11px;
		margin-top: 2px;
	}

	.breakdown-amount {
		font-weight: 500;
	}

	.notes-card {
		margin-top: 10px;
	}

	.notes-body {
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-2);
		margin: 0;
	}

	.audit-card {
		margin-top: 10px;
		padding: 4px;
	}

	.audit-row {
		padding: 12px;
	}

	.audit-label {
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.audit-value {
		font-size: 12px;
	}

	/* line the edits label + rows up with the 16px inset of the rows above
	   (4px card padding + 12px). the activity rows carry their own 4px, so the
	   wrapper adds 8px to land the avatar and time at the same edges. */
	.audit-edits {
		padding: 10px 8px 6px;
	}

	.edits-label {
		display: block;
		padding-left: 4px;
		margin-bottom: 4px;
	}

	.action-row {
		margin-top: 14px;
	}

	.action-btn {
		flex: 1;
	}

	.delete-btn {
		color: var(--owe);
	}

	.delete-btn.confirming {
		background: color-mix(in oklab, var(--owe) 14%, transparent);
		border-color: var(--owe);
	}
</style>
