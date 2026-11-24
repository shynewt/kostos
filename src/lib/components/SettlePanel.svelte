<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { Settlement } from '$lib/balance';
	import AmountField from '$lib/components/AmountField.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import { currencyDecimals } from '$lib/currencies';
	import { formatAmount, toInputValue } from '$lib/money';
	import { parseSettleAmount } from '$lib/settle-amount';
	import { addExpense, generateId } from '$lib/sync/doc';
	import type { RoomHandle } from '$lib/sync/doc';
	import type { Expense, Member, Project } from '$lib/types';

	type Props = {
		roomId: string;
		handle: RoomHandle;
		project: Project | null;
		membersById: Map<string, Member>;
		plan: Settlement[];
		currentMemberId: string | null;
		symbol: string;
		currency: string;
	};

	let { handle, project, membersById, plan, currentMemberId, symbol, currency }: Props = $props();

	// the transfer being confirmed in the bottom sheet, if any
	let pending = $state<Settlement | null>(null);
	let recording = $state(false);
	let saveError = $state(false);
	let amountInput = $state('');
	let submittedExpense: Expense | null = null;

	const amount = $derived(
		pending ? parseSettleAmount(amountInput, pending.amount, currencyDecimals(currency)) : null
	);
	const amountIsExpression = $derived(/[+\-*/()]/.test(amountInput.trim()));

	function selectTransfer(transfer: Settlement) {
		pending = transfer;
		amountInput = toInputValue(transfer.amount, currency);
		submittedExpense = null;
		saveError = false;
	}

	function closeSheet() {
		pending = null;
	}

	// yours first, then everyone else's
	const sortedPlan = $derived(
		plan.toSorted((a, b) => {
			const aMine = a.from === currentMemberId || a.to === currentMemberId ? 0 : 1;
			const bMine = b.from === currentMemberId || b.to === currentMemberId ? 0 : 1;
			return aMine - bMine;
		})
	);

	function transferKey(t: Settlement): string {
		return `${t.from}>${t.to}`;
	}

	function label(id: string): string {
		const m = membersById.get(id);
		if (!m) return '—';
		return m.id === currentMemberId ? 'You' : m.name;
	}

	async function confirmPending() {
		const t = pending;
		if (recording) return;
		if (!t || !project) {
			pending = null;
			return;
		}
		if (!amount || amount.error) return;
		const cents = amount.cents;
		// a retry after a failed save must reuse the same id, unless the amount was changed
		if (submittedExpense && submittedExpense.amount !== cents) submittedExpense = null;
		const fromName = membersById.get(t.from)?.name ?? '—';
		const toName = membersById.get(t.to)?.name ?? '—';
		const expense: Expense = submittedExpense ?? {
			id: generateId(),
			payments: [{ memberId: t.from, amount: cents }],
			amount: cents,
			currency: project.currency,
			description: `${fromName} → ${toName}`,
			date: Date.now(),
			splitMode: 'even',
			splits: [{ memberId: t.to }],
			isSettlement: true,
			createdAt: Date.now(),
			createdBy: currentMemberId ?? t.from
		};
		submittedExpense = expense;
		recording = true;
		saveError = false;
		try {
			addExpense(handle, expense);
			await handle.persistence?.flush();
			pending = null;
		} catch { saveError = true; }
		finally { recording = false; }
	}
</script>

<div class="lines">
	{#each sortedPlan as t (transferKey(t))}
		{@const youFrom = t.from === currentMemberId}
		{@const youTo = t.to === currentMemberId}
		{@const tone = youTo ? 'in' : youFrom ? 'out' : 'other'}
		<button
			class="line"
			class:involves-you={youFrom || youTo}
			type="button"
			onclick={() => selectTransfer(t)}
		>
			<span class="line-avatars">
				<Avatar member={membersById.get(t.from)} size="md" />
				<svg class="line-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				<Avatar member={membersById.get(t.to)} size="md" />
			</span>
			<span class="line-head">
				<strong>{label(t.from)}</strong>
				<span class="line-verb">{youFrom ? 'pay' : 'pays'}</span>
				<strong>{label(t.to)}</strong>
			</span>
			<span
				class="num line-amount"
				class:tone-owed={tone === 'in'}
				class:tone-owe={tone === 'out'}
			>
				{formatAmount(t.amount, symbol, currency)}
			</span>
			<svg class="line-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
		</button>
	{/each}
</div>

{#if pending}
	<BottomSheet title="Record settlement" onclose={closeSheet} locked={recording}>
		<div class="sheet-flow">
			<Avatar member={membersById.get(pending.from)} size="md" />
			<span class="sheet-name">{label(pending.from)}</span>
			<svg class="sheet-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
			<Avatar member={membersById.get(pending.to)} size="md" />
			<span class="sheet-name">{label(pending.to)}</span>
		</div>
		<AmountField
			bind:value={amountInput}
			cents={amount?.cents ?? 0}
			{symbol}
			{currency}
			isExpression={amountIsExpression}
			invalid={!!amount?.error}
		/>
		{#if amount?.error}
			<p class="sheet-message sheet-invalid" role="alert">{amount.error} {label(pending.from)} {pending.from === currentMemberId ? 'owe' : 'owes'} {formatAmount(pending.amount, symbol, currency)}.</p>
		{:else if amount && amount.cents < pending.amount}
			<p class="dim sheet-message">Part of {formatAmount(pending.amount, symbol, currency)}. The rest stays in the settle-up list.</p>
		{:else}
			<p class="dim sheet-message">Paying part of it? Change the amount.</p>
		{/if}
		{#if saveError}<p class="sheet-error" role="alert" transition:slide={{ duration: 160 }}>Couldn’t save on this phone. Nothing was recorded, so you can try again.</p>{/if}
		<div class="row gap-8 sheet-actions">
			<button class="btn sheet-cancel" type="button" disabled={recording} onclick={closeSheet}>Cancel</button>
			<button class="btn btn-primary sheet-confirm" type="button" disabled={recording || !!amount?.error} onclick={confirmPending}>
				{recording ? 'Saving…' : saveError ? 'Try again' : 'Mark paid'}
			</button>
		</div>
		<p class="dim sheet-hint">
			Records a settlement expense. Delete it from the expense detail if it was a mistake.
		</p>
	</BottomSheet>
{/if}

<style>
	.lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.line {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 14px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: border-color 0.12s ease, background 0.12s ease;
	}

	.line.involves-you {
		background: color-mix(in oklab, var(--accent) 7%, var(--bg-2));
		border-color: color-mix(in oklab, var(--accent) 32%, var(--line));
	}

	.line-avatars {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.line-arrow {
		width: 14px;
		height: 14px;
		color: var(--ink-3);
	}

	.line-head {
		flex: 1;
		min-width: 0;
		font-size: 16px;
		display: inline-flex;
		justify-content: flex-start;
		gap: 5px;
		flex-wrap: wrap;
	}

	.line-verb {
		font-weight: 400;
		color: var(--ink-2);
	}

	.line-amount {
		font-weight: 700;
		font-size: 15px;
		flex-shrink: 0;
	}

	.line-chevron {
		width: 16px;
		height: 16px;
		margin-left: -6px;
		flex-shrink: 0;
		color: var(--ink-3);
	}

	@media (hover: hover) {
		.line:hover {
			border-color: var(--line-2);
		}
	}

	.sheet-flow {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 16px 0 10px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.sheet-name {
		font-size: 14px;
		font-weight: 600;
	}

	.sheet-arrow {
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}

	.sheet-actions {
		width: 100%;
	}

	.sheet-cancel,
	.sheet-confirm {
		flex: 1;
		padding: 12px;
		font-size: 14px;
	}

	.sheet-confirm:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.sheet-message {
		margin: 10px 0 18px;
		font-size: 13px;
		line-height: 1.45;
		text-align: center;
	}

	.sheet-invalid {
		color: var(--owe);
	}

	.sheet-error {
		width: 100%;
		margin: -6px 0 14px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		font-size: 13px;
		line-height: 1.45;
		text-align: left;
	}

	.sheet-hint {
		font-size: 11px;
		line-height: 1.5;
		text-align: center;
		margin: 12px 0 0;
	}
</style>
