<script lang="ts">
	import Avatar from './Avatar.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import FillRowButton from './FillRowButton.svelte';
	import { mathInput } from '$lib/actions/mathInput';
	import type { EntryKind } from '$lib/income';
	import type { Member } from '$lib/types';
	import { formatAmount } from '$lib/money';

	export type PaymentRow = { id: string; memberId: string; amount: string };

	type Props = {
		payers: PaymentRow[];
		members: Member[];
		amountCents: number;
		paidTotal: number;
		paidShort: number;
		symbol: string;
		currency: string;
		currentMemberId: string | null;
		onUpdatePayer: (id: string, updates: Partial<PaymentRow>) => void;
		onAddPayer: (memberId: string) => void;
		onRemovePayer: (id: string) => void;
		onFillPayer: (id: string) => void;
		/** an income is received by people rather than paid by them */
		kind?: EntryKind;
		/** "Saved as …" per payer row whose typed amount gets rounded on save */
		roundingNotes?: Record<string, string>;
	};

	let {
		payers,
		members,
		amountCents,
		paidTotal,
		paidShort,
		symbol,
		currency,
		currentMemberId,
		onUpdatePayer,
		onAddPayer,
		onRemovePayer,
		onFillPayer,
		kind = 'expense',
		roundingNotes = {}
	}: Props = $props();

	const words = $derived(
		kind === 'income'
			? { label: 'Received by', verb: 'received', role: 'receiver', complete: 'All received', who: 'Who received it?', whoElse: 'Who else received it?' }
			: { label: 'Paid by', verb: 'paid', role: 'payer', complete: 'All paid', who: 'Who paid?', whoElse: 'Who else paid?' }
	);

	/** which row's person is being chosen, or 'new' while adding a payer */
	let picking = $state<string | 'new' | null>(null);

	const isMulti = $derived(payers.length > 1);
	const pickingRow = $derived(payers.find((payer) => payer.id === picking));
	const payerIds = $derived(new Set(payers.map((payer) => payer.memberId)));
	const canAddPayer = $derived(members.some((m) => !payerIds.has(m.id)));
	// someone already paying can't be picked twice; the row being changed keeps its own person
	const pickable = $derived(members.filter((m) => !payerIds.has(m.id) || m.id === pickingRow?.memberId));

	function memberName(id: string): string {
		const m = members.find((x) => x.id === id);
		if (!m) return '—';
		return m.id === currentMemberId ? `${m.name} (you)` : m.name;
	}

	function pickMember(memberId: string) {
		if (picking === 'new') onAddPayer(memberId);
		else if (pickingRow) onUpdatePayer(pickingRow.id, { memberId });
		picking = null;
	}
</script>

<div class="card field-card">
	{#if !isMulti}
		{@const single = payers[0]}
		{@const payerMember = members.find((m) => m.id === single?.memberId)}
		<button
			type="button"
			class="field field-button"
			aria-haspopup="dialog"
			onclick={() => (picking = single?.id ?? null)}
		>
			{#if payerMember}
				<Avatar member={payerMember} size="md" />
			{:else}
				<span class="cat-tile field-tile">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v16M6 7h12M4 11l2-4 2 4a2 2 0 1 1-4 0zM16 11l2-4 2 4a2 2 0 1 1-4 0z" /></svg>
				</span>
			{/if}
			<span class="col field-text">
				<span class="field-label">{words.label}</span>
				<span class="field-value-static">{single ? memberName(single.memberId) : '—'}</span>
			</span>
			<span class="field-chevron" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 9l6 6 6-6" /></svg>
			</span>
		</button>
		{#if canAddPayer}
			{@render addPayerButton()}
		{/if}
	{:else}
		<div class="multi-head">
			<span class="field-label">{words.label}</span>
			<span class="paid-status" class:tone-owed={paidShort === 0} class:tone-owe={paidShort !== 0} aria-live="polite">
				{#if paidShort === 0}
					{words.complete}
				{:else if paidShort > 0}
					<span class="num">{formatAmount(paidShort, symbol, currency)}</span> left
				{:else}
					<span class="num">{formatAmount(-paidShort, symbol, currency)}</span> too much
				{/if}
			</span>
		</div>
		<div class="payer-lines">
			{#each payers as p (p.id)}
				{@const payerMember = members.find((m) => m.id === p.memberId)}
				<div class="payer-line">
					<button type="button" class="payer-who" aria-haspopup="dialog" aria-label="Change who {words.verb}: {memberName(p.memberId)}" onclick={() => (picking = p.id)}>
						<Avatar member={payerMember} size="sm" />
						<span class="payer-line-name">{memberName(p.memberId)}</span>
					</button>
					<div class="payer-amount-wrap">
						<input
							class="input payer-amount-input mono"
							value={p.amount}
							use:mathInput
							oninput={(e) => onUpdatePayer(p.id, { amount: e.currentTarget.value })}
							placeholder="0.00"
							inputmode="decimal"
							autocomplete="off"
							aria-label="Amount {words.verb} by {memberName(p.memberId)}"
						/>
						<FillRowButton onfill={() => onFillPayer(p.id)} />
					</div>
					<button type="button" class="icon-btn payer-remove" onclick={() => onRemovePayer(p.id)} aria-label="Remove {memberName(p.memberId)} as a {words.role}">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
					</button>
				</div>
				{#if roundingNotes[p.id]}
					<p class="dim mono rounding-note">{roundingNotes[p.id]}</p>
				{/if}
			{/each}
		</div>
		{#if canAddPayer}
			{@render addPayerButton()}
		{/if}
	{/if}
</div>

{#snippet addPayerButton()}
	<button type="button" class="add-payer-btn" aria-haspopup="dialog" onclick={() => (picking = 'new')}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
		<span>Add another {words.role}</span>
	</button>
{/snippet}

{#if picking === 'new' || pickingRow}
	<BottomSheet title={picking === 'new' ? words.whoElse : words.who} onclose={() => (picking = null)}>
		<ul class="payer-list">
			{#each pickable as m (m.id)}
				<li>
					<button type="button" class="payer-row" class:on={m.id === pickingRow?.memberId} onclick={() => pickMember(m.id)}>
						<Avatar member={m} size="sm" />
						<span class="col payer-text">
							<span class="payer-name">{memberName(m.id)}</span>
						</span>
						{#if m.id === pickingRow?.memberId}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="payer-check" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</BottomSheet>
{/if}

<style>
	.field-card {
		padding: 4px;
		margin-bottom: 10px;
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

	.field-tile :global(svg) {
		width: 18px;
		height: 18px;
	}

	.field-chevron :global(svg) {
		width: 18px;
		height: 18px;
	}

	.field-chevron {
		color: var(--ink-3);
	}

	.payer-list {
		list-style: none;
		margin: 10px -4px 0;
		padding: 0;
	}

	.payer-row {
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

	.payer-text {
		flex: 1;
	}

	.payer-name {
		font-size: 13px;
		font-weight: 500;
	}

	.payer-check {
		width: 18px;
		height: 18px;
		color: var(--accent);
	}

	.payer-row.on .payer-name {
		color: var(--accent);
	}

	.multi-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 12px 6px;
	}


	.payer-lines {
		display: flex;
		flex-direction: column;
		padding: 0 12px;
	}

	.payer-line {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 0;
	}

	.payer-line + .payer-line {
		border-top: 1px solid var(--line);
	}

	.payer-who {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
		padding: 4px 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.payer-remove {
		flex-shrink: 0;
		width: 30px;
		height: 30px;
	}

	.payer-remove svg {
		width: 14px;
		height: 14px;
	}

	.payer-line-name {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rounding-note {
		margin: 0 0 4px;
		font-size: 11px;
		text-align: right;
	}

	.payer-amount-wrap {
		position: relative;
		width: 110px;
	}

	.payer-amount-input {
		width: 100%;
		padding: 8px 30px 8px 10px;
		font-size: 13px;
		text-align: right;
	}

	/* a footer strip that runs edge to edge inside the card, so adding a payer is always in sight */
	.add-payer-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: calc(100% + 8px);
		min-height: 32px;
		margin: 0 -4px -4px;
		padding: 0;
		background: transparent;
		border: 0;
		border-top: 1px solid var(--line);
		border-radius: 0 0 calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px);
		color: var(--accent);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.add-payer-btn:active {
		background: color-mix(in oklab, var(--accent) 10%, transparent);
	}

	.add-payer-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.add-payer-btn svg {
		width: 14px;
		height: 14px;
	}

	.paid-status {
		font-size: 12px;
		font-weight: 600;
	}
</style>
