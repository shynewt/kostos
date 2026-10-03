<script lang="ts">
	import { untrack } from 'svelte';
	import AmountField from './AmountField.svelte';
	import CurrencyPicker from './CurrencyPicker.svelte';
	import EmojiPickerField from './EmojiPickerField.svelte';
	import type { EmojiItem } from './EmojiPickerField.svelte';
	import PaidBySection from './PaidBySection.svelte';
	import ScreenAppBar from './ScreenAppBar.svelte';
	import type { PaymentRow } from './PaidBySection.svelte';
	import SplitSection from './SplitSection.svelte';
	import NotesField from './NotesField.svelte';
	import TripPickerField from './TripPickerField.svelte';
	import { expenseShares, splitEvenly } from '$lib/balance';
	import { CURRENCY_PRESETS, currencyDecimals, type CurrencyPreset } from '$lib/currencies';
	import { expenseBaseAmount } from '$lib/currency-convert';
	import { resolveRate } from '$lib/fx-cache';
	import { formatAmount, toInputValue } from '$lib/money';
	import { evalToCents } from '$lib/math';
	import { suggestTripIdForDate } from '$lib/trips';
	import { buildCategoryModel, guessCategory } from '$lib/category-guess';
	import type {
		Category,
		Expense,
		ExpenseSplit,
		Member,
		PaymentMethodItem,
		Project,
		SplitMode
	} from '$lib/types';

	type Props = {
		project: Project;
		members: Member[];
		currentMemberId: string | null;
		mode: 'create' | 'edit';
		initial?: Expense;
		/** The group's expenses, used to guess a category from the description. */
		expenses?: Expense[];
		onSave: (expense: Expense) => void | Promise<void>;
		onCancel: () => void;
		onAddCategory: (item: Category) => void;
		onAddPaymentMethod: (item: PaymentMethodItem) => void;
		generateId: () => string;
	};

	let {
		project,
		members,
		currentMemberId,
		mode,
		initial,
		expenses = [],
		onSave,
		onCancel,
		onAddCategory,
		onAddPaymentMethod,
		generateId
	}: Props = $props();

	const headerTitle = untrack(() => (mode === 'edit' ? 'Edit expense' : 'New expense'));
	const saveLabel = untrack(() => (mode === 'edit' ? 'Update' : 'Save'));

	const seed = untrack(() => initial);

	function seedAmountInput(): string {
		return seed ? toInputValue(seed.amount, seed.currency) : '';
	}

	function seedDateStr(): string {
		const t = seed?.date ?? Date.now();
		return new Date(t).toISOString().slice(0, 10);
	}

	function seedPayers(): PaymentRow[] {
		if (!seed) {
			return [
				{
					id: generateId(),
					memberId: currentMemberId ?? members[0]?.id ?? '',
					amount: ''
				}
			];
		}
		if (seed.payments.length === 1) {
			return [{ id: generateId(), memberId: seed.payments[0].memberId, amount: '' }];
		}
		return seed.payments.map((p) => ({
			id: generateId(),
			memberId: p.memberId,
			amount: toInputValue(p.amount, seed.currency)
		}));
	}

	function seedInvolved(): Set<string> {
		if (seed) return new Set(seed.splits.map((s) => s.memberId));
		return new Set(members.map((m) => m.id));
	}

	function seedShares(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const m of members) out[m.id] = 1;
		if (seed?.splitMode === 'shares') {
			for (const s of seed.splits) out[s.memberId] = s.shares ?? 1;
		}
		return out;
	}

	function seedAmounts(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const m of members) out[m.id] = '';
		if (seed?.splitMode === 'amount') {
			for (const s of seed.splits) {
				out[s.memberId] = toInputValue(s.amount ?? 0, seed.currency);
			}
		}
		return out;
	}

	let amountInput = $state(seedAmountInput());
	let amountCents = $state(seed?.amount ?? 0);
	let title = $state(seed?.description ?? '');
	let dateStr = $state(seedDateStr());
	let payers = $state<PaymentRow[]>(seedPayers());
	let splitMode = $state<SplitMode>(seed?.splitMode ?? 'even');
	let involved = $state<Set<string>>(seedInvolved());
	let shares = $state<Record<string, number>>(seedShares());
	let amounts = $state<Record<string, string>>(seedAmounts());
	let notes = $state(seed?.notes ?? '');
	let categoryId = $state<string | undefined>(seed?.categoryId);
	let paymentMethodId = $state<string | undefined>(seed?.paymentMethodId);
	let tripId = $state<string | undefined>(
		untrack(() =>
			mode === 'edit'
				? seed?.tripId
				: (suggestTripIdForDate(project.trips, Date.now()) ?? undefined)
		)
	);
	// Track whether the user has manually chosen a trip; once they do, stop auto-overriding.
	let tripIdTouched = $state(false);
	// Same idea for the category guesser: once the user picks a category, leave it be.
	let categoryTouched = $state(false);
	// The category we last auto-filled; lets us tell a guess apart from a manual pick,
	// and only move the selection while it's still our own guess.
	let guessedCategoryId = $state<string | undefined>(undefined);
	let submitting = $state(false);

	const categoryModel = $derived(buildCategoryModel(expenses.filter((e) => e.id !== seed?.id)));
	const categoryIds = $derived(new Set(project.categories.map((c) => c.id)));
	const categoryIsGuessed = $derived(
		!categoryTouched && categoryId !== undefined && categoryId === guessedCategoryId
	);

	$effect(() => {
		// Guess the category from the description, debounced so it lands once typing settles
		// rather than flickering per keystroke. We never fight a manual choice. On edits we
		// leave an existing category alone and only guess once the description changes, so
		// an untouched save stays a no-op.
		const text = title;
		const model = categoryModel;
		const valid = categoryIds;
		if (untrack(() => categoryTouched)) return;
		if (mode === 'edit' && (seed?.categoryId !== undefined || text === (seed?.description ?? '')))
			return;
		const timer = setTimeout(() => {
			const guess = guessCategory(model, text, valid) ?? undefined;
			untrack(() => {
				// only move the selection if it's empty or still showing our last guess
				if (categoryId === undefined || categoryId === guessedCategoryId) {
					categoryId = guess;
					guessedCategoryId = guess;
				}
			});
		}, 350);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const raw = amountInput.trim();
		if (raw === '') {
			amountCents = 0;
			return;
		}
		const evaluated = evalToCents(raw, decimals);
		if (evaluated !== null && evaluated >= 0) amountCents = evaluated;
	});

	$effect(() => {
		// Auto-suggest a trip as the user picks dates, unless they've already chosen one.
		// Edits keep whatever trip (or none) the expense already had.
		if (tripIdTouched || mode === 'edit') return;
		const ms = new Date(dateStr).getTime();
		if (Number.isNaN(ms)) return;
		const suggested = suggestTripIdForDate(project.trips, ms);
		tripId = suggested ?? undefined;
	});

	const isExpression = $derived(/[+\-*/()]/.test(amountInput.trim()));

	let currencyCode = $state(untrack(() => seed?.currency ?? project.currency));
	let currencyOpen = $state(false);
	let rateInput = $state(seed?.exchangeRate != null ? String(seed.exchangeRate) : '');
	let rateTouched = $state(false);
	let rateFetching = $state(false);
	let rateError = $state(false);
	let rateAsOf = $state<number | null>(seed?.rateFetchedAt ?? null);
	let rateStale = $state(false);

	const rateAsOfLabel = $derived(
		rateAsOf ? new Date(rateAsOf).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
	);

	function symbolForCode(code: string): string {
		if (code === project.currency) return project.currencySymbol;
		return CURRENCY_PRESETS.find((p) => p.code === code)?.sym ?? code;
	}

	const currency = $derived(currencyCode);
	const currencySymbol = $derived(symbolForCode(currencyCode));
	const decimals = $derived(currencyDecimals(currencyCode));
	const isForeign = $derived(currencyCode !== project.currency);

	// render a minor-units value as an editable string in the active currency's precision
	function amountStr(cents: number): string {
		return (cents / 10 ** decimals).toFixed(decimals);
	}
	const exchangeRate = $derived.by(() => {
		const v = parseFloat(rateInput);
		return Number.isFinite(v) && v > 0 ? v : null;
	});
	const baseAmountPreview = $derived(
		isForeign && exchangeRate
			? expenseBaseAmount(
					{
						id: 'preview',
						payments: [],
						amount: amountCents,
						currency: currencyCode,
						exchangeRate,
						date: 0,
						splitMode: 'even',
						splits: [],
						createdAt: 0,
						createdBy: ''
					},
					project.currency
				)
			: 0
	);

	function resetRate() {
		rateInput = '';
		rateTouched = false;
		rateError = false;
		rateAsOf = null;
		rateStale = false;
	}

	function pickCurrency(p: CurrencyPreset) {
		currencyCode = p.code;
		resetRate();
	}

	function pickCustomCurrency(sym: string) {
		currencyCode = sym;
		resetRate();
	}

	// cache-first; `force` skips the freshness window for the explicit "Fetch rate" button
	async function loadRate(force = false) {
		if (!isForeign) return;
		rateError = false;
		rateFetching = true;
		const resolved = await resolveRate(currencyCode, project.currency, force);
		rateFetching = false;
		if (!resolved) {
			rateError = true;
			rateAsOf = null;
			rateStale = false;
			return;
		}
		rateInput = String(Number(resolved.rate.toFixed(6)));
		rateAsOf = resolved.at;
		rateStale = resolved.source === 'stale';
	}

	// plain (non-reactive) guard: only auto-resolve once per currency so a failed request
	// never retries in a loop and hammers the API. Edits start "resolved" so opening one
	// never swaps its stored rate for today's.
	let lastAutoRateKey = untrack(() => (mode === 'edit' && seed?.exchangeRate ? seed.currency : ''));
	$effect(() => {
		const key = currencyCode;
		if (!isForeign || !project.autoFetchRates) return;
		if (untrack(() => rateTouched)) return;
		if (key === lastAutoRateKey) return;
		lastAutoRateKey = key;
		void loadRate(false);
	});

	const involvedList = $derived(members.filter((m) => involved.has(m.id)));

	const payerCents = $derived(payers.map((p) => evalToCents(p.amount, decimals) ?? 0));
	const paidTotal = $derived(payerCents.reduce((sum, c) => sum + c, 0));
	const paidShort = $derived(amountCents - paidTotal);
	const isMultiPayer = $derived(payers.length > 1);
	const paymentsValid = $derived(
		payers.length > 0 &&
			payers.every((p) => p.memberId) &&
			(!isMultiPayer || (paidTotal === amountCents && payerCents.every((c) => c > 0)))
	);

	const rateValid = $derived(!isForeign || exchangeRate !== null);
	const canSave = $derived(
		amountCents > 0 &&
			title.trim().length > 0 &&
			paymentsValid &&
			involvedList.length > 0 &&
			rateValid
	);

	function buildSplits(): ExpenseSplit[] {
		if (splitMode === 'even') return involvedList.map((m) => ({ memberId: m.id }));
		if (splitMode === 'shares') {
			return involvedList.map((m) => ({ memberId: m.id, shares: shares[m.id] ?? 0 }));
		}
		return involvedList.map((m) => ({
			memberId: m.id,
			amount: evalToCents(amounts[m.id] ?? '', decimals) ?? 0
		}));
	}

	const previewExpense: Expense | null = $derived.by(() => {
		if (amountCents <= 0 || involvedList.length === 0) return null;
		const fallback = payers[0]?.memberId || members[0]?.id || '';
		return {
			id: 'preview',
			payments: [{ memberId: fallback, amount: amountCents }],
			amount: amountCents,
			currency: currencyCode,
			date: Date.now(),
			splitMode,
			splits: buildSplits(),
			createdAt: Date.now(),
			createdBy: fallback
		};
	});

	const memberShares = $derived(
		previewExpense ? expenseShares(previewExpense) : new Map<string, number>()
	);
	const assignedAmount = $derived.by(() => {
		if (splitMode !== 'amount') return amountCents;
		return involvedList.reduce((sum, m) => sum + (evalToCents(amounts[m.id] ?? '', decimals) ?? 0), 0);
	});
	const remaining = $derived(amountCents - assignedAmount);
	const totalShares = $derived(involvedList.reduce((sum, m) => sum + (shares[m.id] ?? 0), 0));
	const emptyInvolvedCount = $derived(
		splitMode === 'amount'
			? involvedList.filter((m) => (evalToCents(amounts[m.id] ?? '', decimals) ?? 0) === 0).length
			: 0
	);
	const canAutoFill = $derived(
		splitMode === 'amount' && amountCents > 0 && remaining > 0 && emptyInvolvedCount > 0
	);

	function setPayerRow(id: string, updates: Partial<PaymentRow>) {
		payers = payers.map((p) => (p.id === id ? { ...p, ...updates } : p));
	}

	function nextAvailableMember(): string {
		const taken = new Set(payers.map((p) => p.memberId));
		const free = members.find((m) => !taken.has(m.id));
		return free?.id ?? members[0]?.id ?? '';
	}

	function addPayer() {
		if (payers.length === 0) {
			payers = [
				{ id: generateId(), memberId: currentMemberId ?? members[0]?.id ?? '', amount: '' }
			];
			return;
		}
		if (payers.length === 1) {
			payers = [
				{ ...payers[0], amount: amountStr(amountCents) },
				{ id: generateId(), memberId: nextAvailableMember(), amount: '' }
			];
			return;
		}
		payers = [...payers, { id: generateId(), memberId: nextAvailableMember(), amount: '' }];
	}

	function removePayer(id: string) {
		if (payers.length <= 1) return;
		payers = payers.filter((p) => p.id !== id);
		if (payers.length === 1) payers = [{ ...payers[0], amount: '' }];
	}

	function fillPayerRow(id: string) {
		const sumOthers = payers
			.filter((p) => p.id !== id)
			.reduce((sum, p) => sum + (evalToCents(p.amount, decimals) ?? 0), 0);
		const target = amountCents - sumOthers;
		if (target < 0) return;
		setPayerRow(id, { amount: amountStr(target) });
	}

	function fillSplitRow(memberId: string) {
		const sumOthers = involvedList
			.filter((m) => m.id !== memberId)
			.reduce((sum, m) => sum + (evalToCents(amounts[m.id] ?? '', decimals) ?? 0), 0);
		const target = amountCents - sumOthers;
		if (target < 0) return;
		amounts = { ...amounts, [memberId]: amountStr(target) };
	}

	function autoFillRest() {
		if (splitMode !== 'amount') return;
		const empties = involvedList.filter((m) => (evalToCents(amounts[m.id] ?? '', decimals) ?? 0) === 0);
		if (empties.length === 0 || remaining <= 0) return;
		const portions = splitEvenly(remaining, empties.length);
		const next = { ...amounts };
		empties.forEach((m, i) => {
			next[m.id] = amountStr(portions[i]);
		});
		amounts = next;
	}

	function toggleMember(id: string) {
		const next = new Set(involved);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		involved = next;
	}

	function stepShare(id: string, delta: number) {
		shares = { ...shares, [id]: Math.max(0, (shares[id] ?? 0) + delta) };
	}

	function updateAmount(id: string, value: string) {
		amounts = { ...amounts, [id]: value };
	}

	function handleAddCategory(item: EmojiItem) {
		const cat: Category = { id: item.id, name: item.name, emoji: item.emoji };
		onAddCategory(cat);
		categoryId = cat.id;
		categoryTouched = true;
	}

	function handleAddMethod(item: EmojiItem) {
		const m: PaymentMethodItem = { id: item.id, name: item.name, emoji: item.emoji };
		onAddPaymentMethod(m);
		paymentMethodId = m.id;
	}

	function rateTimestamp(): number | undefined {
		if (seed && seed.currency === currencyCode && seed.exchangeRate === exchangeRate) {
			return seed.rateFetchedAt;
		}
		return rateAsOf ?? Date.now();
	}

	async function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (submitting || !canSave) return;
		submitting = true;

		const finalPayments = isMultiPayer
			? payers.map((p, i) => ({ memberId: p.memberId, amount: payerCents[i] }))
			: [{ memberId: payers[0].memberId, amount: amountCents }];

		const expense: Expense = {
			id: seed?.id ?? generateId(),
			payments: finalPayments,
			amount: amountCents,
			currency: currencyCode,
			exchangeRate: isForeign ? (exchangeRate ?? undefined) : undefined,
			rateFetchedAt: isForeign ? rateTimestamp() : undefined,
			description: title.trim(),
			categoryId,
			paymentMethodId,
			tripId: tripId || undefined,
			// keep the stored timestamp unless the day was changed; the input only holds a day
			date:
				seed && dateStr === seedDateStr() ? seed.date : new Date(dateStr).getTime() || Date.now(),
			splitMode,
			splits: buildSplits(),
			notes: notes.trim() || undefined,
			createdAt: seed?.createdAt ?? Date.now(),
			createdBy: seed?.createdBy ?? currentMemberId ?? payers[0]?.memberId ?? ''
		};

		try {
			await onSave(expense);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>{headerTitle} · Kostos</title>
</svelte:head>

<div class="screen" data-page="expense-form">
	<ScreenAppBar title={headerTitle} {onCancel}>
		{#snippet right()}
			<button
				type="button"
				class="btn btn-primary save-btn"
				disabled={!canSave || submitting}
				onclick={handleSubmit}
			>
				{saveLabel}
			</button>
		{/snippet}
	</ScreenAppBar>

	<form class="scroll" onsubmit={handleSubmit}>
		<AmountField
			bind:value={amountInput}
			cents={amountCents}
			symbol={currencySymbol}
			{currency}
			{isExpression}
		/>

		{#if currencyOpen}
			<div class="card field-card currency-card">
				<CurrencyPicker
					code={currencyCode}
					symbol={currencySymbol}
					label="Currency"
					startOpen
					onSelect={(p) => {
						pickCurrency(p);
						currencyOpen = false;
					}}
					onCustom={(s) => {
						pickCustomCurrency(s);
						currencyOpen = false;
					}}
				/>
			</div>
		{:else}
			<div class="currency-chip-row">
				<button type="button" class="currency-chip" onclick={() => (currencyOpen = true)}>
					<span class="num currency-chip-sym">{currencySymbol}</span>
					<span class="currency-chip-code">{currencyCode}</span>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="currency-chip-chevron" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
				</button>
			</div>
		{/if}

		{#if isForeign}
			<div class="card rate-card">
				<div class="row between rate-head">
					<span class="eyebrow">Exchange rate</span>
					<button
						type="button"
						class="btn btn-ghost rate-fetch"
						onclick={() => loadRate(true)}
						disabled={rateFetching}
					>
						{rateFetching ? 'Fetching…' : 'Fetch rate'}
					</button>
				</div>
				<div class="row gap-8 rate-row">
					<span class="rate-eq mono">1 {currencyCode} =</span>
					<input
						class="input rate-input mono"
						bind:value={rateInput}
						oninput={() => {
							rateTouched = true;
							rateAsOf = null;
							rateStale = false;
						}}
						inputmode="decimal"
						placeholder="0.000000"
						aria-label="Exchange rate to {project.currency}"
					/>
					<span class="rate-base mono">{project.currency}</span>
				</div>
				{#if exchangeRate}
					<p class="dim mono rate-note">
						{formatAmount(amountCents, currencySymbol, currencyCode)} ≈ {formatAmount(
							baseAmountPreview,
							project.currencySymbol,
							project.currency
						)}{#if rateStale && rateAsOfLabel} · offline, rate from {rateAsOfLabel}{/if}
					</p>
				{:else if rateError}
					<p class="dim rate-note">Couldn't fetch a rate. Enter it manually.</p>
				{:else}
					<p class="dim rate-note">Set the rate to convert this into {project.currency}.</p>
				{/if}
			</div>
		{/if}

		<label class="title-field">
			<span class="eyebrow title-label">Concept</span>
			<input class="input title-input" bind:value={title} placeholder="What was it for?" />
		</label>

		<div class="card field-card meta-card">
			<EmojiPickerField
				label="Category"
				fallbackEmoji="📦"
				items={project.categories}
				selectedId={categoryId}
				suggested={categoryIsGuessed}
				onSelect={(id) => {
					categoryId = id;
					categoryTouched = true;
				}}
				onAddCustom={handleAddCategory}
			/>
			{#if project.paymentMethodsEnabled ?? true}
				<hr class="hairline" />
				<EmojiPickerField
					label="Payment method"
					fallbackEmoji="💳"
					items={project.paymentMethods}
					selectedId={paymentMethodId}
					onSelect={(id) => (paymentMethodId = id)}
					onAddCustom={handleAddMethod}
				/>
			{/if}
			{#if project.trips.length > 0}
				<hr class="hairline" />
				<TripPickerField
					trips={project.trips}
					selectedId={tripId}
					onSelect={(id) => {
						tripId = id;
						tripIdTouched = true;
					}}
					manageHref="/p/{project.id}/settings/trips"
				/>
			{/if}
		</div>

		<PaidBySection
			{payers}
			{members}
			{amountCents}
			{paidTotal}
			{paidShort}
			symbol={currencySymbol}
			{currency}
			{currentMemberId}
			bind:dateStr
			onUpdatePayer={setPayerRow}
			onAddPayer={addPayer}
			onRemovePayer={removePayer}
			onFillPayer={fillPayerRow}
		/>

		<SplitSection
			{members}
			{amountCents}
			symbol={currencySymbol}
			{currency}
			{currentMemberId}
			{splitMode}
			{involved}
			{shares}
			{amounts}
			{memberShares}
			{remaining}
			{totalShares}
			{emptyInvolvedCount}
			{canAutoFill}
			onSetSplitMode={(m) => (splitMode = m)}
			onToggleMember={toggleMember}
			onStepShare={stepShare}
			onUpdateAmount={updateAmount}
			onAutoFillRest={autoFillRest}
			onFillSplitRow={fillSplitRow}
		/>

		<NotesField bind:value={notes} />

		<button
			type="submit"
			class="btn btn-primary btn-block submit-btn"
			disabled={!canSave || submitting}
		>
			{submitting ? 'Saving…' : `${saveLabel} expense`}
		</button>
	</form>
</div>

<style>
	.save-btn {
		padding: 8px 14px;
		font-size: 13px;
	}

	.meta-card {
		padding: 4px;
		margin-bottom: 10px;
	}

	.currency-card {
		padding: 4px;
		margin-bottom: 10px;
	}

	.currency-chip-row {
		display: flex;
		justify-content: center;
		margin-bottom: 12px;
	}

	.currency-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px 5px 12px;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-2);
		cursor: pointer;
		font: inherit;
		font-size: 12px;
		-webkit-tap-highlight-color: transparent;
	}

	.currency-chip-sym {
		color: var(--accent);
		font-weight: 700;
	}

	.currency-chip-code {
		letter-spacing: 0.04em;
	}

	.currency-chip-chevron {
		width: 13px;
		height: 13px;
		color: var(--ink-3);
	}

	.rate-card {
		padding: 14px;
		margin-bottom: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.rate-head {
		align-items: center;
	}

	.rate-fetch {
		padding: 6px 10px;
		font-size: 12px;
		color: var(--ink-2);
	}

	.rate-row {
		align-items: center;
	}

	.rate-eq {
		font-size: 13px;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.rate-input {
		flex: 1;
		padding: 10px 12px;
		font-size: 14px;
		text-align: center;
	}

	.rate-base {
		font-size: 13px;
		color: var(--ink-2);
	}

	.rate-note {
		font-size: 11px;
		margin: 0;
	}

	.title-field {
		display: block;
		margin: 18px 0 12px;
	}

	.title-label {
		display: block;
		margin-bottom: 8px;
	}

	.title-input {
		width: 100%;
		text-align: left;
		font-size: 17px;
		font-weight: 600;
		padding: 16px;
	}

	.submit-btn {
		margin-top: 22px;
	}

	.submit-btn:disabled,
	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
