<script lang="ts">
	import { page } from '$app/state';
	import EmptyCard from '$lib/components/EmptyCard.svelte';
	import ExpenseRow from '$lib/components/ExpenseRow.svelte';
	import ProjectAppBar from '$lib/components/ProjectAppBar.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import TripSheet from '$lib/components/TripSheet.svelte';
	import TripStrip from '$lib/components/TripStrip.svelte';
	import { spentInBase } from '$lib/currency-convert';
	import { formatAmount } from '$lib/money';
	import { getCurrentMember } from '$lib/storage';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import { readTripSelection, scopeExpenses, writeTripSelection } from '$lib/trips';
	import type { Expense } from '$lib/types';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const project = $derived(room.project);
	const members = $derived(room.members);
	const expenses = $derived(room.expenses);

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));
	const currencySymbol = $derived(room.currencySymbol);
	const currency = $derived(room.currency);
	const membersById = $derived(room.membersById);
	const categoryById = $derived(room.categoryById);
	const methodById = $derived(room.methodById);
	const tripsById = $derived(room.tripsById);

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	function clearQuery() {
		query = '';
		searchEl?.focus();
	}

	function matchesQuery(e: Expense, q: string): boolean {
		if (e.description && e.description.toLowerCase().includes(q)) return true;
		if (e.notes && e.notes.toLowerCase().includes(q)) return true;
		for (const p of e.payments) {
			const name = membersById.get(p.memberId)?.name?.toLowerCase();
			if (name && name.includes(q)) return true;
		}
		if (e.categoryId) {
			const cat = categoryById.get(e.categoryId)?.name?.toLowerCase();
			if (cat && cat.includes(q)) return true;
		}
		if (e.paymentMethodId) {
			const method = methodById.get(e.paymentMethodId)?.name?.toLowerCase();
			if (method && method.includes(q)) return true;
		}
		return false;
	}

	const trips = $derived(room.trips);
	let selectedTripId = $state<string | null>(null);
	$effect(() => {
		const saved = readTripSelection(roomId);
		selectedTripId =
			saved && trips.some((t) => t.id === saved && t.closedAt === undefined) ? saved : null;
	});
	const selectedTrip = $derived(
		selectedTripId ? (trips.find((t) => t.id === selectedTripId) ?? null) : null
	);
	const scopedExpenses = $derived(scopeExpenses(expenses, selectedTripId));

	function selectTrip(tripId: string | null) {
		selectedTripId = tripId;
		writeTripSelection(roomId, tripId);
	}

	let tripSheetOpen = $state(false);
	function selectFromSheet(tripId: string | null) {
		selectTrip(tripId);
		tripSheetOpen = false;
	}

	const expenseCountForTrip = $derived((tripId: string) =>
		expenses.reduce((n, e) => (e.tripId === tripId ? n + 1 : n), 0)
	);

	const filtered = $derived.by(() => {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return scopedExpenses;
		return scopedExpenses.filter((e) => matchesQuery(e, trimmed));
	});

	type DayGroup = { key: string; label: string; total: number; items: Expense[] };

	const allGroups = $derived.by<DayGroup[]>(() => {
		const buckets = new Map<string, DayGroup>();
		const sorted = [...filtered].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
		for (const e of sorted) {
			const key = dayKey(e.date);
			let bucket = buckets.get(key);
			if (!bucket) {
				bucket = { key, label: dayLabel(e.date), total: 0, items: [] };
				buckets.set(key, bucket);
			}
			bucket.items.push(e);
		}
		for (const bucket of buckets.values()) bucket.total = spentInBase(bucket.items, currency);
		return [...buckets.values()];
	});

	const INITIAL_DAYS = 12;
	const DAY_STEP = 10;
	let visibleDays = $state(INITIAL_DAYS);

	// Reset window whenever the filter changes so search results start at the top.
	$effect(() => {
		query;
		visibleDays = INITIAL_DAYS;
	});

	const visibleGroups = $derived(allGroups.slice(0, visibleDays));
	const hasMore = $derived(visibleDays < allGroups.length);

	function onScroll(e: Event) {
		if (!hasMore) return;
		const el = e.currentTarget as HTMLElement;
		const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
		if (remaining < 800) {
			visibleDays = Math.min(allGroups.length, visibleDays + DAY_STEP);
		}
	}

	const overallTotal = $derived(spentInBase(filtered, currency));
	const isFiltering = $derived(query.trim().length > 0);

	function dayKey(ts: number): string {
		const d = new Date(ts);
		return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
			.getDate()
			.toString()
			.padStart(2, '0')}`;
	}

	function dayLabel(ts: number): string {
		const d = new Date(ts);
		const today = new Date();
		const yesterday = new Date();
		yesterday.setDate(today.getDate() - 1);
		const isSameDay = (a: Date, b: Date) =>
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();
		if (isSameDay(d, today)) return `${formatShort(d)} · TODAY`;
		if (isSameDay(d, yesterday)) return `${formatShort(d)} · YESTERDAY`;
		return `${formatShort(d)} · ${d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}`;
	}

	function formatShort(d: Date): string {
		return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase();
	}

</script>

<svelte:head>
	<title>Expenses · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="expenses-list">
	<ProjectAppBar {roomId} {project} handle={room.handle} />

	<div class="search-bar">
		<span class="search-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></svg>
		</span>
		<input
			bind:this={searchEl}
			bind:value={query}
			class="search-input"
			placeholder="Search title, payer, category, method, notes"
			type="search"
			autocomplete="off"
			spellcheck="false"
		/>
		{#if query}
			<button
				class="search-clear"
				type="button"
				onclick={clearQuery}
				aria-label="Clear search"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		{/if}
	</div>

	<div class="scroll" onscroll={onScroll}>
		<TripStrip
			{trips}
			{selectedTripId}
			expenseCountAll={expenses.length}
			{expenseCountForTrip}
			onSelect={selectTrip}
			onOverflowOpen={() => (tripSheetOpen = true)}
		/>

		<TripSheet
			open={tripSheetOpen}
			{trips}
			{selectedTripId}
			manageHref="/p/{roomId}/settings/trips"
			onSelect={selectFromSheet}
			onClose={() => (tripSheetOpen = false)}
		/>

		<section class="card summary-card">
			<div class="col">
				<div class="eyebrow summary-eyebrow">
					{isFiltering ? 'Matches' : 'Total spent'}
				</div>
				<div class="num summary-amount">
					<span class="summary-sym">{currencySymbol}</span>{formatAmount(overallTotal, "", currency)}
				</div>
			</div>
			<div class="col" style="align-items: flex-end;">
				<div class="dim mono summary-count">
					{filtered.length} {filtered.length === 1 ? 'EXPENSE' : 'EXPENSES'}
				</div>
				<div class="dim mono summary-count">
					{allGroups.length} {allGroups.length === 1 ? 'DAY' : 'DAYS'}
				</div>
			</div>
		</section>

		{#if scopedExpenses.length === 0 && selectedTrip}
			<EmptyCard>
				<p>No expenses tagged to <strong>{selectedTrip.name}</strong> yet.</p>
			</EmptyCard>
		{:else if expenses.length === 0}
			<EmptyCard>
				<p>No expenses yet. Tap the + button to add the first one.</p>
			</EmptyCard>
		{:else if filtered.length === 0}
			<EmptyCard>
				<p>No expenses match <strong>“{query.trim()}”</strong>.</p>
			</EmptyCard>
		{:else}
			{#each visibleGroups as g (g.key)}
				<div class="section-head day-head">
					<div class="eyebrow">{g.label}</div>
					<div class="dim mono day-total">{formatAmount(g.total, currencySymbol, currency)}</div>
				</div>
				<div class="card day-card">
					{#each g.items as e, i (e.id)}
						{#if i > 0}<hr class="hairline" style="margin-left: 56px;" />{/if}
						<ExpenseRow
							expense={e}
							href="/p/{roomId}/expenses/{e.id}"
							{membersById}
							{categoryById}
							{methodById}
							{tripsById}
							{currentMemberId}
							symbol={currencySymbol} {currency}
							totalMembers={members.length}
							showDate={false}
							{query}
						/>
					{/each}
				</div>
			{/each}
			{#if hasMore}
				<div class="more-sentinel dim mono">Loading more…</div>
			{/if}
		{/if}
	</div>

	<TabBar {roomId} active="expenses" />
</div>

<style>
	.summary-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px;
		margin-top: 4px;
	}

	.summary-eyebrow {
		margin-bottom: 4px;
	}

	.summary-amount {
		font-size: 24px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.summary-sym {
		opacity: 0.6;
		margin-right: 2px;
	}

	.summary-count {
		font-size: 10px;
		letter-spacing: 0.06em;
	}

	.day-head {
		margin: 22px 0 8px;
	}

	/* match the list's first-gap so the empty state isn't crammed under the summary */
	.scroll :global(.empty-card) {
		margin-top: 22px;
	}

	.day-total {
		font-size: 11px;
	}

	.day-card {
		padding: 4px;
		content-visibility: auto;
		contain-intrinsic-size: auto 200px;
	}

	.more-sentinel {
		text-align: center;
		padding: 18px 0 8px;
		font-size: 11px;
		letter-spacing: 0.06em;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 22px 4px;
		background: var(--bg);
	}

	.search-icon {
		display: grid;
		place-items: center;
		color: var(--ink-3);
	}

	.search-icon svg {
		width: 18px;
		height: 18px;
	}

	.search-input {
		flex: 1;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		padding: 10px 14px;
		font-size: 14px;
		outline: none;
		font-family: var(--font-sans);
	}

	.search-input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent);
	}

	.search-input::placeholder {
		color: var(--ink-3);
	}

	.search-clear {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		background: transparent;
		border: 0;
		color: var(--ink-2);
		cursor: pointer;
	}

	.search-clear svg {
		width: 14px;
		height: 14px;
	}
</style>
