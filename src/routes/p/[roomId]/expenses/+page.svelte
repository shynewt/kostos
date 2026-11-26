<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/components/Avatar.svelte';
	import EmptyCard from '$lib/components/EmptyCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ExpenseFilterSheet from '$lib/components/ExpenseFilterSheet.svelte';
	import ExpenseRow from '$lib/components/ExpenseRow.svelte';
	import ProjectAppBar from '$lib/components/ProjectAppBar.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import { spentInBase } from '$lib/currency-convert';
	import { EMPTY_FILTER, NONE, activeFilterCount, applyFilter, filterFromParams, writeFilterParams, type ExpenseFilter } from '$lib/expense-filter';
	import { matchesSearch, searchTerms, type SearchLookup } from '$lib/expense-search';
	import { formatAmount } from '$lib/money';
	import { monthOf, periodKey, periodLabel, spendLines } from '$lib/stats';
	import { getCurrentMember } from '$lib/storage';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import type { Expense, Member } from '$lib/types';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const project = $derived(room.project);
	const members = $derived(room.members);
	const expenses = $derived(room.expenses);

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));
	const conflictIds = $derived(new Set(room.conflicts.map((c) => c.id)));
	const currencySymbol = $derived(room.currencySymbol);
	const currency = $derived(room.currency);
	const membersById = $derived(room.membersById);
	const categoryById = $derived(room.categoryById);
	const methodById = $derived(room.methodById);
	const tripsById = $derived(room.tripsById);
	const myMemberId = $derived(currentMemberId && membersById.has(currentMemberId) ? currentMemberId : null);

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	function clearQuery() {
		query = '';
		searchEl?.focus();
	}

	const searchLookup = $derived<SearchLookup>({
		memberNames: new Map(members.map((m) => [m.id, m.name])),
		categoryNames: new Map([...categoryById.values()].map((c) => [c.id, c.name])),
		methodNames: new Map([...methodById.values()].map((m) => [m.id, m.name])),
		tripNames: new Map(room.trips.map((t) => [t.id, t.name])),
		baseCurrency: currency
	});

	const trips = $derived(room.trips);

	const filter = $derived(filterFromParams(page.url.searchParams));
	const filterCount = $derived(activeFilterCount(filter));
	let filterSheetOpen = $state(false);

	function setFilter(next: ExpenseFilter) {
		const url = new URL(page.url);
		writeFilterParams(next, url.searchParams);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const filterScoped = $derived(applyFilter(expenses, filter, currency));
	const terms = $derived(searchTerms(query));
	const filtered = $derived(terms.length === 0 ? filterScoped : filterScoped.filter((e) => matchesSearch(e, terms, searchLookup)));

	type FilterChip = { key: string; label: string; clear: () => void; member?: Member };

	function pickedNames(ids: string[], nameOf: (id: string) => string): string {
		const first = nameOf(ids[0]);
		return ids.length > 1 ? `${first} +${ids.length - 1}` : first;
	}

	function dateRangeLabel(from: string | null, to: string | null): string {
		const format = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
		const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
		if (from && to) return format.formatRange(day(from), day(to));
		return from ? `From ${format.format(day(from))}` : `Until ${format.format(day(to ?? ''))}`;
	}

	const filterChips = $derived.by<FilterChip[]>(() => {
		const chips: FilterChip[] = [];
		if (filter.from !== null || filter.to !== null) {
			chips.push({ key: 'date', label: dateRangeLabel(filter.from, filter.to), clear: () => setFilter({ ...filter, from: null, to: null }) });
		}
		if (filter.minAmount !== null || filter.maxAmount !== null) {
			const money = (cents: number) => formatAmount(cents, currencySymbol, currency);
			const label =
				filter.minAmount !== null && filter.maxAmount !== null
					? `${money(filter.minAmount)} – ${money(filter.maxAmount)}`
					: filter.minAmount !== null
						? `≥ ${money(filter.minAmount)}`
						: `≤ ${money(filter.maxAmount ?? 0)}`;
			chips.push({ key: 'amount', label, clear: () => setFilter({ ...filter, minAmount: null, maxAmount: null }) });
		}
		if (filter.payerIds.length > 0) {
			const label = `Paid by ${pickedNames(filter.payerIds, (id) => membersById.get(id)?.name ?? 'Removed member')}`;
			const member = membersById.get(filter.payerIds[0]);
			chips.push({ key: 'payer', label, member, clear: () => setFilter({ ...filter, payerIds: [] }) });
		}
		if (filter.categoryIds.length > 0) {
			const label = pickedNames(filter.categoryIds, (id) => {
				if (id === NONE) return 'No category';
				const category = categoryById.get(id);
				return category ? `${category.emoji} ${category.name}` : 'Removed category';
			});
			chips.push({ key: 'category', label, clear: () => setFilter({ ...filter, categoryIds: [] }) });
		}
		if (filter.methodIds.length > 0) {
			const label = pickedNames(filter.methodIds, (id) => {
				if (id === NONE) return 'No payment method';
				const method = methodById.get(id);
				return method ? `${method.emoji} ${method.name}` : 'Removed method';
			});
			chips.push({ key: 'method', label, clear: () => setFilter({ ...filter, methodIds: [] }) });
		}
		if (filter.tripIds.length > 0) {
			const label = pickedNames(filter.tripIds, (id) => {
				if (id === NONE) return 'No trip';
				const trip = tripsById.get(id);
				return trip ? `${trip.emoji} ${trip.name}` : 'Removed trip';
			});
			chips.push({ key: 'trip', label, clear: () => setFilter({ ...filter, tripIds: [] }) });
		}
		return chips;
	});

	const singleTripId = $derived(filter.tripIds.length === 1 && filter.tripIds[0] !== NONE ? filter.tripIds[0] : null);

	type DayGroup = { key: string; monthKey: string; label: string; total: number; items: Expense[] };
	type MonthSummary = { label: string; total: number; myShare: number | null };

	const allGroups = $derived.by<DayGroup[]>(() => {
		const buckets = new Map<string, DayGroup>();
		const sorted = filtered.toSorted((a, b) => b.date - a.date || b.createdAt - a.createdAt);
		for (const e of sorted) {
			const key = dayKey(e.date);
			let bucket = buckets.get(key);
			if (!bucket) {
				bucket = { key, monthKey: periodKey(monthOf(e.date)), label: dayLabel(e.date), total: 0, items: [] };
				buckets.set(key, bucket);
			}
			bucket.items.push(e);
		}
		for (const bucket of buckets.values()) bucket.total = spentInBase(bucket.items, currency);
		return [...buckets.values()];
	});

	const monthSummaries = $derived.by(() => {
		const itemsByMonth = new Map<string, Expense[]>();
		for (const day of allGroups) {
			const items = itemsByMonth.get(day.monthKey) ?? [];
			items.push(...day.items);
			itemsByMonth.set(day.monthKey, items);
		}
		const summaries = new Map<string, MonthSummary>();
		for (const [key, items] of itemsByMonth) {
			summaries.set(key, { label: monthLabel(items[0].date), total: spentInBase(items, currency), myShare: shareOf(items) });
		}
		return summaries;
	});

	function shareOf(items: Expense[]): number | null {
		if (!myMemberId) return null;
		return spendLines(items, currency, { kind: 'member', memberId: myMemberId }).reduce((sum, line) => sum + line.amount, 0);
	}

	const INITIAL_DAYS = 12;
	const DAY_STEP = 10;
	let visibleDays = $state(INITIAL_DAYS);

	// Reset window whenever the filter changes so search results start at the top.
	$effect(() => {
		query;
		page.url.search;
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
	const overallShare = $derived(shareOf(filtered));
	const isFiltering = $derived(query.trim().length > 0);
	// across the whole group a lifetime total says little; the month headers carry the totals
	const showSummary = $derived(isFiltering || filterCount > 0);

	// expense days are UTC days, see $lib/stats, so months and days here must be UTC too
	function dayKey(ts: number): string {
		return new Date(ts).toISOString().slice(0, 10);
	}

	// the month header above already names the month
	function dayLabel(ts: number): string {
		const today = Date.now();
		const weekday = new Date(ts).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
		const label = `${weekday} ${new Date(ts).getUTCDate()}`.toUpperCase();
		if (dayKey(ts) === dayKey(today)) return `${label} · TODAY`;
		if (dayKey(ts) === dayKey(today - 86_400_000)) return `${label} · YESTERDAY`;
		return label;
	}

	function monthLabel(ts: number): string {
		return periodLabel(monthOf(ts)).toUpperCase();
	}

</script>

<svelte:head>
	<title>Expenses · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="expenses-list">
	<ProjectAppBar {roomId} {project} />

	<div class="search-bar">
		<div class="search-field">
			<span class="search-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></svg>
			</span>
			<input
				bind:this={searchEl}
				bind:value={query}
				class="search-input"
				placeholder="Search expenses"
				aria-label="Search expenses by title, payer, category, payment method or note"
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
		<button
			type="button"
			class="icon-btn filter-btn"
			class:on={filterCount > 0}
			aria-haspopup="dialog"
			aria-label={filterCount > 0 ? `Filters, ${filterCount} on` : 'Filters'}
			onclick={() => (filterSheetOpen = true)}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
			{#if filterCount > 0}<span class="filter-badge">{filterCount}</span>{/if}
		</button>
	</div>

	<div class="scroll" onscroll={onScroll}>
		{#if filterChips.length > 0}
			<div class="filter-row">
				{#each filterChips as chip (chip.key)}
					<button type="button" class="chip active-filter" onclick={chip.clear} aria-label="Remove filter: {chip.label}">
						{#if chip.member}<Avatar member={chip.member} size="xs" />{/if}
						<span>{chip.label}</span>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
					</button>
				{/each}
			</div>
		{/if}

		{#if filterSheetOpen}
			<ExpenseFilterSheet
				{filter}
				{members}
				categories={project?.categories ?? []}
				methods={[...methodById.values()]}
				{trips}
				{currencySymbol}
				{currency}
				resultCount={filtered.length}
				onChange={setFilter}
				onClose={() => (filterSheetOpen = false)}
			/>
		{/if}

		{#if showSummary && filtered.length > 0}
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
				{#if overallShare !== null}
					<div class="dim mono summary-count">
						YOUR SHARE {formatAmount(overallShare, currencySymbol, currency)}
					</div>
				{/if}
			</div>
		</section>
		{/if}

		{#if expenses.length === 0}
			<EmptyState>
				<p>No expenses yet. Tap the + button to add the first one.</p>
			</EmptyState>
		{:else if filtered.length === 0}
			<EmptyCard>
				{#if query.trim()}
					<p>No expenses match <strong>“{query.trim()}”</strong>{filterCount > 0 ? ' with these filters' : ''}.</p>
				{:else}
					<p>No expenses match these filters.</p>
				{/if}
				{#if filterCount > 0}
					<button type="button" class="btn clear-filters" onclick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>
				{/if}
			</EmptyCard>
		{:else}
			{#each visibleGroups as g, i (g.key)}
				{#if i === 0 || visibleGroups[i - 1].monthKey !== g.monthKey}
					{@const month = monthSummaries.get(g.monthKey)}
					{#if month}
						<div class="month-head">
							<h2 class="eyebrow month-label">{month.label}</h2>
							<div class="mono month-totals">
								<span>{formatAmount(month.total, currencySymbol, currency)}</span>
								{#if month.myShare !== null}<span class="dim">· your share {formatAmount(month.myShare, currencySymbol, currency)}</span>{/if}
							</div>
						</div>
					{/if}
				{/if}
				<div class="section-head day-head">
					<div class="eyebrow">{g.label}</div>
					<div class="dim mono day-total">{formatAmount(g.total, currencySymbol, currency)}</div>
				</div>
				<div class="card day-card">
					{#each g.items as e, i (e.id)}
						{#if i > 0}<hr class="hairline" style="margin-left: 66px;" />{/if}
						<ExpenseRow
							expense={e}
							href="/p/{roomId}/expenses/{e.id}"
							{membersById}
							{categoryById}
							tripsById={singleTripId ? undefined : tripsById}
							{currentMemberId}
							symbol={currencySymbol} {currency}
							totalMembers={members.length}
							showDate={false}
							{query}
							conflict={conflictIds.has(e.id)}
							repeating={!!e.recurrenceId && room.activeRulesById.has(e.recurrenceId)}
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
	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0 0 10px;
	}

	.active-filter {
		background: color-mix(in oklab, var(--accent) 16%, var(--bg-2));
		border-color: var(--accent);
		color: var(--ink);
		cursor: pointer;
		font-family: var(--font-sans);
	}

	.active-filter svg {
		width: 13px;
		height: 13px;
		opacity: 0.7;
	}

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

	.month-head {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin: 14px -4px 0;
		padding: 10px 8px 8px;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}

	.month-label {
		margin: 0;
		color: var(--ink);
	}

	.month-totals {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		column-gap: 6px;
		font-size: 12px;
		color: var(--ink);
		text-align: right;
	}

	.day-head {
		margin: 20px 4px 8px;
	}

	.month-head + .day-head {
		margin-top: 12px;
	}

	/* match the list's first-gap so the empty state isn't crammed under the summary */
	.scroll :global(.empty-card) {
		margin-top: 22px;
	}

	.day-total {
		font-size: 11px;
	}

	.day-card {
		padding: 2px 0;
		border-radius: var(--radius);
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

	.search-field {
		position: relative;
		flex: 1;
		display: flex;
		min-width: 0;
	}

	.search-icon {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		display: grid;
		place-items: center;
		color: var(--ink-3);
		pointer-events: none;
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
		padding: 10px 38px;
		min-width: 0;
		font-size: 14px;
		outline: none;
		font-family: var(--font-sans);
	}

	.search-input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent);
	}

	.search-input::-webkit-search-cancel-button {
		display: none;
	}

	.search-input::placeholder {
		color: var(--ink-3);
	}

	.search-clear {
		position: absolute;
		right: 6px;
		top: 50%;
		transform: translateY(-50%);
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

	.filter-btn {
		position: relative;
		align-self: stretch;
		width: auto;
		height: auto;
		aspect-ratio: 1;
		flex-shrink: 0;
		border-radius: var(--radius);
		background: var(--bg-2);
	}

	.filter-btn.on {
		border-color: var(--accent);
		color: var(--accent);
	}

	.filter-badge {
		position: absolute;
		top: -5px;
		right: -5px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
		font-size: 11px;
		font-weight: 700;
		line-height: 18px;
		text-align: center;
	}

	.clear-filters {
		margin-top: 10px;
	}

	.search-clear svg {
		width: 14px;
		height: 14px;
	}
</style>
