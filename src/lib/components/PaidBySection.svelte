<script lang="ts">
	import Avatar from './Avatar.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import FillRowButton from './FillRowButton.svelte';
	import { mathInput } from '$lib/actions/mathInput';
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
		onSplitAcrossPayers: () => void;
		onUseSinglePayer: () => void;
		onFillPayer: (id: string) => void;
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
		onSplitAcrossPayers,
		onUseSinglePayer,
		onFillPayer,
		roundingNotes = {}
	}: Props = $props();

	let openRow = $state<string | null>(null);

	const isMulti = $derived(payers.length > 1);
	const openPayer = $derived(payers.find((payer) => payer.id === openRow));

	function memberName(id: string): string {
		const m = members.find((x) => x.id === id);
		if (!m) return '—';
		return m.id === currentMemberId ? `${m.name} (you)` : m.name;
	}

	function pickMember(rowId: string, memberId: string) {
		onUpdatePayer(rowId, { memberId });
		openRow = null;
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
			onclick={() => (openRow = single?.id ?? null)}
		>
			{#if payerMember}
				<Avatar member={payerMember} size="md" />
			{:else}
				<span class="cat-tile field-tile">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v16M6 7h12M4 11l2-4 2 4a2 2 0 1 1-4 0zM16 11l2-4 2 4a2 2 0 1 1-4 0z" /></svg>
				</span>
			{/if}
			<span class="col field-text">
				<span class="field-label">Paid by</span>
				<span class="field-value-static">{single ? memberName(single.memberId) : '—'}</span>
			</span>
			<span class="field-chevron" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 9l6 6 6-6" /></svg>
			</span>
		</button>
		{#if members.length > 1}
			<div class="add-payer-bar">
				<button type="button" class="add-payer-btn" onclick={onSplitAcrossPayers}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
					<span>Several people paid</span>
				</button>
			</div>
		{/if}
	{:else}
		<div class="multi-head">
			<span class="field-label">Paid by</span>
			<span class="paid-status" class:tone-owed={paidShort === 0} class:tone-owe={paidShort !== 0} aria-live="polite">
				{#if paidShort === 0}
					All paid
				{:else if paidShort > 0}
					<span class="num">{formatAmount(paidShort, symbol, currency)}</span> left
				{:else}
					<span class="num">{formatAmount(-paidShort, symbol, currency)}</span> too much
				{/if}
			</span>
		</div>
		<p class="dim multi-hint">Enter what each person paid. Leave it empty if they paid nothing.</p>
		<div class="payer-lines">
			{#each payers as p (p.id)}
				{@const payerMember = members.find((m) => m.id === p.memberId)}
				<div class="payer-line">
					<Avatar member={payerMember} size="sm" />
					<span class="payer-line-name">{memberName(p.memberId)}</span>
					<div class="payer-amount-wrap">
						<input
							class="input payer-amount-input mono"
							value={p.amount}
							use:mathInput
							oninput={(e) => onUpdatePayer(p.id, { amount: e.currentTarget.value })}
							placeholder="0.00"
							inputmode="decimal"
							autocomplete="off"
							aria-label="Amount paid by {memberName(p.memberId)}"
						/>
						<FillRowButton onfill={() => onFillPayer(p.id)} />
					</div>
				</div>
				{#if roundingNotes[p.id]}
					<p class="dim mono rounding-note">{roundingNotes[p.id]}</p>
				{/if}
			{/each}
		</div>
		<div class="add-payer-bar">
			<button type="button" class="add-payer-btn" onclick={onUseSinglePayer}>Just one payer</button>
		</div>
	{/if}
</div>

{#if openPayer}
	<BottomSheet title="Who paid?" onclose={() => (openRow = null)}>
		<ul class="payer-list">
			{#each members as m (m.id)}
				<li>
					<button type="button" class="payer-row" class:on={m.id === openPayer.memberId} onclick={() => pickMember(openPayer.id, m.id)}>
						<Avatar member={m} size="sm" />
						<span class="col payer-text">
							<span class="payer-name">{memberName(m.id)}</span>
						</span>
						{#if m.id === openPayer.memberId}
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
		padding: 14px 12px 0;
	}

	.multi-hint {
		margin: 4px 12px 10px;
		font-size: 13px;
		line-height: 1.4;
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

	.add-payer-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 12px 12px;
		flex-wrap: wrap;
	}

	.add-payer-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: var(--accent);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		padding: 4px 0;
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
