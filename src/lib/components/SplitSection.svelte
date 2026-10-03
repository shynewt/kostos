<script lang="ts">
	import Avatar from './Avatar.svelte';
	import FillRowButton from './FillRowButton.svelte';
	import { mathInput } from '$lib/actions/mathInput';
	import { formatAmount } from '$lib/money';
	import type { Member, SplitMode } from '$lib/types';

	type Props = {
		members: Member[];
		amountCents: number;
		symbol: string;
		currency: string;
		currentMemberId: string | null;
		splitMode: SplitMode;
		involved: Set<string>;
		shares: Record<string, number>;
		amounts: Record<string, string>;
		memberShares: Map<string, number>;
		remaining: number;
		totalShares: number;
		emptyInvolvedCount: number;
		canAutoFill: boolean;
		onSetSplitMode: (mode: SplitMode) => void;
		onToggleMember: (id: string) => void;
		onStepShare: (id: string, delta: number) => void;
		onUpdateAmount: (id: string, value: string) => void;
		onAutoFillRest: () => void;
		onFillSplitRow: (id: string) => void;
		/** "Saved as …" per member whose typed amount gets rounded on save */
		roundingNotes?: Record<string, string>;
	};

	let {
		members,
		amountCents,
		symbol,
		currency,
		currentMemberId,
		splitMode,
		involved,
		shares,
		amounts,
		memberShares,
		remaining,
		totalShares,
		emptyInvolvedCount,
		canAutoFill,
		onSetSplitMode,
		onToggleMember,
		onStepShare,
		onUpdateAmount,
		onAutoFillRest,
		onFillSplitRow,
		roundingNotes = {}
	}: Props = $props();

	const involvedList = $derived(members.filter((m) => involved.has(m.id)));
</script>

<div class="card split-card">
	<div class="row between" style="margin-bottom: 12px;">
		<div class="eyebrow">Split</div>
		<div class="dim mono split-summary">
			{involvedList.length} OF {members.length} INVOLVED
		</div>
	</div>

	<div class="row gap-6 split-tabs">
		<button
			type="button"
			class="split-tab"
			class:on={splitMode === 'even'}
			onclick={() => onSetSplitMode('even')}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v16M6 7h12M4 11l2-4 2 4a2 2 0 1 1-4 0zM16 11l2-4 2 4a2 2 0 1 1-4 0z" /></svg>
			<span class="split-tab-label">Evenly</span>
			<span class="split-tab-sub">
				{involvedList.length > 0
					? `${formatAmount(Math.trunc(amountCents / involvedList.length), symbol, currency)} each`
					: '—'}
			</span>
		</button>
		<button
			type="button"
			class="split-tab"
			class:on={splitMode === 'shares'}
			onclick={() => onSetSplitMode('shares')}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 18L18 6" /><circle cx="7.5" cy="7.5" r="2" /><circle cx="16.5" cy="16.5" r="2" /></svg>
			<span class="split-tab-label">Shares</span>
			<span class="split-tab-sub">by weights</span>
		</button>
		<button
			type="button"
			class="split-tab"
			class:on={splitMode === 'amount'}
			onclick={() => onSetSplitMode('amount')}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="18" height="10" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>
			<span class="split-tab-label">Amounts</span>
			<span class="split-tab-sub">precise</span>
		</button>
	</div>

	{#if canAutoFill}
		<button type="button" class="auto-fill" onclick={onAutoFillRest}>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M11 3l1.5 4.5L17 9l-4.5 1.5L11 15l-1.5-4.5L5 9l4.5-1.5z" />
				<path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
			</svg>
			<span class="auto-fill-text">
				Split the remaining <span class="num">{formatAmount(remaining, symbol, currency)}</span> among
				{emptyInvolvedCount} {emptyInvolvedCount === 1 ? 'person' : 'people'}
			</span>
		</button>
	{/if}

	<div class="col gap-8 member-list">
		{#each members as m (m.id)}
			{@const isIn = involved.has(m.id)}
			{@const portion = memberShares.get(m.id) ?? 0}
			<div class="member-row" class:dim={!isIn}>
				<button
					type="button"
					class="checkbox"
					class:on={isIn}
					aria-checked={isIn}
					role="checkbox"
					aria-label={isIn ? `Remove ${m.name}` : `Include ${m.name}`}
					onclick={() => onToggleMember(m.id)}
				>
					{#if isIn}
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
					{/if}
				</button>
				<Avatar member={m} size="sm" />
				<span class="member-name">{m.name}{m.id === currentMemberId ? ' (you)' : ''}</span>
				{#if !isIn}
					<span class="dim mono dash">—</span>
				{:else if splitMode === 'even'}
					<span class="num member-amount">{formatAmount(portion, symbol, currency)}</span>
				{:else if splitMode === 'shares'}
					<div class="row gap-6 shares-controls">
						<button type="button" class="step-btn" onclick={() => onStepShare(m.id, -1)} aria-label="Decrease shares">−</button>
						<span class="num share-value">{shares[m.id] ?? 0}</span>
						<button type="button" class="step-btn" onclick={() => onStepShare(m.id, 1)} aria-label="Increase shares">+</button>
					</div>
					<span class="num member-amount">{formatAmount(portion, symbol, currency)}</span>
				{:else}
					<div class="split-amount-wrap">
						<input
							class="input amount-input-sm mono"
							value={amounts[m.id] ?? ''}
							use:mathInput
							oninput={(e) => onUpdateAmount(m.id, e.currentTarget.value)}
							placeholder="0.00"
							inputmode="decimal"
							autocomplete="off"
							aria-label="Amount for {m.name}"
						/>
						<FillRowButton onfill={() => onFillSplitRow(m.id)} />
					</div>
				{/if}
			</div>
			{#if isIn && roundingNotes[m.id]}
				<p class="dim mono rounding-note">{roundingNotes[m.id]}</p>
			{/if}
		{/each}
	</div>

	<hr class="hairline" style="margin: 14px 0 12px;" />
	<div class="row between sanity">
		<div class="row gap-6">
			<span class="dim mono">SUM</span>
			<span class="num sanity-value">{formatAmount(amountCents, symbol, currency)}</span>
		</div>
		{#if splitMode === 'amount'}
			<div class="row gap-6">
				<span class="dim mono">REMAINING</span>
				<span
					class="num sanity-value"
					class:tone-owed={remaining === 0}
					class:tone-owe={remaining !== 0}
				>{formatAmount(remaining, symbol, currency)}</span>
			</div>
		{:else if splitMode === 'shares'}
			<div class="row gap-6">
				<span class="dim mono">SHARES</span>
				<span class="num sanity-value">{totalShares}</span>
			</div>
		{:else if involvedList.length > 0}
			<div class="row gap-6">
				<span class="dim mono">PER PERSON</span>
				<span class="num sanity-value">
					{formatAmount(Math.trunc(amountCents / involvedList.length), symbol, currency)}
				</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.split-card {
		padding: 16px;
	}

	.split-summary {
		font-size: 11px;
	}

	.split-tabs {
		margin-bottom: 14px;
	}

	.split-tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 10px 6px;
		border-radius: 14px;
		background: var(--bg);
		color: var(--ink-2);
		border: 1px solid var(--line);
		cursor: pointer;
		font-family: inherit;
	}

	.split-tab.on {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
	}

	.split-tab svg {
		width: 18px;
		height: 18px;
	}

	.split-tab-label {
		font-size: 12px;
		font-weight: 600;
	}

	.split-tab-sub {
		font-size: 10px;
		font-family: var(--font-mono);
		opacity: 0.75;
	}

	.auto-fill {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		margin-bottom: 12px;
		background: color-mix(in oklab, var(--accent) 10%, transparent);
		border: 1px dashed color-mix(in oklab, var(--accent) 50%, transparent);
		border-radius: var(--radius);
		color: var(--ink);
		cursor: pointer;
		font: inherit;
		text-align: left;
		transition: background 0.12s ease, border-color 0.12s ease;
	}

	.auto-fill:hover {
		background: color-mix(in oklab, var(--accent) 18%, transparent);
		border-color: var(--accent);
	}

	.auto-fill svg {
		width: 18px;
		height: 18px;
		color: var(--accent);
		flex-shrink: 0;
	}

	.auto-fill-text {
		font-size: 12px;
		line-height: 1.4;
		color: var(--ink-2);
	}

	.auto-fill-text .num {
		color: var(--ink);
		font-weight: 600;
	}

	.member-list {
		gap: 12px;
	}

	.rounding-note {
		margin: 2px 0 0;
		font-size: 11px;
		text-align: right;
	}

	.member-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.checkbox {
		width: 20px;
		height: 20px;
		border-radius: 6px;
		border: 1.5px solid var(--line-2);
		background: transparent;
		color: var(--accent-ink);
		display: grid;
		place-items: center;
		flex-shrink: 0;
		cursor: pointer;
		padding: 0;
	}

	.checkbox.on {
		background: var(--accent);
		border-color: var(--accent);
	}

	.member-name {
		flex: 1;
		font-size: 13px;
		font-weight: 500;
	}

	.dim .member-name {
		color: var(--ink-3);
	}

	.member-amount {
		min-width: 64px;
		text-align: right;
		font-weight: 600;
		font-size: 13px;
	}

	.dash {
		font-size: 11px;
	}

	.shares-controls {
		align-items: center;
	}

	.step-btn {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg-2);
		color: var(--ink);
		cursor: pointer;
		font-size: 14px;
		font-weight: 700;
	}

	.share-value {
		min-width: 22px;
		text-align: center;
		font-weight: 700;
	}

	.amount-input-sm {
		width: 100%;
		padding: 8px 30px 8px 10px;
		font-size: 13px;
		text-align: right;
	}

	.split-amount-wrap {
		position: relative;
		width: 110px;
	}

	.sanity {
		font-size: 12px;
		flex-wrap: wrap;
		gap: 12px;
	}

	.sanity-value {
		font-weight: 600;
	}
</style>
