<script lang="ts">
	import { goto } from '$app/navigation';
	import { pickMemberColor, pickMemberEmoji } from '$lib/avatar';
	import { enterDemo } from '$lib/demo';
	import { PROJECT_COLORS, PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import CurrencyPicker from '$lib/components/CurrencyPicker.svelte';
	import EmojiTilePicker from '$lib/components/EmojiTilePicker.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { CURRENCY_PRESETS, type CurrencyPreset } from '$lib/currencies';
	import { createGroup, newGroupProject } from '$lib/io/createGroup';
	import { generateId } from '$lib/sync/doc';
	import type { Member, ProjectColor } from '$lib/types';

	type DraftMember = { id: string; name: string };

	const creatorId = generateId();

	let emoji = $state('🏠');
	let color = $state<ProjectColor>('lime');
	let name = $state('');
	let description = $state('');
	let currencyCode = $state(CURRENCY_PRESETS[0].code);
	let currencySym = $state(CURRENCY_PRESETS[0].sym);
	let yourName = $state('');
	let others = $state<DraftMember[]>([{ id: generateId(), name: '' }]);
	let submitting = $state(false);
	let createError = $state<string | null>(null);

	const canCreate = $derived(name.trim().length > 0 && yourName.trim().length > 0);

	// nudge throwaway "test" groups toward the local demo so they don't pile up.
	// substring match (so "testi", "test123" count) plus common words in other languages.
	const looksLikeTest = $derived(
		/test|prueba|prova|essai|versuch|demo|sample|ejemplo|muestra|exemple|esempio|beispiel|playground|sandbox|trial|dummy|тест|проба|测试|テスト|테스트/i.test(
			name
		)
	);
	let demoLoading = $state(false);
	async function tryDemo() {
		if (demoLoading) return;
		demoLoading = true;
		try {
			await enterDemo();
		} finally {
			demoLoading = false;
		}
	}

	function pickCurrency(p: CurrencyPreset) {
		currencyCode = p.code;
		currencySym = p.sym;
	}

	function customCurrency(sym: string) {
		currencyCode = '—';
		currencySym = sym;
	}

	function addAnother() {
		others = [...others, { id: generateId(), name: '' }];
	}

	function removeOther(id: string) {
		others = others.filter((m) => m.id !== id);
		if (others.length === 0) others = [{ id: generateId(), name: '' }];
	}

	async function onSubmit(event?: Event) {
		event?.preventDefault();
		if (submitting || !canCreate) return;
		submitting = true;
		createError = null;
		try {
			const made: Member[] = [];
			const creator: Member = {
				id: creatorId,
				name: yourName.trim(),
				color: pickMemberColor(made),
				emoji: pickMemberEmoji(made),
				createdAt: Date.now()
			};
			made.push(creator);
			const otherMembers: Member[] = [];
			for (const n of others.map((m) => m.name.trim()).filter((n) => n.length > 0)) {
				const m: Member = {
					id: generateId(),
					name: n,
					color: pickMemberColor(made),
					emoji: pickMemberEmoji(made),
					createdAt: Date.now()
				};
				made.push(m);
				otherMembers.push(m);
			}

			const project = newGroupProject({
				name: name.trim(),
				description: description.trim() || undefined,
				emoji,
				color,
				currency: currencyCode,
				currencySymbol: currencySym
			});

			const roomId = await createGroup({ project, members: [creator, ...otherMembers], expenses: [] }, creator.id);
			await goto(`/p/${roomId}`);
		} catch (error) {
			createError = error instanceof Error ? error.message : 'Could not save the group on this device';
		} finally { submitting = false; }
	}
</script>

<svelte:head>
	<title>New group · Kostos</title>
</svelte:head>

<div class="screen" data-page="new">
	<header class="app-bar">
		<div class="row gap-8" style="flex: 1;">
			<button class="icon-btn" aria-label="Cancel" onclick={() => goto('/')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>
		<div class="app-bar-title">New group</div>
		<div class="row" style="flex: 1;"></div>
	</header>

	<form class="scroll" onsubmit={onSubmit} style="padding-top: 8px;">
		<div class="col emoji-block">
			<EmojiTilePicker {emoji} {color} onPick={(value) => (emoji = value)} />

			<div class="swatch-row" role="radiogroup" aria-label="Group color">
				{#each PROJECT_COLORS as c (c)}
					<button
						type="button"
						class="swatch"
						class:on={color === c}
						role="radio"
						aria-checked={color === c}
						aria-label={c}
						style="--swatch: {PROJECT_COLOR_VALUES[c]};"
						onclick={() => (color = c)}
					></button>
				{/each}
			</div>
		</div>

		<input
			class="input"
			placeholder="Group name"
			bind:value={name}
			style="font-size: 17px; font-weight: 600; text-align: center; padding: 16px; margin-bottom: 8px;"
		/>
		{#if looksLikeTest}
			<div class="test-hint">
				<span>Just trying Kostos out? Open the demo group instead!</span>
				<button type="button" class="test-hint-btn" onclick={tryDemo} disabled={demoLoading}>
					{demoLoading ? 'Loading…' : 'See the demo'}
				</button>
			</div>
		{/if}
		<input
			class="input"
			placeholder="Description (optional)"
			bind:value={description}
			style="font-size: 13px; text-align: center; padding: 12px; color: var(--ink-2);"
		/>

		<div class="card field-card" style="margin-top: 18px; padding: 4px;">
			<CurrencyPicker
				code={currencyCode}
				symbol={currencySym}
				onSelect={pickCurrency}
				onCustom={customCurrency}
			/>
		</div>

		<h2 class="question">Who’s in the group?</h2>
		<p class="dim question-hint">Start with your name. Anyone you leave out can join later from the invite link.</p>

		<div class="card members-card">
			<div class="list-item member-row">
				<div class="av av-you" style="background: {tileBackground(color)}; color: {PROJECT_COLOR_VALUES[color]};">
					{(yourName.trim()[0] ?? '?').toUpperCase()}
				</div>
				<input
					class="input member-input"
					bind:value={yourName}
					placeholder="Your name"
					autocomplete="off"
				/>
				<span class="sticker sticker-on you-tag">YOU</span>
			</div>
			{#each others as m, i (m.id)}
				<hr class="hairline" style="margin-left: 56px;" />
				<div class="list-item member-row">
					<div class="av av-them">{(m.name.trim()[0] ?? '?').toUpperCase()}</div>
					<input
						class="input member-input"
						bind:value={others[i].name}
						placeholder="Member name"
						autocomplete="off"
					/>
					<button
						type="button"
						class="icon-btn"
						aria-label="Remove member"
						onclick={() => removeOther(m.id)}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>
			{/each}
			<hr class="hairline" style="margin-left: 56px;" />
			<button type="button" class="list-item add-row" onclick={addAnother}>
				<div class="av av-sm add-bubble">+</div>
				<span class="add-label">Add another</span>
			</button>
		</div>

		{#if createError}<FormError message={createError} />{/if}
		<button
			type="submit"
			class="btn btn-primary btn-block submit-btn"
			disabled={!canCreate || submitting}
		>
			{submitting ? 'Creating…' : 'Create group'}
		</button>
		<p class="dim restore-line">Have a backup? <a class="restore-link" href="/restore">Restore it</a></p>
		<p class="dim restore-line import-line">Coming from Splitwise? <a class="restore-link" href="/import/splitwise">Import a CSV</a></p>
	</form>
</div>

<style>
	.test-hint {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
		padding: 12px 14px;
		margin-bottom: 8px;
		border: 1px dashed var(--line-2);
		border-radius: var(--radius);
		background: color-mix(in oklab, var(--accent) 6%, var(--bg-2));
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-2);
	}

	.test-hint-btn {
		align-self: flex-start;
		padding: 7px 14px;
		border-radius: 999px;
		border: 1px solid color-mix(in oklab, var(--accent) 45%, var(--line));
		background: color-mix(in oklab, var(--accent) 14%, transparent);
		color: var(--accent);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.test-hint-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.question {
		margin: 28px 0 0;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.question-hint {
		margin: 4px 0 14px;
		font-size: 13px;
		line-height: 1.45;
	}

	.restore-line {
		margin: 16px 0 8px;
		font-size: 13px;
		text-align: center;
	}

	.import-line {
		margin-top: -2px;
	}

	.restore-link {
		color: var(--ink-2);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	@media (hover: hover) {
		.restore-link:hover {
			color: var(--accent);
		}
	}

	.emoji-block {
		align-items: center;
		padding: 10px 0 22px;
		gap: 12px;
	}

	.swatch-row {
		display: flex;
		gap: 10px;
	}

	.swatch {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		background: var(--swatch);
		border: 2px solid transparent;
		cursor: pointer;
		padding: 0;
		transition: transform 0.12s ease;
	}

	@media (hover: hover) {
		.swatch:hover {
			transform: scale(1.08);
		}
	}

	.swatch.on {
		border-color: var(--ink);
		box-shadow: 0 0 0 2px var(--bg);
	}

	.members-card {
		padding: 4px;
	}

	.member-row {
		padding: 12px;
	}

	.member-input {
		flex: 1;
		background: transparent;
		border: 0;
		padding: 8px 10px;
		font-size: 14px;
		font-weight: 500;
	}

	.av-them {
		background: color-mix(in oklab, var(--ink) 12%, transparent);
		color: var(--ink);
	}

	.you-tag {
		padding: 2px 8px;
		font-size: 10px;
	}

	.add-row {
		padding: 12px;
		width: 100%;
		background: transparent;
		border: 0;
		text-align: left;
		cursor: pointer;
		color: var(--ink-2);
	}

	.add-bubble {
		background: transparent;
		border: 1px dashed var(--line-2);
		color: var(--ink-3);
		width: 32px;
		height: 32px;
		font-size: 14px;
	}

	.add-label {
		font-size: 14px;
		font-weight: 500;
	}

	.submit-btn {
		margin-top: 22px;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
