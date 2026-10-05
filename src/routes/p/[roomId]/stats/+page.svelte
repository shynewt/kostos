<script lang="ts">
	import BalanceSkeleton from '$lib/components/BalanceSkeleton.svelte';
	import { page } from '$app/state';
	import CategoryBreakdown from '$lib/components/CategoryBreakdown.svelte';
	import ProjectAppBar from '$lib/components/ProjectAppBar.svelte';
	import type { CategoryRollup } from '$lib/components/CategoryBreakdown.svelte';
	import DailyBars from '$lib/components/DailyBars.svelte';
	import EmptyCard from '$lib/components/EmptyCard.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import MemberBars from '$lib/components/MemberBars.svelte';
	import type { MemberContribution } from '$lib/components/MemberBars.svelte';
	import TopExpensesCard from '$lib/components/TopExpensesCard.svelte';
	import TripSheet from '$lib/components/TripSheet.svelte';
	import TripStrip from '$lib/components/TripStrip.svelte';
	import { exchangeFee, expenseInBase } from '$lib/currency-convert';
	import { formatAmount } from '$lib/money';
	import { getCurrentMember } from '$lib/storage';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import { readTripSelection, scopeExpenses, writeTripSelection } from '$lib/trips';
	import type { Expense } from '$lib/types';

	type Period = 'all' | 'week' | 'month';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const project = $derived(room.project);
	const members = $derived(room.members);
	const expenses = $derived(room.expenses);
	let period = $state<Period>('all');

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));
	const currencySymbol = $derived(room.currencySymbol);
	const currency = $derived(room.currency);
	const membersById = $derived(room.membersById);
	const categoryById = $derived(room.categoryById);
	const methodById = $derived(room.methodById);

	const SLICE_COLORS = [
		'var(--accent)',
		'#88c0ff',
		'#ffc457',
		'#ff8a6b',
		'#b29cff',
		'#5eead4',
		'#f9a8d4'
	];

	function periodCutoff(p: Period): number {
		if (p === 'all') return 0;
		return Date.now() - (p === 'week' ? 7 : 30) * 86400 * 1000;
	}

	function startOfDay(ts: number): number {
		const d = new Date(ts);
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	}

	function formatDay(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	}

	function periodLabel(p: Period): string {
		if (p === 'week') return 'Last 7 days';
		if (p === 'month') return 'Last 30 days';
		return 'All time';
	}

	const trips = $derived(room.trips);
	let selectedTripId = $state<string | null>(null);
	$effect(() => {
		const saved = readTripSelection(roomId);
		selectedTripId =
			saved && trips.some((t) => t.id === saved && t.closedAt === undefined) ? saved : null;
	});
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

	// Settlements are internal transfers; they never count as "spend".
	const realExpenses = $derived(scopedExpenses.filter((e) => !e.isSettlement));
	const periodExpenses = $derived.by(() => {
		const cutoff = periodCutoff(period);
		if (cutoff === 0) return realExpenses;
		return realExpenses.filter((e) => e.date >= cutoff);
	});
	// Normalise to the base currency so cross-currency groups sum correctly everywhere.
	const periodBase = $derived(periodExpenses.map((e) => expenseInBase(e, currency)));

	const totalSpent = $derived(periodBase.reduce((s, e) => s + e.amount, 0));

	// only expenses that stored a market rate can say what exchange cost; older ones are
	// left out rather than counted as free
	const fees = $derived.by(() => {
		let fee = 0;
		let atMarket = 0;
		let count = 0;
		for (const e of periodExpenses) {
			const f = exchangeFee(e, currency);
			if (!f) continue;
			fee += f.fee;
			atMarket += f.atMarket;
			count++;
		}
		return count > 0 ? { fee, count, percent: (fee / atMarket) * 100 } : null;
	});
	const perPerson = $derived(members.length > 0 ? Math.round(totalSpent / members.length) : 0);
	const expenseCount = $derived(periodExpenses.length);
	const avgExpense = $derived(expenseCount > 0 ? Math.round(totalSpent / expenseCount) : 0);
	const daysWithActivity = $derived(
		new Set(periodExpenses.map((e) => startOfDay(e.date))).size
	);

	type SpendBucket = { date: number; total: number };
	type BucketSize = 'day' | 'week' | 'month';

	function startOfWeek(ts: number): number {
		const d = new Date(ts);
		d.setHours(0, 0, 0, 0);
		// snap to Monday
		const day = (d.getDay() + 6) % 7;
		d.setDate(d.getDate() - day);
		return d.getTime();
	}

	function startOfMonth(ts: number): number {
		const d = new Date(ts);
		d.setHours(0, 0, 0, 0);
		d.setDate(1);
		return d.getTime();
	}

	const spendBucketSize = $derived.by<BucketSize>(() => {
		if (periodExpenses.length === 0) return 'day';
		const cutoff = periodCutoff(period);
		const startMs = cutoff > 0 ? cutoff : Math.min(...periodExpenses.map((e) => e.date));
		const days = Math.ceil((Date.now() - startMs) / (86400 * 1000));
		if (days > 365) return 'month';
		if (days > 60) return 'week';
		return 'day';
	});

	const spendBuckets = $derived.by<SpendBucket[]>(() => {
		if (periodExpenses.length === 0) return [];
		const cutoff = periodCutoff(period);
		const startMs = cutoff > 0 ? cutoff : Math.min(...periodExpenses.map((e) => e.date));

		if (spendBucketSize === 'day') {
			const start = startOfDay(startMs);
			const end = startOfDay(Date.now());
			const buckets: SpendBucket[] = [];
			for (let t = start; t <= end; t += 86400 * 1000) {
				buckets.push({ date: t, total: 0 });
			}
			for (const e of periodBase) {
				const idx = Math.round((startOfDay(e.date) - start) / (86400 * 1000));
				if (idx >= 0 && idx < buckets.length) buckets[idx].total += e.amount;
			}
			return buckets;
		}

		if (spendBucketSize === 'week') {
			const startW = startOfWeek(startMs);
			const endW = startOfWeek(Date.now());
			const buckets: SpendBucket[] = [];
			for (let t = startW; t <= endW; t += 7 * 86400 * 1000) {
				buckets.push({ date: t, total: 0 });
			}
			for (const e of periodBase) {
				const idx = Math.round((startOfWeek(e.date) - startW) / (7 * 86400 * 1000));
				if (idx >= 0 && idx < buckets.length) buckets[idx].total += e.amount;
			}
			return buckets;
		}

		// monthly: variable month lengths, so iterate explicitly
		const buckets: SpendBucket[] = [];
		const cursor = new Date(startOfMonth(startMs));
		const endMs = startOfMonth(Date.now());
		while (cursor.getTime() <= endMs) {
			buckets.push({ date: cursor.getTime(), total: 0 });
			cursor.setMonth(cursor.getMonth() + 1);
		}
		const indexByMonth = new Map(buckets.map((b, i) => [b.date, i]));
		for (const e of periodBase) {
			const idx = indexByMonth.get(startOfMonth(e.date));
			if (idx !== undefined) buckets[idx].total += e.amount;
		}
		return buckets;
	});

	const byCategory = $derived.by<CategoryRollup[]>(() => {
		const totals = new Map<string, number>();
		for (const e of periodBase) {
			const id = e.categoryId ?? 'uncategorised';
			totals.set(id, (totals.get(id) ?? 0) + e.amount);
		}
		const rows = [...totals.entries()]
			.map(([id, amount]) => {
				const cat = categoryById.get(id);
				return {
					id,
					name: cat?.name ?? 'Uncategorised',
					emoji: cat?.emoji ?? '📦',
					amount
				};
			})
			.sort((a, b) => b.amount - a.amount);
		return rows.map((r, i) => ({ ...r, color: SLICE_COLORS[i % SLICE_COLORS.length] }));
	});

	const byMemberPaid = $derived.by<MemberContribution[]>(() => {
		const totals = new Map<string, number>();
		for (const m of members) totals.set(m.id, 0);
		for (const e of periodBase) {
			for (const p of e.payments) {
				totals.set(p.memberId, (totals.get(p.memberId) ?? 0) + p.amount);
			}
		}
		return [...totals.entries()]
			.map(([id, paid]) => {
				const m = membersById.get(id);
				return { id, name: m?.name ?? '—', color: m?.color, emoji: m?.emoji, paid };
			})
			.sort((a, b) => b.paid - a.paid);
	});

	type MethodRollup = { id: string; name: string; emoji: string; amount: number; color: string };
	const byMethod = $derived.by<MethodRollup[]>(() => {
		const totals = new Map<string, number>();
		for (const e of periodBase) {
			const id = e.paymentMethodId ?? 'unknown';
			totals.set(id, (totals.get(id) ?? 0) + e.amount);
		}
		return [...totals.entries()]
			.map(([id, amount], i) => {
				const m = methodById.get(id);
				return {
					id,
					name: m?.name ?? 'Unspecified',
					emoji: m?.emoji ?? '·',
					amount,
					color: SLICE_COLORS[i % SLICE_COLORS.length]
				};
			})
			.sort((a, b) => b.amount - a.amount);
	});

	const topExpenses = $derived(
		[...periodBase].sort((a, b) => b.amount - a.amount).slice(0, 5)
	);

	const insight = $derived.by<string | null>(() => {
		if (totalSpent === 0) return null;
		const top = byCategory[0];
		const biggest = topExpenses[0];
		if (!top || !biggest) return null;
		const topPct = Math.round((top.amount / totalSpent) * 100);
		const biggestPayer = membersById.get(biggest.payments[0]?.memberId ?? '')?.name ?? '—';
		const biggestLabel = biggest.description || 'Untitled expense';
		return `${topPct}% went to ${top.emoji} ${top.name}. Biggest single hit: ${biggestLabel} (${formatAmount(biggest.amount, currencySymbol, currency)}, paid by ${biggestPayer}).`;
	});
</script>

<svelte:head>
	<title>Stats · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="stats">
	<ProjectAppBar {roomId} {project} />

	<div class="scroll">
		{#if room.checking}<BalanceSkeleton mode="stats" />{:else}
		<div class="reveal">
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

		<div class="tabs-pill period-picker">
			<button class:on={period === 'week'} type="button" onclick={() => (period = 'week')}>Week</button>
			<button class:on={period === 'month'} type="button" onclick={() => (period = 'month')}>Month</button>
			<button class:on={period === 'all'} type="button" onclick={() => (period = 'all')}>All</button>
		</div>

		{#if expenseCount === 0}
			<EmptyCard>
				<p>No spending in {periodLabel(period).toLowerCase()} yet. Add an expense or widen the period.</p>
			</EmptyCard>
		{:else}
			<div class="row gap-8 hero-row">
				<div class="stat hero-tile">
					<div class="stat-label">Total spent</div>
					<div class="stat-value mono">{formatAmount(totalSpent, currencySymbol, currency)}</div>
					<div class="stat-sub">{periodLabel(period)}</div>
				</div>
				<div class="stat hero-tile">
					<div class="stat-label">Per person</div>
					<div class="stat-value mono">{formatAmount(perPerson, currencySymbol, currency)}</div>
					<div class="stat-sub">across {members.length} {members.length === 1 ? 'member' : 'members'}</div>
				</div>
			</div>

			<div class="row gap-8 mini-row">
				<div class="stat mini-tile">
					<div class="stat-label">Expenses</div>
					<div class="num mini-value">{expenseCount}</div>
				</div>
				<div class="stat mini-tile">
					<div class="stat-label">Avg expense</div>
					<div class="num mini-value">{formatAmount(avgExpense, currencySymbol, currency)}</div>
				</div>
				<div class="stat mini-tile">
					<div class="stat-label">Days active</div>
					<div class="num mini-value">{daysWithActivity}</div>
				</div>
			</div>

			{#if fees}
				<div class="stat fee-tile">
					<div class="row between fee-top">
						<div class="stat-label">Exchange fees</div>
						<div class="num fee-value" class:over={fees.fee > 0} class:under={fees.fee < 0}>
							{fees.fee < 0 ? '−' : ''}{formatAmount(Math.abs(fees.fee), currencySymbol, currency)}
						</div>
					</div>
					<div class="stat-sub">
						{Math.abs(fees.percent).toFixed(1)}% {fees.fee < 0 ? 'below' : 'over'} the market rate on {fees.count}
						foreign {fees.count === 1 ? 'expense' : 'expenses'}
					</div>
				</div>
			{/if}

			<DailyBars
				buckets={spendBuckets}
				bucketSize={spendBucketSize}
				symbol={currencySymbol}
				{currency}
			/>

			{#if byCategory.length > 0}
				<div class="section-head">
					<div class="eyebrow">By category</div>
					<span class="dim mono section-count">{byCategory.length}</span>
				</div>
				<CategoryBreakdown rows={byCategory} total={totalSpent} symbol={currencySymbol} {currency} />
			{/if}

			{#if byMemberPaid.length > 0}
				<div class="section-head">
					<div class="eyebrow">Out of pocket</div>
					<span class="dim mono section-count">WHO PAID</span>
				</div>
				<MemberBars rows={byMemberPaid} {currentMemberId} symbol={currencySymbol} {currency} />
			{/if}

			{#if byMethod.length > 0 && project?.paymentMethodsEnabled !== false}
				<div class="section-head">
					<div class="eyebrow">By payment method</div>
				</div>
				<div class="card method-card">
					<div class="method-bar">
						{#each byMethod as m (m.id)}
							{@const w = totalSpent > 0 ? (m.amount / totalSpent) * 100 : 0}
							<div
								class="method-seg"
								style="width: {w}%; background: {m.color};"
								title="{m.emoji} {m.name}: {formatAmount(m.amount, currencySymbol, currency)}"
							></div>
						{/each}
					</div>
					<div class="row method-legend">
						{#each byMethod as m (m.id)}
							{@const pct = totalSpent > 0 ? Math.round((m.amount / totalSpent) * 100) : 0}
							<span class="row gap-6 method-chip">
								<span class="swatch-dot" style="background: {m.color};"></span>
								<span class="method-name">{m.emoji} {m.name}</span>
								<span class="dim mono">{pct}%</span>
							</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if topExpenses.length > 0}
				<div class="section-head">
					<div class="eyebrow">Biggest expenses</div>
				</div>
				<TopExpensesCard
					expenses={topExpenses}
					{categoryById}
					{membersById}
					{currentMemberId}
					symbol={currencySymbol} {currency}
					hrefBase="/p/{roomId}/expenses"
				/>
			{/if}

			{#if insight}
				<div class="card insight-card">
					<div class="row gap-8 insight-row">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="insight-icon"><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" /></svg>
						<p class="insight-body">{insight}</p>
					</div>
				</div>
			{/if}
		{/if}
		</div>
		{/if}
	</div>

	<TabBar {roomId} active="stats" />
</div>

<style>
	.period-picker {
		width: 100%;
		margin-top: 4px;
		margin-bottom: 12px;
	}

	.period-picker button {
		flex: 1;
	}

	.hero-row {
		align-items: stretch;
	}

	.hero-tile {
		flex: 1;
	}

	.stat-sub {
		margin-top: 6px;
	}

	.fee-tile {
		margin-top: 8px;
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

	.mini-row {
		margin-top: 8px;
		align-items: stretch;
	}

	.mini-tile {
		flex: 1;
		padding: 10px 12px;
	}

	.mini-value {
		font-size: 18px;
		font-weight: 600;
		margin-top: 4px;
	}

	.section-count {
		font-size: 11px;
	}

	.swatch-dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.method-card {
		padding: 14px 16px;
	}

	.method-bar {
		display: flex;
		height: 14px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--line);
	}

	.method-seg {
		height: 100%;
	}

	.method-legend {
		margin-top: 12px;
		flex-wrap: wrap;
		gap: 12px;
		font-size: 11px;
	}

	.method-chip {
		font-family: var(--font-mono);
		color: var(--ink-2);
	}

	.method-name {
		color: var(--ink);
	}

	.insight-card {
		margin-top: 14px;
		background: color-mix(in oklab, var(--accent) 6%, var(--bg-2));
		border-color: color-mix(in oklab, var(--accent) 22%, var(--line));
	}

	.insight-row {
		align-items: flex-start;
	}

	.insight-icon {
		width: 18px;
		height: 18px;
		color: var(--accent);
		flex-shrink: 0;
	}

	.insight-body {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
	}
</style>
