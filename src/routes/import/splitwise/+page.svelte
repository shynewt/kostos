<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import MemberPicker from '$lib/components/MemberPicker.svelte';
	import { computeBalances } from '$lib/balance';
	import { currencySymbolFor } from '$lib/currencies';
	import { formatRate } from '$lib/currency-convert';
	import { resolveRate } from '$lib/fx-cache';
	import { balancesByCurrency, parseSplitwiseCsv, type SplitwiseFile } from '$lib/import/splitwise';
	import { buildMembers, convertSplitwise, mostUsedCurrency } from '$lib/import/splitwise-convert';
	import { groupNameFromFileName } from '$lib/import/splitwise-name';
	import { createGroup, newGroupProject } from '$lib/io/createGroup';
	import { formatSigned } from '$lib/money';
	import { plural } from '$lib/plural';
	import type { Member } from '$lib/types';

	// well above any one group's export; it only stops a wrong file from freezing the tab
	const MAX_FILE_BYTES = 10 * 1024 * 1024;

	let fileInput = $state<HTMLInputElement | null>(null);
	let file = $state<SplitwiseFile | null>(null);
	let members = $state<Member[]>([]);
	let fileName = $state('');
	let parseError = $state<string | null>(null);
	let createError = $state<string | null>(null);
	let creating = $state(false);
	let groupName = $state('');
	let youMemberId = $state<string | null>(null);
	let baseCurrency = $state('');
	let rateInputs = $state<Record<string, string>>({});
	let fetchingRate = $state<string | null>(null);

	let arrivedByLink = false;
	afterNavigate(({ type }) => { arrivedByLink = type !== 'enter'; });
	function cancel() {
		if (arrivedByLink) history.back();
		else goto('/');
	}

	const currencies = $derived(file ? [...balancesByCurrency(file).keys()] : []);
	const foreignCurrencies = $derived(currencies.filter((code) => code !== baseCurrency));
	const rates = $derived(
		Object.fromEntries(foreignCurrencies.map((code) => [code, Number((rateInputs[code] ?? '').replace(',', '.'))]))
	);
	const missingRate = $derived(foreignCurrencies.some((code) => !(rates[code] > 0)));
	const conversion = $derived(file && !missingRate ? convertSplitwise(file, members, { baseCurrency, rates }) : null);
	const balances = $derived(
		conversion ? new Map(computeBalances(members, conversion.expenses, baseCurrency).map((b) => [b.memberId, b.net])) : null
	);
	const expenseCount = $derived(file ? file.rows.filter((row) => !row.isPayment && row.nets.some((net) => net !== 0)).length : 0);
	const paymentCount = $derived(file ? file.rows.filter((row) => row.isPayment).length : 0);
	const dateRange = $derived.by(() => {
		if (!file) return '';
		// rows hold UTC days, and spreading a huge array into Math.min would overflow the stack
		const dates = file.rows.map((row) => row.date);
		const format = (ms: number) =>
			new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
		const oldest = format(dates.reduce((min, date) => Math.min(min, date)));
		const newest = format(dates.reduce((max, date) => Math.max(max, date)));
		return oldest === newest ? oldest : `${oldest} to ${newest}`;
	});
	const notes = $derived.by(() => {
		if (!file || !conversion) return [];
		const lines = [...file.warnings];
		if (conversion.skippedRows.length > 0) {
			const descriptions = conversion.skippedRows.map((row) => row.description || 'no description').join(', ');
			lines.push(`Left out ${plural(conversion.skippedRows.length, 'expense', 'expenses')} that changed nobody’s balance, usually because someone paid only for themselves: ${descriptions}.`);
		}
		if (conversion.adjustedRows.length > 0) {
			lines.push(`${plural(conversion.adjustedRows.length, 'expense', 'expenses')} cost less than the money owed for ${conversion.adjustedRows.length === 1 ? 'it' : 'them'}; the amount owed is used as the cost.`);
		}
		return lines;
	});
	const canCreate = $derived(conversion !== null && youMemberId !== null && groupName.trim() !== '');

	async function handleFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const picked = input.files?.[0];
		if (!picked) return;
		reset();
		fileName = picked.name;
		if (picked.size > MAX_FILE_BYTES) {
			parseError = 'That file is too big to be a Splitwise export. Pick the CSV you exported from one group.';
			input.value = '';
			return;
		}
		const result = parseSplitwiseCsv(await picked.text());
		if (!result.ok) {
			parseError = result.error;
			input.value = '';
			return;
		}
		file = result.file;
		members = buildMembers(result.file.members);
		youMemberId = null;
		groupName = groupNameFromFileName(picked.name);
		baseCurrency = mostUsedCurrency(result.file);
	}

	function reset() {
		file = null;
		members = [];
		fileName = '';
		parseError = null;
		createError = null;
		youMemberId = null;
		rateInputs = {};
		if (fileInput) fileInput.value = '';
	}

	async function fetchRate(code: string) {
		fetchingRate = code;
		try {
			const resolved = await resolveRate(code, baseCurrency);
			if (resolved) rateInputs[code] = formatRate(resolved.rate);
			else createError = `Couldn’t fetch a rate for ${code}. Type it in instead.`;
		} finally { fetchingRate = null; }
	}

	async function onCreate() {
		if (!conversion || !youMemberId || creating) return;
		creating = true;
		createError = null;
		try {
			const project = newGroupProject({
				name: groupName.trim(),
				emoji: '🏠',
				color: 'lime',
				currency: baseCurrency,
				currencySymbol: currencySymbolFor(baseCurrency)
			});
			const roomId = await createGroup({ project, members: conversion.members, expenses: conversion.expenses }, youMemberId);
			await goto(`/p/${roomId}`);
		} catch (error) {
			createError = error instanceof Error ? error.message : 'Could not save the group on this device';
		} finally { creating = false; }
	}
</script>

<svelte:head>
	<title>Import from Splitwise · Kostos</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="screen" data-page="import-splitwise">
	<header class="app-bar">
		<div class="row gap-8" style="flex: 1;">
			<button class="icon-btn" aria-label="Cancel" onclick={cancel}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		</div>
		<div class="app-bar-title">Import from Splitwise</div>
		<div style="flex: 1;"></div>
	</header>

	<div class="scroll">
		<input bind:this={fileInput} type="file" accept=".csv,text/csv" class="hidden-input" onchange={handleFile} aria-label="Splitwise CSV file" />

		{#if !file}
			<section class="hero">
				<span class="hero-tile" aria-hidden="true">📄</span>
				<h1 class="hero-title">Bring a group over from Splitwise</h1>
				<p class="dim hero-sub">
					In Splitwise on the web, open the group’s settings (the gear icon) and export it as a spreadsheet. Then pick that CSV file here.
				</p>
			</section>
			<button type="button" class="btn btn-primary btn-block" onclick={() => fileInput?.click()}>Choose CSV file</button>
			{#if parseError}<FormError message={parseError} />{/if}
			{#if fileName && parseError}<p class="dim file-hint">{fileName}</p>{/if}
			<p class="dim privacy-hint">The file is read on this device and never uploaded. Only the new group syncs, encrypted, like any other.</p>
		{:else}
			<label class="name-label" for="group-name">Group name</label>
			<input id="group-name" class="input name-input" bind:value={groupName} placeholder="Group name" autocomplete="off" />

			<div class="card stats-card">
				<div class="info-row">
					<span class="info-label">Members</span>
					<span class="info-value mono">{members.length}</span>
				</div>
				<hr class="hairline" />
				<div class="info-row">
					<span class="info-label">Expenses</span>
					<span class="info-value mono">{expenseCount}</span>
				</div>
				{#if paymentCount > 0}
					<hr class="hairline" />
					<div class="info-row">
						<span class="info-label">Payments</span>
						<span class="info-value mono">{paymentCount}</span>
					</div>
				{/if}
				<hr class="hairline" />
				<div class="info-row">
					<span class="info-label">Dates</span>
					<span class="info-value mono">{dateRange}</span>
				</div>
				<hr class="hairline" />
				<div class="info-row">
					<span class="info-label">{currencies.length > 1 ? 'Main currency' : 'Currency'}</span>
					{#if currencies.length > 1}
						<select class="currency-select mono" bind:value={baseCurrency} onchange={() => (rateInputs = {})} aria-label="Main currency">
							{#each currencies as code (code)}<option value={code}>{code}</option>{/each}
						</select>
					{:else}
						<span class="info-value mono">{baseCurrency}</span>
					{/if}
				</div>
			</div>

			{#if foreignCurrencies.length > 0}
				<h2 class="question">Exchange rates</h2>
				<p class="dim question-hint">
					Splitwise keeps a balance per currency; Kostos adds everything up in {baseCurrency}. Expenses keep their own currency and amount.
				</p>
				<div class="card rates-card">
					{#each foreignCurrencies as code, index (code)}
						{#if index > 0}<hr class="hairline" />{/if}
						<div class="rate-row">
							<label class="rate-label mono" for="rate-{code}">1 {code} =</label>
							<input id="rate-{code}" class="input rate-input mono" inputmode="decimal" placeholder="rate" bind:value={rateInputs[code]} />
							<span class="mono dim">{baseCurrency}</span>
							<button type="button" class="btn rate-fetch" onclick={() => fetchRate(code)} disabled={fetchingRate !== null}>
								{fetchingRate === code ? 'Fetching…' : 'Today’s rate'}
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<h2 class="question">Balances</h2>
			{#if balances}
				<div class="card balances-card" aria-label="Balances after import">
					{#each members as member, index (member.id)}
						{@const net = balances.get(member.id) ?? 0}
						{#if index > 0}<hr class="hairline" style="margin-left: 56px;" />{/if}
						<div class="balance-row">
							<Avatar {member} size="md" />
							<span class="balance-name">{member.name}</span>
							<span class="mono balance-value" class:pos={net > 0} class:neg={net < 0}>
								{formatSigned(net, currencySymbolFor(baseCurrency), baseCurrency)}
							</span>
						</div>
					{/each}
				</div>
				<p class="dim question-hint">The same balances as in Splitwise{currencies.length > 1 ? ', added up at the rates above' : ''}.</p>
			{:else}
				<p class="dim question-hint">Add the exchange rates above to see the balances.</p>
			{/if}

			{#if notes.length > 0}
				<ul class="notes">
					{#each notes as note (note)}<li>{note}</li>{/each}
				</ul>
			{/if}

			<h2 class="question">Which one is you?</h2>
			<p class="dim question-hint">Everyone else can pick their name from the invite link.</p>
			<MemberPicker {members} bind:selectedId={youMemberId} />

			{#if createError}<FormError message={createError} />{/if}
			<button type="button" class="btn btn-primary btn-block submit-btn" disabled={!canCreate || creating} onclick={onCreate}>
				{creating ? 'Creating…' : 'Create group'}
			</button>
			<button type="button" class="btn btn-block reset-btn" onclick={reset} disabled={creating}>Pick a different file</button>
		{/if}
	</div>
</div>

<style>
	.hidden-input {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 22px 0 26px;
		text-align: center;
	}

	.hero-tile {
		width: 76px;
		height: 76px;
		border-radius: 22px;
		display: grid;
		place-items: center;
		font-size: 38px;
		background: color-mix(in oklab, var(--accent) 16%, var(--bg-2));
	}

	.hero-title {
		margin: 6px 0 0;
		font-size: 28px;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.15;
		text-wrap: balance;
	}

	.hero-sub {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		max-width: 320px;
	}

	.file-hint {
		font-size: 11px;
		font-family: var(--font-mono);
		text-align: center;
		margin: 10px 0 0;
	}

	.privacy-hint {
		font-size: 11px;
		text-align: center;
		margin: 14px 0 0;
		line-height: 1.5;
	}

	.name-label {
		display: block;
		margin: 14px 0 6px;
		font-size: 13px;
		color: var(--ink-2);
	}

	.name-input {
		font-size: 17px;
		font-weight: 600;
		padding: 14px 16px;
		margin-bottom: 14px;
	}

	.stats-card,
	.rates-card,
	.balances-card {
		padding: 0;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
	}

	.info-label {
		font-size: 13px;
		color: var(--ink-2);
	}

	.info-value {
		font-size: 13px;
		font-weight: 500;
		text-align: end;
	}

	.currency-select {
		font: inherit;
		font-size: 13px;
		padding: 4px 8px;
		border-radius: 8px;
		border: 1px solid var(--line-2);
		background: var(--bg-2);
		color: var(--ink);
	}

	.question {
		margin: 26px 0 0;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.question-hint {
		margin: 4px 0 12px;
		font-size: 13px;
		line-height: 1.45;
	}

	h2.question + .card {
		margin-top: 12px;
	}

	.rate-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		font-size: 13px;
	}

	.rate-label {
		flex: none;
	}

	.rate-input {
		width: 0;
		flex: 1;
		padding: 8px 10px;
		font-size: 14px;
	}

	.rate-fetch {
		flex: none;
		padding: 7px 10px;
		font-size: 12px;
	}

	.balance-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
	}

	.balance-name {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.balance-value {
		font-size: 14px;
		font-weight: 600;
	}

	.balance-value.pos {
		color: var(--owed);
	}

	.balance-value.neg {
		color: var(--owe);
	}

	.notes {
		margin: 14px 0 0;
		padding: 10px 14px 10px 30px;
		border-radius: var(--radius);
		background: color-mix(in oklab, var(--accent) 6%, var(--bg-2));
		font-size: 12px;
		line-height: 1.5;
		color: var(--ink-2);
	}

	.submit-btn {
		margin-top: 22px;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.reset-btn {
		margin-top: 10px;
		color: var(--ink-2);
	}
</style>
