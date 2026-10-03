<script lang="ts">
	import { page } from '$app/state';
	import EmojiTilePicker from '$lib/components/EmojiTilePicker.svelte';
	import EmptyCard from '$lib/components/EmptyCard.svelte';
	import ScreenAppBar from '$lib/components/ScreenAppBar.svelte';
	import {
		addTrip,
		assignExpensesToTrip,
		generateId,
		removeTrip,
		updateTrip
	} from '$lib/sync/doc';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import { expenseBaseAmount } from '$lib/currency-convert';
	import { formatAmount } from '$lib/money';
	import { partitionTrips, untaggedExpensesInTrip } from '$lib/trips';
	import type { Trip } from '$lib/types';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const trips = $derived(room.trips);
	const expenses = $derived(room.expenses);
	const partition = $derived(partitionTrips(trips));

	let editingId = $state<string | null>(null);
	let draft = $state<TripDraft>(emptyDraft());
	let pastOpen = $state(false);
	// untagged expenses that fell inside a trip's dates when it was saved
	let tagOffer = $state<{ trip: Trip; expenseIds: string[] } | null>(null);

	type TripDraft = {
		name: string;
		emoji: string;
		startDate: string;
		endDate: string;
		openEnded: boolean;
	};

	function emptyDraft(): TripDraft {
		const today = new Date().toISOString().slice(0, 10);
		return { name: '', emoji: '🏖', startDate: today, endDate: today, openEnded: false };
	}

	function startNew() {
		draft = emptyDraft();
		editingId = 'new';
	}

	function startEdit(t: Trip) {
		draft = {
			name: t.name,
			emoji: t.emoji,
			startDate: toDateInput(t.startDate),
			endDate: t.endDate !== undefined ? toDateInput(t.endDate) : toDateInput(t.startDate),
			openEnded: t.endDate === undefined
		};
		editingId = t.id;
	}

	function cancel() {
		editingId = null;
	}

	const canSave = $derived(
		draft.name.trim().length > 0 &&
			draft.startDate.length > 0 &&
			(draft.openEnded || draft.endDate >= draft.startDate)
	);

	function save() {
		if (!canSave || !editingId) return;
		const name = draft.name.trim();
		const emoji = Array.from(draft.emoji.trim())[0] ?? '🏖';
		const startDate = new Date(draft.startDate).getTime();
		const endDate = draft.openEnded ? undefined : new Date(draft.endDate).getTime();

		if (editingId === 'new') {
			const trip: Trip = {
				id: generateId(),
				name,
				emoji,
				startDate,
				endDate,
				createdAt: Date.now()
			};
			addTrip(handle, trip);
			offerTagging(trip);
		} else {
			const existing = trips.find((t) => t.id === editingId);
			updateTrip(handle, editingId, { name, emoji, startDate, endDate });
			const datesMoved = existing && (existing.startDate !== startDate || existing.endDate !== endDate);
			if (existing && datesMoved) offerTagging({ ...existing, name, emoji, startDate, endDate });
		}
		editingId = null;
	}

	let offerExpanded = $state(false);

	function offerTagging(trip: Trip) {
		offerExpanded = false;
		const matches = untaggedExpensesInTrip(expenses, trip, [...trips, trip]);
		tagOffer = matches.length > 0 ? { trip, expenseIds: matches.map((e) => e.id) } : null;
	}

	const OFFER_PREVIEW = 4;

	// re-checked live: another device may have tagged or moved some of these meanwhile, and a
	// deleted trip drops the offer
	const offeredExpenses = $derived.by(() => {
		if (!tagOffer) return [];
		const trip = trips.find((t) => t.id === tagOffer!.trip.id);
		if (!trip) return [];
		const ids = new Set(tagOffer.expenseIds);
		return untaggedExpensesInTrip(expenses, trip, trips)
			.filter((e) => ids.has(e.id))
			.sort((a, b) => a.date - b.date);
	});

	const offeredTotal = $derived(
		offeredExpenses.reduce((sum, e) => sum + expenseBaseAmount(e, project?.currency), 0)
	);

	function acceptTagging() {
		if (!tagOffer || offeredExpenses.length === 0) return;
		assignExpensesToTrip(
			handle,
			offeredExpenses.map((e) => e.id),
			tagOffer.trip.id
		);
		tagOffer = null;
	}

	function shortDay(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	}

	function confirmDelete(t: Trip) {
		const count = expenses.filter((e) => e.tripId === t.id).length;
		const message =
			count === 0
				? `Delete "${t.name}"?`
				: `Delete "${t.name}"? ${count} expense${count === 1 ? '' : 's'} will be untagged but kept.`;
		if (!confirm(message)) return;
		removeTrip(handle, t.id);
		if (editingId === t.id) editingId = null;
	}

	function toDateInput(ms: number): string {
		return new Date(ms).toISOString().slice(0, 10);
	}

	function rangeLabel(t: Trip): string {
		const start = toDateInput(t.startDate);
		if (t.endDate === undefined) return `${start} → open-ended`;
		const end = toDateInput(t.endDate);
		return start === end ? start : `${start} → ${end}`;
	}

	function expenseCount(tripId: string): number {
		return expenses.reduce((n, e) => (e.tripId === tripId ? n + 1 : n), 0);
	}
</script>

<svelte:head>
	<title>Trips · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="trips">
	<ScreenAppBar title="Trips" backHref="/p/{roomId}/settings" />

	<div class="scroll">
		<p class="dim intro">
			Create a trip to group expenses. Use trips for holidays, parties, or any event.
		</p>

		{#if trips.length === 0}
			<EmptyCard>
				<p>No trips yet. Create one to start tagging expenses.</p>
			</EmptyCard>
		{:else}
			{#if partition.active.length > 0}
				<div class="section-head">
					<div class="eyebrow">Active</div>
					<span class="dim mono section-count">{partition.active.length}</span>
				</div>
				<div class="card trip-list">
					{#each partition.active as t, i (t.id)}
						{#if i > 0}<hr class="hairline" />{/if}
						{@render tripRow(t)}
					{/each}
				</div>
			{/if}

			{#if partition.past.length > 0}
				<button
					type="button"
					class="past-toggle"
					aria-expanded={pastOpen}
					onclick={() => (pastOpen = !pastOpen)}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="past-chevron" class:open={pastOpen}>
						<path d="M9 6l6 6-6 6" />
					</svg>
					<span class="eyebrow">Past</span>
					<span class="dim mono section-count">{partition.past.length}</span>
				</button>
				{#if pastOpen}
					<div class="card trip-list">
						{#each partition.past as t, i (t.id)}
							{#if i > 0}<hr class="hairline" />{/if}
							{@render tripRow(t)}
						{/each}
					</div>
				{/if}
			{/if}
		{/if}

		{#snippet tripRow(t: Trip)}
			<div class="trip-row">
				<span class="trip-emoji">{t.emoji}</span>
				<div class="col trip-text">
					<span class="trip-name">{t.name}</span>
					<span class="dim mono trip-meta">
						{rangeLabel(t)} · {expenseCount(t.id)} expense{expenseCount(t.id) === 1 ? '' : 's'}
					</span>
				</div>
				<button type="button" class="icon-btn" onclick={() => startEdit(t)} aria-label="Edit trip">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" />
					</svg>
				</button>
				<button type="button" class="icon-btn danger-btn" onclick={() => confirmDelete(t)} aria-label="Delete trip">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
						<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
					</svg>
				</button>
			</div>
		{/snippet}

		{#if tagOffer && offeredExpenses.length > 0}
			{@const count = offeredExpenses.length}
			<aside class="card tag-offer" aria-labelledby="tag-offer-title">
				<span class="tag-offer-emoji" aria-hidden="true">{tagOffer.trip.emoji}</span>
				<div class="tag-offer-body">
					<div class="tag-offer-title" id="tag-offer-title">
						Add {count} {count === 1 ? 'expense' : 'expenses'} to {tagOffer.trip.name}?
					</div>
					<p class="tag-offer-text">
						{count === 1 ? 'It falls' : 'They fall'} within the trip's dates but {count === 1
							? "isn't"
							: "aren't"} in any trip yet.
					</p>
					<ul class="tag-offer-list" class:expanded={offerExpanded}>
						{#each offerExpanded ? offeredExpenses : offeredExpenses.slice(0, OFFER_PREVIEW) as e (e.id)}
							<li>
								<span class="dim mono tag-offer-date">{shortDay(e.date)}</span>
								<span class="tag-offer-name">{e.description || 'Expense'}</span>
								<span class="num tag-offer-amount">
									{formatAmount(expenseBaseAmount(e, project?.currency), project?.currencySymbol ?? '', project?.currency)}
								</span>
							</li>
						{/each}
					</ul>
					<div class="row between tag-offer-summary">
						{#if count > OFFER_PREVIEW}
							<button
								type="button"
								class="tag-offer-more"
								aria-expanded={offerExpanded}
								onclick={() => (offerExpanded = !offerExpanded)}
							>
								{offerExpanded ? 'Show fewer' : `+${count - OFFER_PREVIEW} more`}
							</button>
						{:else}
							<span></span>
						{/if}
						<span class="dim mono tag-offer-total">
							{#if count > 1}{formatAmount(
									offeredTotal,
									project?.currencySymbol ?? '',
									project?.currency
								)} total{/if}
						</span>
					</div>
					<div class="row gap-6 tag-offer-actions">
						<button type="button" class="btn btn-primary tag-offer-btn" onclick={acceptTagging}>
							{count === 1 ? 'Add it' : count === 2 ? 'Add both' : `Add all ${count}`}
						</button>
						<button type="button" class="btn btn-ghost tag-offer-btn" onclick={() => (tagOffer = null)}>
							Not now
						</button>
					</div>
				</div>
			</aside>
		{/if}

		{#if editingId}
			<div class="card edit-card">
				<div class="eyebrow edit-head">{editingId === 'new' ? 'New trip' : 'Edit trip'}</div>
				<div class="edit-grid">
					<EmojiTilePicker
						emoji={draft.emoji}
						color={project?.color ?? 'lime'}
						onPick={(value) => (draft.emoji = value)}
					/>
					<input
						class="input name-input"
						bind:value={draft.name}
						placeholder="Trip name"
						aria-label="Trip name"
					/>
				</div>
				<div class="date-grid">
					<label class="date-label">
						<span class="dim mono">START</span>
						<input class="input date-input" type="date" bind:value={draft.startDate} />
					</label>
					<label class="date-label">
						<span class="dim mono">END</span>
						<input
							class="input date-input"
							type="date"
							bind:value={draft.endDate}
							disabled={draft.openEnded}
						/>
					</label>
				</div>
				<label class="open-toggle">
					<input type="checkbox" bind:checked={draft.openEnded} />
					<span>Open-ended (no end date)</span>
				</label>
				<div class="edit-actions">
					<button type="button" class="btn btn-block" onclick={cancel}>Cancel</button>
					<button type="button" class="btn btn-primary btn-block" disabled={!canSave} onclick={save}>
						{editingId === 'new' ? 'Create' : 'Save'}
					</button>
				</div>
			</div>
		{:else}
			<button type="button" class="btn btn-block new-trip-btn" onclick={startNew}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<path d="M12 5v14M5 12h14" />
				</svg>
				<span>New trip</span>
			</button>
		{/if}
	</div>
</div>

<style>
	.tag-offer {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		margin-top: 14px;
		padding: 16px 16px 18px;
		background: color-mix(in oklab, var(--accent) 9%, var(--bg-2));
		border: 1px dashed color-mix(in oklab, var(--accent) 45%, var(--line));
	}

	.tag-offer-emoji {
		font-size: 26px;
		line-height: 1;
		padding-top: 2px;
	}

	.tag-offer-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.tag-offer-title {
		font-size: 14px;
		font-weight: 600;
	}

	.tag-offer-text {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--ink-2);
	}

	.tag-offer-list {
		list-style: none;
		margin: 2px 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}

	.tag-offer-list li {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 7px 0;
		border-bottom: 1px solid var(--line);
		font-size: 13px;
	}

	.tag-offer-date {
		flex: 0 0 48px;
		font-size: 11px;
	}

	.tag-offer-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tag-offer-amount {
		font-size: 12px;
		color: var(--ink-2);
	}

	.tag-offer-list.expanded {
		max-height: 260px;
		overflow-y: auto;
	}

	.tag-offer-summary {
		align-items: center;
		min-height: 18px;
	}

	.tag-offer-more {
		padding: 0;
		background: none;
		border: 0;
		font: inherit;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--accent);
		cursor: pointer;
	}

	.tag-offer-total {
		font-size: 11px;
	}

	.tag-offer-actions {
		margin-top: 4px;
	}

	.tag-offer-btn {
		padding: 8px 14px;
		font-size: 13px;
	}

	.intro {
		font-size: 12px;
		font-family: var(--font-mono);
		line-height: 1.5;
		margin: 8px 0 14px;
	}

	.trip-list {
		padding: 4px;
	}

	.trip-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
	}

	.trip-emoji {
		width: 28px;
		text-align: center;
		font-size: 22px;
	}

	.trip-text {
		flex: 1;
		gap: 2px;
	}

	.trip-name {
		font-size: 14px;
		font-weight: 600;
	}

	.trip-meta {
		font-size: 10px;
	}

	.danger-btn {
		color: var(--owe);
	}

	.past-toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: inherit;
		cursor: pointer;
		padding: 14px 16px;
		margin-top: 14px;
		width: 100%;
		min-height: 48px;
		text-align: left;
		font: inherit;
	}

	.past-toggle .eyebrow {
		flex: 1;
		font-size: 12px;
	}

	.past-toggle .section-count {
		font-size: 12px;
	}

	.past-chevron {
		width: 16px;
		height: 16px;
		color: var(--ink-3);
		transition: transform 0.15s ease;
		flex-shrink: 0;
	}

	.past-chevron.open {
		transform: rotate(90deg);
	}

	.edit-card {
		margin-top: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.edit-head {
		margin-bottom: 4px;
	}

	.edit-grid {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.name-input {
		flex: 1;
		font-size: 15px;
		font-weight: 500;
		padding: 12px 14px;
	}

	.date-grid {
		display: flex;
		gap: 10px;
	}

	.date-label {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 10px;
		letter-spacing: 0.06em;
	}

	.date-input {
		font-size: 14px;
		padding: 10px 12px;
		font-family: var(--font-sans);
	}

	.date-input:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.open-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--ink-2);
		cursor: pointer;
	}

	.open-toggle input {
		accent-color: var(--accent);
	}

	.edit-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}

	.new-trip-btn {
		margin-top: 14px;
		justify-content: center;
		gap: 6px;
		color: var(--accent);
		border-color: color-mix(in oklab, var(--accent) 30%, var(--line));
	}

	.new-trip-btn svg {
		width: 16px;
		height: 16px;
	}
</style>
