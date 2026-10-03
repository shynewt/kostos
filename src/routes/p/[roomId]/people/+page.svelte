<script lang="ts">
	import { page } from '$app/state';
	import { pickMemberColor, pickMemberEmoji } from '$lib/avatar';
	import { ANIMAL_EMOJIS } from '$lib/emojis';
	import { computeBalances, expenseShares } from '$lib/balance';
	import { expenseInBase } from '$lib/currency-convert';
	import Avatar from '$lib/components/Avatar.svelte';
	import MemberEmojiPicker from '$lib/components/MemberEmojiPicker.svelte';
	import ProjectAppBar from '$lib/components/ProjectAppBar.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import { formatAmount, formatSigned } from '$lib/money';
	import { getCurrentMember, setCurrentMember } from '$lib/storage';
	import {
		addMember,
		generateId,
		memberHistoryCount,
		removeMember,
		updateMember
	} from '$lib/sync/doc';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import type { Member } from '$lib/types';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const members = $derived(room.members);
	const expenses = $derived(room.expenses);

	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let editInputEl = $state<HTMLInputElement | null>(null);
	let removingId = $state<string | null>(null);
	let emojiPickerId = $state<string | null>(null);
	let newName = $state('');

	$effect(() => {
		if (editingId && editInputEl) editInputEl.focus();
	});

	// Local copy so claiming a member updates the UI at once; getCurrentMember reads
	// localStorage, which isn't reactive on its own.
	let currentMemberId = $state<string | null>(null);
	$effect(() => {
		currentMemberId = getCurrentMember(roomId);
	});

	function claimMember(m: Member) {
		setCurrentMember(roomId, m.id);
		currentMemberId = m.id;
	}

	const currencySymbol = $derived(room.currencySymbol);
	const currency = $derived(room.currency);
	const balances = $derived(computeBalances(members, expenses, room.currency));
	const balanceById = $derived(new Map(balances.map((b) => [b.memberId, b.net])));

	type MemberStats = { paid: number; owes: number; count: number };
	const statsById = $derived.by<Map<string, MemberStats>>(() => {
		const out = new Map<string, MemberStats>();
		for (const m of members) out.set(m.id, { paid: 0, owes: 0, count: 0 });
		// same basis as stats: spending only, converted to the group currency
		for (const raw of expenses) {
			if (raw.isSettlement) continue;
			const e = expenseInBase(raw, currency);
			const payerSet = new Set(e.payments.map((p) => p.memberId));
			for (const p of e.payments) {
				const cur = out.get(p.memberId);
				if (cur) cur.paid += p.amount;
			}
			const shares = expenseShares(e);
			for (const [memberId, amount] of shares) {
				const cur = out.get(memberId);
				if (cur) cur.owes += amount;
			}
			const touched = new Set<string>([...payerSet, ...shares.keys()]);
			for (const id of touched) {
				const cur = out.get(id);
				if (cur) cur.count += 1;
			}
		}
		return out;
	});

	function balanceTone(value: number): string {
		if (value > 0) return 'tone-owed';
		if (value < 0) return 'tone-owe';
		return 'tone-flat';
	}

	function balanceLabel(value: number): string {
		if (value > 0) return 'OWED';
		if (value < 0) return 'OWES';
		return 'FLAT';
	}

	function startEdit(member: Member) {
		editingId = member.id;
		editingName = member.name;
		removingId = null;
	}

	function cancelEdit() {
		editingId = null;
		editingName = '';
	}

	function commitEdit() {
		if (!editingId) return;
		const name = editingName.trim();
		if (!name) {
			cancelEdit();
			return;
		}
		updateMember(handle, editingId, { name });
		cancelEdit();
	}

	function startRemove(member: Member) {
		removingId = member.id;
		editingId = null;
	}

	function cancelRemove() {
		removingId = null;
	}

	function commitRemove(member: Member) {
		removeMember(handle, member.id);
		removingId = null;
	}

	function addNewMember(event?: Event) {
		event?.preventDefault();
		const name = newName.trim();
		if (!name) return;
		addMember(handle, {
			id: generateId(),
			name,
			color: pickMemberColor(members),
			emoji: pickMemberEmoji(members),
			createdAt: Date.now()
		});
		newName = '';
	}

	const pickerMember = $derived(members.find((m) => m.id === emojiPickerId) ?? null);

	function setEmoji(emoji: string) {
		if (!emojiPickerId) return;
		updateMember(handle, emojiPickerId, { emoji });
		emojiPickerId = null;
	}

	function clearEmoji() {
		if (!emojiPickerId) return;
		updateMember(handle, emojiPickerId, { emoji: '' });
		emojiPickerId = null;
	}
</script>

<svelte:head>
	<title>Members · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="people">
	<ProjectAppBar {roomId} {project} handle={room.handle} />

	<div class="scroll">
		<div class="section-head" style="margin-top: 4px;">
			<div class="eyebrow">{members.length} {members.length === 1 ? 'member' : 'members'}</div>
		</div>

		<div class="col gap-8 member-cards">
			{#each members as m (m.id)}
				{@const isYou = m.id === currentMemberId}
				{@const balance = balanceById.get(m.id) ?? 0}
				{@const stats = statsById.get(m.id) ?? { paid: 0, owes: 0, count: 0 }}
				{@const history = memberHistoryCount(handle, m.id)}
				<div class="card member-card" class:is-you={isYou}>
					<div class="row gap-12 member-top">
						<button
							type="button"
							class="avatar-btn"
							onclick={() => (emojiPickerId = m.id)}
							aria-label="Change {m.name}'s avatar"
						>
							<Avatar member={m} size="lg" />
						</button>
						<div class="col member-text">
							{#if editingId === m.id}
								<form class="row gap-6" onsubmit={commitEdit}>
									<input
										bind:this={editInputEl}
										class="input member-edit-input"
										bind:value={editingName}
										placeholder="Name"
										autocomplete="off"
									/>
									<button type="submit" class="btn btn-primary member-edit-save">Save</button>
									<button type="button" class="btn member-edit-cancel" onclick={cancelEdit}>Cancel</button>
								</form>
							{:else}
								<div class="row gap-6 member-name-row">
									<span class="member-name">{m.name}</span>
									{#if isYou}
										<span class="sticker sticker-on you-tag">YOU</span>
									{/if}
								</div>
								<div class="dim mono member-meta">
									{stats.count} {stats.count === 1 ? 'expense' : 'expenses'}
								</div>
							{/if}
						</div>
						<div class="col member-balance">
							<span class="num {balanceTone(balance)}">{formatSigned(balance, currencySymbol, currency)}</span>
							<span class="dim mono balance-label">{balanceLabel(balance)}</span>
						</div>
					</div>

					{#if editingId !== m.id && removingId !== m.id}
						<hr class="hairline member-rule" />
						<div class="row between stat-row">
							<div class="col stat-cell">
								<span class="dim mono stat-label">PUT IN</span>
								<span class="num stat-value">{formatAmount(stats.paid, currencySymbol, currency)}</span>
							</div>
							<div class="col stat-cell">
								<span class="dim mono stat-label">USED</span>
								<span class="num stat-value">{formatAmount(stats.owes, currencySymbol, currency)}</span>
							</div>
							<div class="row gap-6 member-actions">
								{#if !isYou}
									<button class="btn btn-ghost claim-btn" type="button" onclick={() => claimMember(m)}>
										This is me
									</button>
								{/if}
								<button class="icon-btn" type="button" onclick={() => startEdit(m)} aria-label="Rename">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h4l11-11-4-4L4 16v4zM14 6l4 4" /></svg>
								</button>
								<button class="icon-btn member-remove-btn" type="button" onclick={() => startRemove(m)} aria-label="Remove">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>
								</button>
							</div>
						</div>
					{/if}

					{#if removingId === m.id}
						<hr class="hairline member-rule" />
						<div class="remove-confirm">
							{#if history > 0 || balance !== 0}
								<p class="remove-warning">
									<strong>{m.name}</strong> shows up in <strong>{history}</strong>
									{history === 1 ? 'expense' : 'expenses'}{balance !== 0
										? ` and has an open balance of ${formatSigned(balance, currencySymbol, currency)}`
										: ''}.
									Removing them keeps the history but new transactions can no longer reference them.
								</p>
							{:else}
								<p class="remove-warning">Remove <strong>{m.name}</strong> from the group?</p>
							{/if}
							<div class="row gap-8 remove-actions">
								<button class="btn member-edit-cancel" type="button" onclick={cancelRemove}>Cancel</button>
								<button class="btn member-remove-confirm" type="button" onclick={() => commitRemove(m)}>
									Remove
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<form class="card add-card" onsubmit={addNewMember}>
			<div class="row gap-10">
				<span class="av av-sm add-bubble">+</span>
				<input
					class="input add-input"
					bind:value={newName}
					placeholder="Add a new member"
					autocomplete="off"
				/>
				<button type="submit" class="btn btn-primary add-btn" disabled={!newName.trim()}>
					Add
				</button>
			</div>
			<p class="dim add-hint">New members can claim a device later by joining the project link.</p>
		</form>
	</div>

	<TabBar {roomId} active="people" />
</div>

<MemberEmojiPicker
	open={pickerMember !== null}
	current={pickerMember?.emoji}
	name={pickerMember?.name ?? ''}
	emojis={ANIMAL_EMOJIS}
	onPick={setEmoji}
	onClear={clearEmoji}
	onClose={() => (emojiPickerId = null)}
/>

<style>
	.member-cards {
		gap: 8px;
	}

	.member-card {
		padding: 14px;
	}

	.member-card.is-you {
		border-color: color-mix(in oklab, var(--accent) 30%, var(--line));
	}

	.member-top {
		align-items: center;
	}

	.avatar-btn {
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
		border-radius: 999px;
		flex-shrink: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.avatar-btn:active {
		transform: scale(0.96);
	}

	.member-text {
		flex: 1;
		gap: 2px;
		min-width: 0;
	}

	.member-name-row {
		align-items: center;
	}

	.member-name {
		font-size: 15px;
		font-weight: 600;
	}

	.you-tag {
		padding: 1px 6px;
		font-size: 9px;
	}

	.member-meta {
		font-size: 11px;
	}

	.member-balance {
		align-items: flex-end;
		gap: 2px;
	}

	.balance-label {
		font-size: 10px;
		letter-spacing: 0.06em;
	}

	.member-rule {
		margin: 12px 0;
	}

	.stat-row {
		align-items: center;
		gap: 16px;
		font-size: 11px;
	}

	.stat-cell {
		gap: 6px;
	}

	.stat-label {
		font-size: 10px;
		letter-spacing: 0.06em;
	}

	.stat-value {
		font-family: var(--font-sans);
		font-variant-numeric: tabular-nums;
		font-size: 16px;
		font-weight: 600;
		letter-spacing: 0;
		color: var(--ink);
	}

	.member-actions {
		margin-left: auto;
		align-items: center;
	}

	.claim-btn {
		padding: 6px 10px;
		font-size: 12px;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.member-actions .icon-btn {
		width: 30px;
		height: 30px;
	}

	.member-actions svg {
		width: 14px;
		height: 14px;
	}

	.member-remove-btn {
		color: var(--owe);
	}

	.member-edit-input {
		flex: 1;
		padding: 8px 12px;
		font-size: 14px;
	}

	.member-edit-save,
	.member-edit-cancel {
		padding: 8px 12px;
		font-size: 12px;
	}

	.remove-confirm {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.remove-warning {
		margin: 0;
		font-size: 12px;
		color: var(--ink-2);
		line-height: 1.5;
	}

	.remove-actions {
		justify-content: flex-end;
	}

	.member-remove-confirm {
		background: var(--owe);
		color: var(--bg);
		border-color: var(--owe);
		padding: 8px 14px;
		font-size: 13px;
	}

	.add-card {
		margin-top: 14px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.add-bubble {
		background: transparent;
		border: 1px dashed var(--line-2);
		color: var(--ink-3);
	}

	.add-input {
		flex: 1;
		padding: 10px 14px;
		font-size: 14px;
	}

	.add-btn {
		padding: 8px 14px;
		font-size: 13px;
	}

	.add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.add-hint {
		font-size: 11px;
		font-family: var(--font-mono);
		margin: 0;
		line-height: 1.5;
	}
</style>
