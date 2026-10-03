<script lang="ts">
	import Avatar from './Avatar.svelte';
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
		dateStr: string;
		onUpdatePayer: (id: string, updates: Partial<PaymentRow>) => void;
		onAddPayer: () => void;
		onRemovePayer: (id: string) => void;
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
		dateStr = $bindable(),
		onUpdatePayer,
		onAddPayer,
		onRemovePayer,
		onFillPayer,
		roundingNotes = {}
	}: Props = $props();

	let openRow = $state<string | null>(null);

	const isMulti = $derived(payers.length > 1);

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
			aria-expanded={openRow === single?.id}
			onclick={() => (openRow = openRow === single?.id ? null : (single?.id ?? null))}
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
		{#if openRow === single?.id}
			<ul class="payer-list">
				{#each members as m (m.id)}
					<li>
						<button
							type="button"
							class="payer-row"
							class:on={m.id === single.memberId}
							onclick={() => pickMember(single.id, m.id)}
						>
							<Avatar member={m} size="sm" />
							<span class="col payer-text">
								<span class="payer-name">{memberName(m.id)}</span>
							</span>
							{#if m.id === single.memberId}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="payer-check"><path d="M5 12l5 5L20 7" /></svg>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="add-payer-bar">
			<button type="button" class="add-payer-btn" onclick={onAddPayer}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
				<span>Add another payer</span>
			</button>
		</div>
	{:else}
		<div class="multi-payer-header">
			<span class="cat-tile field-tile">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v16M6 7h12M4 11l2-4 2 4a2 2 0 1 1-4 0zM16 11l2-4 2 4a2 2 0 1 1-4 0z" /></svg>
			</span>
			<span class="field-label">Paid by</span>
		</div>
		<ul class="payer-rows">
			{#each payers as p (p.id)}
				<li class="payer-row-multi">
					<div class="payer-row-top">
						<button
							type="button"
							class="payer-select"
							aria-expanded={openRow === p.id}
							onclick={() => (openRow = openRow === p.id ? null : p.id)}
						>
							<Avatar member={members.find((m) => m.id === p.memberId)} size="sm" />
							<span class="payer-select-name">{memberName(p.memberId)}</span>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								class="payer-select-chevron"
							>
								<path d="M6 9l6 6 6-6" />
							</svg>
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
								aria-label="Amount paid by {memberName(p.memberId)}"
							/>
							<FillRowButton onfill={() => onFillPayer(p.id)} />
						</div>
						<button
							type="button"
							class="icon-btn payer-remove"
							onclick={() => onRemovePayer(p.id)}
							aria-label="Remove payer"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
					</div>
					{#if roundingNotes[p.id]}
						<p class="dim mono rounding-note">{roundingNotes[p.id]}</p>
					{/if}
					{#if openRow === p.id}
						<ul class="payer-list">
							{#each members as m (m.id)}
								<li>
									<button
										type="button"
										class="payer-row"
										class:on={m.id === p.memberId}
										onclick={() => pickMember(p.id, m.id)}
									>
										<Avatar member={m} size="sm" />
										<span class="col payer-text">
											<span class="payer-name">{memberName(m.id)}</span>
										</span>
										{#if m.id === p.memberId}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="payer-check"><path d="M5 12l5 5L20 7" /></svg>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
		<div class="add-payer-bar">
			<button type="button" class="add-payer-btn" onclick={onAddPayer}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
				<span>Add another payer</span>
			</button>
			<span
				class="paid-status mono"
				class:tone-owed={paidShort === 0}
				class:tone-owe={paidShort !== 0}
			>
				PAID {formatAmount(paidTotal, symbol, currency)} / {formatAmount(amountCents, symbol, currency)}
			</span>
		</div>
	{/if}
	<hr class="hairline" />
	<div class="field">
		<span class="cat-tile field-tile">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
		</span>
		<span class="col field-text">
			<span class="field-label">Date</span>
			<input class="date-input" type="date" bind:value={dateStr} />
		</span>
	</div>
</div>

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
		margin: 0;
		padding: 4px 8px 8px;
		border-top: 1px solid var(--line);
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

	.date-input {
		background: transparent;
		border: 0;
		padding: 4px 0 0;
		font-size: 14px;
		color: var(--ink);
		outline: none;
		font-family: var(--font-sans);
	}

	.multi-payer-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 12px 4px;
	}

	.payer-rows {
		list-style: none;
		margin: 0;
		padding: 0 8px 4px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.rounding-note {
		margin: 2px 0 0;
		font-size: 11px;
		text-align: right;
	}

	.payer-row-multi {
		display: flex;
		flex-direction: column;
	}

	.payer-row-top {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.payer-select {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		padding: 8px 10px;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		cursor: pointer;
		font: inherit;
		text-align: left;
	}

	.payer-select-name {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.payer-select-chevron {
		width: 14px;
		height: 14px;
		color: var(--ink-3);
		flex-shrink: 0;
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

	.payer-remove {
		flex-shrink: 0;
		width: 30px;
		height: 30px;
	}

	.payer-remove svg {
		width: 14px;
		height: 14px;
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
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
	}
</style>
