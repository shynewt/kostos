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
	import {
		currencyDecimals,
		currencySymbolFor,
		isPrecisionCapped,
		type CurrencyPreset
	} from '$lib/currencies';
	import { mathInput } from '$lib/actions/mathInput';
	import { formatRate } from '$lib/currency-convert';
	import {
		applyMarket,
		createRequestGate,
		editCharged,
		EMPTY_FX,
		fxForSave,
		fxView,
		parseMoney,
		seedFx,
		useMarket
	} from '$lib/expense-draft';
	import { resolveRate } from '$lib/fx-cache';
	import { formatAmount, toInputValue } from '$lib/money';
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
		// keep the last good value so the display doesn't flicker mid-expression; validity
		// comes from amountParsed, i.e. what's typed right now
		if (amountParsed.empty) amountCents = 0;
		else if (!amountParsed.invalid) amountCents = amountParsed.cents;
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
	const baseDecimals = currencyDecimals(untrack(() => project.currency));
	const baseAmountStr = (cents: number) => (cents / 10 ** baseDecimals).toFixed(baseDecimals);
	let fx = $state(untrack(() => seedFx(seed, project.currency, baseDecimals)));
	let fxFetching = $state(false);
	let fxError = $state(false);
	const rateRequests = createRequestGate();

	const marketWhen = $derived.by(() => {
		const quote = fx.market;
		if (!quote?.at) return '';
		const day = (ms: number) => new Date(ms).toDateString();
		const label =
			day(quote.at) === day(Date.now())
				? 'today'
				: new Date(quote.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
		return quote.stale ? `offline, from ${label}` : label;
	});

	function symbolForCode(code: string): string {
		if (code === project.currency) return project.currencySymbol;
		return currencySymbolFor(code);
	}

	const currency = $derived(currencyCode);
	const currencySymbol = $derived(symbolForCode(currencyCode));
	const decimals = $derived(currencyDecimals(currencyCode));
	const amountParsed = $derived(parseMoney(amountInput, decimals));
	const isForeign = $derived(currencyCode !== project.currency);

	// render a minor-units value as an editable string in the active currency's precision
	function amountStr(cents: number): string {
		return (cents / 10 ** decimals).toFixed(decimals);
	}
	const fxCtx = $derived({
		amountCents,
		currency: currencyCode,
		baseCurrency: project.currency,
		baseDecimals
	});
	const fxNow = $derived(fxView(fx, fxCtx));
	// show the comparison once it's more than rounding noise
	const fxDelta = $derived(
		fxNow.percent !== null && Math.abs(fxNow.percent) >= 0.05 ? fxNow.percent : null
	);

	function resetFx() {
		rateRequests.invalidate();
		fxFetching = false;
		fxError = false;
		fx = EMPTY_FX;
	}

	function pickCurrency(p: CurrencyPreset) {
		currencyCode = p.code;
		resetFx();
	}

	function pickCustomCurrency(sym: string) {
		currencyCode = sym;
		resetFx();
	}

	// cache-first; `force` skips the freshness window for the refresh button. A market rate
	// never overrides a charged amount the user typed; see applyMarket.
	async function loadRate(force = false) {
		if (!isForeign) return;
		fxError = false;
		fxFetching = true;
		const request = rateRequests.begin();
		const resolved = await resolveRate(currencyCode, project.currency, force);
		// a currency switch or a newer fetch happened while this was in flight
		if (!rateRequests.isCurrent(request)) return;
		fxFetching = false;
		if (!resolved) {
			fxError = true;
			return;
		}
		fx = applyMarket(
			fx,
			{ rate: resolved.rate, at: resolved.at, stale: resolved.source === 'stale' },
			fxCtx
		);
	}

	// plain (non-reactive) guard: only auto-resolve once per currency so a failed request
	// never retries in a loop and hammers the API. Edits start "resolved" so opening one
	// never fetches; the refresh button is there for that.
	let lastAutoRateKey = untrack(() => (mode === 'edit' && seed?.exchangeRate ? seed.currency : ''));
	$effect(() => {
		const key = currencyCode;
		if (!isForeign || !project.autoFetchRates) return;
		if (key === lastAutoRateKey) return;
		lastAutoRateKey = key;
		void loadRate(false);
	});

	const involvedList = $derived(members.filter((m) => involved.has(m.id)));

	const payerInputs = $derived(payers.map((p) => parseMoney(p.amount, decimals)));
	const payerCents = $derived(payerInputs.map((p) => p.cents));
	const paidTotal = $derived(payerCents.reduce((sum, c) => sum + c, 0));
	const paidShort = $derived(amountCents - paidTotal);
	const isMultiPayer = $derived(payers.length > 1);
	const paymentsValid = $derived(
		payers.length > 0 &&
			payers.every((p) => p.memberId) &&
			(!isMultiPayer || (paidTotal === amountCents && payerCents.every((c) => c > 0)))
	);

	const splitInputs = $derived(
		Object.fromEntries(involvedList.map((m) => [m.id, parseMoney(amounts[m.id] ?? '', decimals)]))
	);
	const splitCents = (memberId: string) => splitInputs[memberId]?.cents ?? 0;

	// "Saved as" notes for rows whose input is finer than the currency stores; a balanced
	// total can still hide two rows rounding in opposite directions
	const splitRounding = $derived(
		splitMode === 'amount'
			? Object.fromEntries(
					Object.entries(splitInputs)
						.filter(([, input]) => input.rounded)
						.map(([id, input]) => [id, `Saved as ${amountStr(input.cents)}`])
				)
			: {}
	);
	const payerRounding = $derived(
		isMultiPayer
			? Object.fromEntries(
					payers
						.map((p, i) => [p.id, payerInputs[i]] as const)
						.filter(([, input]) => input.rounded)
						.map(([id, input]) => [id, `Saved as ${amountStr(input.cents)}`])
				)
			: {}
	);

	function buildSplits(): ExpenseSplit[] {
		if (splitMode === 'even') return involvedList.map((m) => ({ memberId: m.id }));
		if (splitMode === 'shares') {
			return involvedList.map((m) => ({ memberId: m.id, shares: shares[m.id] ?? 0 }));
		}
		return involvedList.map((m) => ({
			memberId: m.id,
			amount: splitCents(m.id)
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
		return involvedList.reduce((sum, m) => sum + splitCents(m.id), 0);
	});
	const remaining = $derived(amountCents - assignedAmount);
	const totalShares = $derived(involvedList.reduce((sum, m) => sum + (shares[m.id] ?? 0), 0));
	const emptyInvolvedCount = $derived(
		splitMode === 'amount'
			? involvedList.filter((m) => splitCents(m.id) === 0).length
			: 0
	);
	const canAutoFill = $derived(
		splitMode === 'amount' && amountCents > 0 && remaining > 0 && emptyInvolvedCount > 0
	);

	const chargedInvalid = $derived(isForeign && !!fxNow.chargedParsed?.invalid);
	const rateValid = $derived(!isForeign || ((fxNow.chargedCents ?? 0) > 0 && fxNow.rate !== null));

	const amountInvalid = $derived(amountParsed.invalid);
	const splitInvalid = $derived(
		splitMode === 'amount' && Object.values(splitInputs).some((input) => input.invalid)
	);
	const payerInvalid = $derived(isMultiPayer && payerInputs.some((input) => input.invalid));

	// the first thing stopping a save that the user can't see from the empty fields alone
	const saveProblem = $derived.by<string | null>(() => {
		if (amountInvalid) return "The amount isn't a valid number or expression.";
		if (amountCents <= 0) return null;
		if (chargedInvalid) return "The charged amount isn't a valid number or expression.";
		if (payerInvalid) return "One of the paid-by amounts isn't a valid number.";
		if (!paymentsValid && !(isMultiPayer && paidTotal !== amountCents))
			return 'Every payer needs a person and an amount.';
		if (isMultiPayer && paidTotal !== amountCents) return "Paid-by amounts don't add up to the total.";
		if (involvedList.length === 0) return 'Pick at least one person to split with.';
		if (splitInvalid) return "One of the split amounts isn't a valid number.";
		if (splitMode === 'amount' && remaining !== 0) return "Split amounts don't add up to the total.";
		if (splitMode === 'shares' && totalShares <= 0) return 'Give at least one person a share.';
		return null;
	});

	// Everything a save problem can come from. Any edit yields a new snapshot, which restarts
	// the wait below, so "12+" or a just-added payer row doesn't flash an error mid-typing.
	const problemSnapshot = $derived({
		problem: saveProblem,
		inputs: [
			amountInput,
			fx.chargedInput,
			splitMode,
			[...involved].join(','),
			...payers.map((p) => `${p.memberId}=${p.amount}`),
			...Object.entries(amounts).map(([id, value]) => `${id}=${value}`),
			...Object.entries(shares).map(([id, value]) => `${id}:${value}`)
		].join('|')
	});
	let shownProblem = $state<string | null>(null);
	$effect(() => {
		const { problem } = problemSnapshot;
		shownProblem = null;
		if (problem === null) return;
		const timer = setTimeout(() => (shownProblem = problem), 800);
		return () => clearTimeout(timer);
	});

	const canSave = $derived(
		!amountInvalid &&
			amountCents > 0 &&
			title.trim().length > 0 &&
			paymentsValid &&
			!payerInvalid &&
			involvedList.length > 0 &&
			!splitInvalid &&
			(splitMode !== 'amount' || remaining === 0) &&
			(splitMode !== 'shares' || totalShares > 0) &&
			rateValid
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
		const sumOthers = payers.reduce((sum, p, i) => (p.id === id ? sum : sum + payerCents[i]), 0);
		const target = amountCents - sumOthers;
		if (target < 0) return;
		setPayerRow(id, { amount: amountStr(target) });
	}

	function fillSplitRow(memberId: string) {
		const sumOthers = involvedList
			.filter((m) => m.id !== memberId)
			.reduce((sum, m) => sum + splitCents(m.id), 0);
		const target = amountCents - sumOthers;
		if (target < 0) return;
		amounts = { ...amounts, [memberId]: amountStr(target) };
	}

	function autoFillRest() {
		if (splitMode !== 'amount') return;
		const empties = involvedList.filter((m) => splitCents(m.id) === 0);
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

	async function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (submitting || !canSave) return;
		submitting = true;

		const finalPayments = isMultiPayer
			? payers.map((p, i) => ({ memberId: p.memberId, amount: payerCents[i] }))
			: [{ memberId: payers[0].memberId, amount: amountCents }];

		const conversion = isForeign ? fxForSave(fx, fxCtx, Date.now()) : null;
		const expense: Expense = {
			id: seed?.id ?? generateId(),
			payments: finalPayments,
			amount: amountCents,
			currency: currencyCode,
			exchangeRate: conversion?.exchangeRate,
			rateFetchedAt: conversion?.rateFetchedAt,
			chargedAmount: conversion?.chargedAmount,
			marketRate: conversion?.marketRate,
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
			isSettlement: seed?.isSettlement,
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
			invalid={amountInvalid && shownProblem !== null}
		/>
		{#if amountParsed.rounded}
			<p class="dim mono rounding-note">
				Saved as {amountStr(amountCents)} {currencyCode}.{#if isPrecisionCapped(currencyCode)}{' '}Kostos
					keeps {currencyCode} to 2 decimals.{/if}
			</p>
		{/if}

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
			<div class="card fx-card">
				<div class="row between fx-head">
					<label class="eyebrow" for="fx-charged">Charged in {project.currency}</label>
					<button
						type="button"
						class="fx-refresh"
						class:spinning={fxFetching}
						onclick={() => loadRate(true)}
						disabled={fxFetching}
						aria-label="Refresh the market rate"
						title="Refresh the market rate"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.35-5.65" /><path d="M20 4v5h-5" /></svg>
					</button>
				</div>
				<div class="fx-field" class:invalid={chargedInvalid}>
					<span class="fx-sym num">{project.currencySymbol}</span>
					<input
						id="fx-charged"
						class="fx-input mono"
						value={fxNow.charged}
						use:mathInput
						oninput={(e) => (fx = editCharged(fx, e.currentTarget.value))}
						inputmode="decimal"
						placeholder={baseAmountStr(0)}
						autocomplete="off"
						aria-label="Amount charged in {project.currency}"
						aria-describedby="fx-status"
					/>
					{#if fxDelta !== null}
						<span class="fx-delta num" class:over={fxDelta > 0} class:under={fxDelta < 0}>
							{fxDelta > 0 ? '+' : '−'}{Math.abs(fxDelta).toFixed(1)}%
						</span>
					{:else if fx.market && !fx.pinned}
						<span class="fx-delta at-market">market</span>
					{/if}
				</div>
				<div class="fx-status" id="fx-status">
					{#if fx.market}
						<p class="dim mono">
							Market 1 {currencyCode} = {formatRate(fx.market.rate)} {project.currency}{#if marketWhen}{' · '}{marketWhen}{/if}
						</p>
					{:else if fxFetching}
						<p class="dim mono">Getting the market rate…</p>
					{:else if fx.kept && fxNow.rate !== null}
						<p class="dim mono">Saved at 1 {currencyCode} = {formatRate(fxNow.rate)} {project.currency}</p>
					{:else if fxError}
						<p class="dim">Couldn't get a market rate. Type what you were charged.</p>
					{:else}
						<p class="dim">Type what you were charged, or refresh for the market rate.</p>
					{/if}
					{#if fxNow.chargedParsed?.rounded && fxNow.chargedCents !== null}
						<p class="dim mono">Saved as {baseAmountStr(fxNow.chargedCents)} {project.currency}.</p>
					{:else if fx.market && fx.pinned && fxNow.rate !== null}
						<p class="dim mono fx-paid">
							<span>You paid 1 {currencyCode} = {formatRate(fxNow.rate)} {project.currency}</span>
							{#if fxNow.canUseMarket}
								<button type="button" class="fx-reset" onclick={() => (fx = useMarket(fx))}>
									Use market rate
								</button>
							{/if}
						</p>
					{/if}
				</div>
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
			roundingNotes={payerRounding}
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
			roundingNotes={splitRounding}
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

		{#if shownProblem}
			<p class="save-problem" aria-live="polite">{shownProblem}</p>
		{/if}

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
	.rounding-note {
		margin: -4px 0 10px;
		font-size: 11px;
		text-align: center;
	}

	.save-problem {
		margin: 0 0 10px;
		font-size: 12px;
		font-family: var(--font-mono);
		line-height: 1.5;
		color: var(--owe);
	}

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

	.fx-card {
		padding: 12px 14px 14px;
		margin-bottom: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.fx-head {
		align-items: center;
	}

	.fx-refresh {
		width: 30px;
		height: 30px;
		margin: -6px -6px -6px 0;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}

	.fx-refresh:hover:not(:disabled) {
		color: var(--accent);
	}

	.fx-refresh:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.fx-refresh svg {
		width: 16px;
		height: 16px;
	}

	.fx-refresh.spinning svg {
		animation: fx-spin 0.9s linear infinite;
	}

	@keyframes fx-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fx-refresh.spinning svg {
			animation: none;
			opacity: 0.5;
		}
	}

	.fx-field {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 6px 4px 12px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		transition: border-color 0.12s ease;
	}

	.fx-field:focus-within {
		border-color: var(--accent);
	}

	.fx-field.invalid {
		border-color: var(--owe);
	}

	.fx-sym {
		font-size: 18px;
		font-weight: 600;
		color: var(--ink-2);
	}

	.fx-input {
		flex: 1;
		min-width: 0;
		padding: 8px 0;
		background: transparent;
		border: 0;
		outline: none;
		color: var(--ink);
		font-size: 20px;
		letter-spacing: 0.02em;
	}

	.fx-delta {
		flex: none;
		padding: 3px 8px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
		background: var(--bg-3, var(--line));
		color: var(--ink-2);
	}

	.fx-delta.over {
		color: var(--owe);
		background: color-mix(in oklab, var(--owe) 16%, transparent);
	}

	.fx-delta.under {
		color: var(--owed);
		background: color-mix(in oklab, var(--owed) 16%, transparent);
	}

	.fx-delta.at-market {
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 11px;
	}

	.fx-status {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.fx-status p {
		margin: 0;
		font-size: 11px;
		line-height: 1.5;
	}

	.fx-paid {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 10px;
	}

	.fx-reset {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--accent);
		cursor: pointer;
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
