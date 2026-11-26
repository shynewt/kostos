<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BalanceSkeleton from '$lib/components/BalanceSkeleton.svelte';
	import CategoryBars, { type CategoryRow } from '$lib/components/CategoryBars.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PerPersonCard from '$lib/components/PerPersonCard.svelte';
	import PeriodSheet from '$lib/components/PeriodSheet.svelte';
	import ProjectAppBar from '$lib/components/ProjectAppBar.svelte';
	import SpendBars from '$lib/components/SpendBars.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import TopExpensesCard from '$lib/components/TopExpensesCard.svelte';
	import TripSheet from '$lib/components/TripSheet.svelte';
	import TripStrip from '$lib/components/TripStrip.svelte';
	import { filteredSpreadsheetFile, saveFile } from '$lib/io/exportFiles';
	import { formatAmount, formatWholeAmount } from '$lib/money';
	import { plural } from '$lib/plural';
	import {
		ALL_TIME,
		biggestExpenses,
		defaultPeriod,
		exchangeFees,
		inPeriod,
		isSamePeriod,
		monthOf,
		monthsWithExpenses,
		parsePeriodKey,
		perPerson,
		periodKey,
		periodLabel,
		spendByCategory,
		spendByPaymentMethod,
		spendLines,
		spendOverTime,
		summarize,
		type Period,
		type Viewpoint
	} from '$lib/stats';
	import { getCurrentMember } from '$lib/storage';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import { readTripSelection, scopeExpenses, writeTripSelection } from '$lib/trips';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const project = $derived(room.project);
	const members = $derived(room.members);
	const expenses = $derived(room.expenses);
	const currencySymbol = $derived(room.currencySymbol);
	const currency = $derived(room.currency);
	const membersById = $derived(room.membersById);
	const categoryById = $derived(room.categoryById);
	const methodById = $derived(room.methodById);

	const storedMemberId = $derived.by(() => getCurrentMember(roomId));
	const currentMemberId = $derived(storedMemberId && membersById.has(storedMemberId) ? storedMemberId : null);

	const METHOD_COLORS = ['var(--accent)', '#88c0ff', '#ffc457', '#ff8a6b', '#b29cff', '#5eead4', '#f9a8d4'];

	// period and view live in the URL so coming back from a drilled-down list restores them
	const periodParam = $derived(page.url.searchParams.get('period'));
	const now = Date.now();
	const isJustMe = $derived(currentMemberId !== null && page.url.searchParams.get('view') === 'me');
	const viewpoint = $derived<Viewpoint>(
		isJustMe && currentMemberId ? { kind: 'member', memberId: currentMemberId } : { kind: 'group' }
	);

	function updateParams(changes: Record<string, string | null>) {
		const url = new URL(page.url);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null) url.searchParams.delete(key);
			else url.searchParams.set(key, value);
		}
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	let periodSheetOpen = $state(false);
	function selectPeriod(next: Period) {
		periodSheetOpen = false;
		updateParams({ period: isSamePeriod(next, preferredPeriod) ? null : periodKey(next) });
	}

	function setJustMe(justMe: boolean) {
		updateParams({ view: justMe ? 'me' : null });
	}

	const trips = $derived(room.trips);
	let selectedTripId = $state<string | null>(null);
	$effect(() => {
		const saved = readTripSelection(roomId);
		selectedTripId =
			saved && trips.some((t) => t.id === saved && t.closedAt === undefined) ? saved : null;
	});
	const selectedTrip = $derived(trips.find((t) => t.id === selectedTripId) ?? null);

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

	const tripExpenses = $derived(scopeExpenses(expenses, selectedTripId).filter((e) => !e.isSettlement));
	const preferredPeriod = $derived(defaultPeriod(tripExpenses, now));
	const period = $derived(periodParam === null ? preferredPeriod : parsePeriodKey(periodParam, now));
	const periodMonths = $derived(monthsWithExpenses(tripExpenses));
	const periodExpenses = $derived(inPeriod(tripExpenses, period));
	const lines = $derived(spendLines(periodExpenses, currency, viewpoint));
	const summary = $derived(summarize(lines));
	const series = $derived(spendOverTime(lines));
	const fees = $derived(exchangeFees(lines, currency));
	const people = $derived(isJustMe ? [] : perPerson(periodExpenses, currency));
	const biggest = $derived(biggestExpenses(lines));

	const categoryRows = $derived<CategoryRow[]>(
		spendByCategory(lines).map(({ id, amount, percent }) => {
			const category = id ? categoryById.get(id) : undefined;
			return {
				key: id ?? 'none',
				name: category?.name ?? (id ? 'Removed category' : 'No category'),
				emoji: category?.emoji ?? '📦',
				amount,
				percent,
				href: `/p/${roomId}/expenses?category=${encodeURIComponent(id ?? 'none')}`
			};
		})
	);

	const insight = $derived.by(() => {
		const top = categoryRows[0];
		if (!top || categoryRows.length < 2) return null;
		return top.percent >= 50
			? `Mostly ${top.emoji} ${top.name} (${top.percent}%)`
			: `Biggest category: ${top.emoji} ${top.name} (${top.percent}%)`;
	});

	const methodRows = $derived.by(() => {
		if (project?.paymentMethodsEnabled !== true) return [];
		const rows = spendByPaymentMethod(lines);
		if (rows.filter((r) => r.id !== null).length < 2) return [];
		return rows.map((row, i) => {
			const method = row.id ? methodById.get(row.id) : undefined;
			return {
				...row,
				key: row.id ?? 'none',
				name: method?.name ?? 'Not set',
				emoji: method?.emoji ?? '',
				color: METHOD_COLORS[i % METHOD_COLORS.length]
			};
		});
	});

	function formatDateRange(first: number, last: number): string {
		const firstYear = new Date(first).getUTCFullYear();
		const lastYear = new Date(last).getUTCFullYear();
		const showYear = firstYear !== lastYear || lastYear !== new Date().getUTCFullYear();
		// expense days are UTC days, see $lib/stats
		return new Intl.DateTimeFormat(undefined, {
			day: 'numeric',
			month: 'short',
			year: showYear ? 'numeric' : undefined,
			timeZone: 'UTC'
		}).formatRange(first, last);
	}

	const heroLine = $derived.by(() => {
		if (!summary) return '';
		const parts = [
			`${isJustMe ? 'Your share of' : 'Spent on'} ${plural(summary.count, 'expense', 'expenses')}`,
			formatDateRange(summary.firstDate, summary.lastDate)
		];
		if (summary.days > 1) {
			parts.push(`${formatWholeAmount(summary.total / summary.days, currencySymbol, currency)} a day`);
		}
		return parts.join(' · ');
	});

	const emptyMessage = $derived.by(() => {
		if (expenses.length === 0) return 'No expenses yet. Add one and its spending shows up here.';
		const periodName = period.kind === 'last12Months' ? 'the last 12 months' : periodLabel(period);
		const where = period.kind !== 'all' ? ` in ${periodName}` : selectedTrip ? ` on ${selectedTrip.name}` : '';
		if (isJustMe && spendLines(periodExpenses, currency, { kind: 'group' }).length > 0) {
			return `You had no share in anything spent${where}.`;
		}
		return `Nothing spent${where}${period.kind === 'all' ? ' yet' : ''}.`;
	});

	function downloadSpreadsheet() {
		if (!project) return;
		const rows = isJustMe ? lines.map((line) => line.expense) : periodExpenses;
		const scope = [selectedTrip?.name ?? 'all', period.kind === 'all' ? 'all-time' : periodKey(period)];
		if (isJustMe) scope.push('mine');
		saveFile(filteredSpreadsheetFile(project, members, rows, scope));
	}
</script>

<svelte:head>
	<title>Stats · {project?.name ?? 'Kostos'}</title>
</svelte:head>

{#snippet periodChip()}
	<button
		type="button"
		class="period-chip"
		class:on={period.kind !== 'all'}
		aria-haspopup="dialog"
		aria-label="Period: {periodLabel(period)}"
		onclick={() => (periodSheetOpen = true)}
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
		<span>{periodLabel(period)}</span>
		<svg class="period-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
	</button>
{/snippet}

<div class="screen" data-page="stats">
	<ProjectAppBar {roomId} {project} />

	<div class="scroll">
		{#if room.blank}<BalanceSkeleton mode="stats" />{:else}
		<div class="reveal">
		<TripStrip
			{trips}
			{selectedTripId}
			expenseCountAll={expenses.length}
			{expenseCountForTrip}
			onSelect={selectTrip}
			onOverflowOpen={() => (tripSheetOpen = true)}
			leading={periodChip}
		/>

		<TripSheet
			open={tripSheetOpen}
			{trips}
			{selectedTripId}
			manageHref="/p/{roomId}/settings/trips"
			onSelect={selectFromSheet}
			onClose={() => (tripSheetOpen = false)}
		/>

		{#if periodSheetOpen}
			<PeriodSheet
				selected={period}
				months={periodMonths}
				{now}
				onSelect={selectPeriod}
				onClose={() => (periodSheetOpen = false)}
			/>
		{/if}

		<section class="stats-hero">
			{#if currentMemberId}
				<div class="tabs-pill view-switch" role="group" aria-label="Whose spending">
					<button type="button" class:on={!isJustMe} aria-pressed={!isJustMe} onclick={() => setJustMe(false)}>Group</button>
					<button type="button" class:on={isJustMe} aria-pressed={isJustMe} onclick={() => setJustMe(true)}>Just me</button>
				</div>
			{/if}

			{#if summary}
				<div class="hero-amount">
					<span class="symbol">{currencySymbol}</span>{formatAmount(summary.total, '', currency)}
				</div>
				<p class="hero-line">{heroLine}</p>
				{#if insight}<p class="hero-insight">{insight}</p>{/if}
				<p class="dim hero-note">Settlements aren’t counted.</p>
			{/if}
		</section>

		{#if !summary}
			<EmptyState>
				<p>{emptyMessage}</p>
				{#if period.kind !== 'all'}
					<button type="button" class="btn" onclick={() => selectPeriod(ALL_TIME)}>Show all time</button>
				{/if}
			</EmptyState>
		{:else}
			<SpendBars {series} symbol={currencySymbol} {currency} onPickMonth={(start) => selectPeriod(monthOf(start))} />

			<div class="section-head">
				<h2 class="eyebrow">By category</h2>
			</div>
			<CategoryBars rows={categoryRows} symbol={currencySymbol} {currency} />

			{#if people.length > 0}
				<div class="section-head">
					<h2 class="eyebrow">Per person</h2>
				</div>
				<p class="dim section-intro">Each person’s share of these expenses, what they paid, and the difference.</p>
				<PerPersonCard rows={people} {membersById} {currentMemberId} symbol={currencySymbol} {currency} />
			{/if}

			<div class="section-head">
				<h2 class="eyebrow">Biggest expenses</h2>
			</div>
			<TopExpensesCard
				lines={biggest}
				{categoryById}
				{membersById}
				{currentMemberId}
				symbol={currencySymbol}
				{currency}
				hrefBase="/p/{roomId}/expenses"
			/>

			{#if fees && fees.fee !== 0}
				<div class="stat fee-tile">
					<div class="row between fee-top">
						<div class="stat-label">{isJustMe ? 'Your exchange fees' : 'Exchange fees'}</div>
						<div class="num fee-value" class:over={fees.fee > 0} class:under={fees.fee < 0}>
							{fees.fee < 0 ? '−' : ''}{formatAmount(Math.abs(fees.fee), currencySymbol, currency)}
						</div>
					</div>
					<div class="stat-sub">
						{Math.abs(fees.percent).toFixed(1)}% {fees.fee < 0 ? 'below' : 'over'} the market rate on {plural(fees.count, 'foreign expense', 'foreign expenses')}
					</div>
				</div>
			{/if}

			{#if methodRows.length > 0}
				<div class="section-head">
					<h2 class="eyebrow">Payment methods</h2>
				</div>
				<div class="card method-card">
					<div class="method-bar" aria-hidden="true">
						{#each methodRows as m (m.key)}
							<div class="method-seg" style="width: {m.percent}%; background: {m.color};"></div>
						{/each}
					</div>
					<ul class="method-legend">
						{#each methodRows as m (m.key)}
							<li class="method-chip">
								<span class="swatch-dot" style="background: {m.color};"></span>
								<span class="method-name">{m.emoji ? `${m.emoji} ${m.name}` : m.name}</span>
								<span class="dim mono">{m.percent}%</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<button type="button" class="export-link" onclick={downloadSpreadsheet}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
				Download as a spreadsheet
			</button>
		{/if}
		</div>
		{/if}
	</div>

	<TabBar {roomId} active="stats" />
</div>

<style>
	.period-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px 6px 10px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-2);
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		flex-shrink: 0;
		transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
	}

	.period-chip svg {
		width: 14px;
		height: 14px;
	}

	.period-chip.on {
		background: color-mix(in oklab, var(--accent) 16%, var(--bg-2));
		border-color: var(--accent);
		color: var(--ink);
	}

	.period-caret {
		opacity: 0.7;
	}

	.stats-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 10px 0 4px;
	}

	.view-switch {
		margin-bottom: 18px;
	}

	.view-switch button {
		min-width: 84px;
	}

	.hero-amount {
		font-family: var(--font-display);
		font-size: 56px;
		line-height: 1;
		letter-spacing: -0.03em;
	}

	.hero-amount .symbol {
		font-size: 28px;
		vertical-align: top;
		margin-right: 4px;
		opacity: 0.7;
	}

	.hero-line {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--ink-2);
		text-wrap: balance;
	}

	.hero-insight {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--ink-2);
	}

	.hero-note {
		margin: 10px 0 0;
		font-size: 12px;
	}

	.section-head h2 {
		margin: 0;
	}

	.section-intro {
		margin: -4px 0 10px;
		font-size: 12px;
		line-height: 1.45;
	}

	.fee-tile {
		margin-top: 12px;
	}

	.fee-top {
		align-items: baseline;
	}

	.fee-value {
		font-size: 16px;
		font-weight: 600;
	}

	.fee-value.over {
		color: var(--owe);
	}

	.fee-value.under {
		color: var(--owed);
	}

	.method-card {
		padding: 14px 16px;
	}

	.method-bar {
		display: flex;
		height: 10px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--line);
	}

	.method-seg {
		height: 100%;
	}

	.method-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 14px;
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
		font-size: 12px;
	}

	.method-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--ink-2);
	}

	.swatch-dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.method-name {
		color: var(--ink);
	}

	.export-link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		margin: 22px 0 8px;
		padding: 12px;
		background: transparent;
		border: 0;
		color: var(--accent);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.export-link svg {
		width: 16px;
		height: 16px;
	}
</style>
