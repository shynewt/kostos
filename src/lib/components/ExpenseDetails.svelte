<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import EmojiOptionList from './EmojiOptionList.svelte';
	import type { EmojiItem } from './EmojiOptionList.svelte';
	import NotesField from './NotesField.svelte';
	import TripOptionList from './TripOptionList.svelte';
	import { dayLabel } from '$lib/date-label';
	import { REPEAT_LABELS, repeatSummary } from '$lib/recurring';
	import type { Category, PaymentMethodItem, RepeatFrequency, Trip } from '$lib/types';

	type Panel = 'category' | 'date' | 'trip' | 'payment' | 'repeat' | 'note';

	type Props = {
		categories: Category[];
		categoryId: string | undefined;
		categoryIsGuessed: boolean;
		onSelectCategory: (id: string) => void;
		onAddCategory: (item: EmojiItem) => void;
		/** null when the group doesn't track payment methods */
		paymentMethods: PaymentMethodItem[] | null;
		paymentMethodId: string | undefined;
		onSelectPaymentMethod: (id: string) => void;
		onAddPaymentMethod: (item: EmojiItem) => void;
		trips: Trip[];
		tripId: string | undefined;
		onSelectTrip: (id: string | undefined) => void;
		manageTripsHref: string;
		dateStr: string;
		notes: string;
		/** undefined hides the chip, e.g. for settlements */
		repeat?: RepeatFrequency | null;
		/** the day copies count from: the rule's own start once it exists, else the expense date */
		repeatStartDay?: string;
		onSelectRepeat?: (frequency: RepeatFrequency | null) => void;
	};

	let {
		categories,
		categoryId,
		categoryIsGuessed,
		onSelectCategory,
		onAddCategory,
		paymentMethods,
		paymentMethodId,
		onSelectPaymentMethod,
		onAddPaymentMethod,
		trips,
		tripId,
		onSelectTrip,
		manageTripsHref,
		dateStr = $bindable(),
		notes = $bindable(),
		repeat,
		repeatStartDay,
		onSelectRepeat
	}: Props = $props();

	let openPanel = $state<Panel | null>(null);
	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const category = $derived(categories.find((c) => c.id === categoryId));
	const paymentMethod = $derived(paymentMethods?.find((m) => m.id === paymentMethodId));
	const trip = $derived(trips.find((t) => t.id === tripId));
	const dateText = $derived(dayLabel(dateStr, Date.now()));
	const noteText = $derived(notes.trim());
	const repeatOptions: (RepeatFrequency | null)[] = [null, 'weekly', 'monthly', 'yearly'];
	const repeatHint = $derived.by(() => {
		const startDay = repeatStartDay || dateStr;
		if (!repeat || Number.isNaN(Date.parse(startDay))) return null;
		return repeatSummary(repeat, startDay);
	});

	const PANEL_TITLES: Record<Panel, string> = {
		category: 'Category',
		date: 'Date',
		trip: 'Trip',
		payment: 'Payment method',
		repeat: 'Repeat',
		note: 'Note'
	};

	function toggle(panel: Panel) {
		openPanel = openPanel === panel ? null : panel;
	}

	function close() {
		openPanel = null;
	}
</script>

{#snippet chip(panel: Panel, filled: boolean, accessibleName: string, content: Snippet)}
	<button
		type="button"
		class="detail-chip"
		class:filled
		class:open={openPanel === panel}
		aria-expanded={openPanel === panel}
		aria-controls="expense-detail-panel"
		aria-label={accessibleName}
		onclick={() => toggle(panel)}
	>
		{@render content()}
	</button>
{/snippet}

<div class="details">
	<div class="detail-chips">
		{#snippet categoryContent()}
			{#if category}
				<span class="chip-emoji" aria-hidden="true">{category.emoji}</span>
				<span class="chip-text">{category.name}</span>
				{#if categoryIsGuessed}<span class="chip-guessed">guessed</span>{/if}
			{:else}
				<span class="chip-plus" aria-hidden="true">+</span><span class="chip-text">Category</span>
			{/if}
		{/snippet}
		{@render chip(
			'category',
			!!category,
			category ? `Category: ${category.name}${categoryIsGuessed ? ', guessed' : ''}` : 'Add a category',
			categoryContent
		)}

		{#snippet dateContent()}
			<svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
			<span class="chip-text">{dateText}</span>
		{/snippet}
		{@render chip('date', true, `Date: ${dateText}`, dateContent)}

		{#if trips.length > 0}
			{#snippet tripContent()}
				{#if trip}
					<span class="chip-emoji" aria-hidden="true">{trip.emoji}</span>
					<span class="chip-text">{trip.name}</span>
				{:else}
					<span class="chip-plus" aria-hidden="true">+</span><span class="chip-text">Trip</span>
				{/if}
			{/snippet}
			{@render chip('trip', !!trip, trip ? `Trip: ${trip.name}` : 'Add a trip', tripContent)}
		{/if}

		{#if paymentMethods}
			{#snippet paymentContent()}
				{#if paymentMethod}
					<span class="chip-emoji" aria-hidden="true">{paymentMethod.emoji}</span>
					<span class="chip-text">{paymentMethod.name}</span>
				{:else}
					<span class="chip-plus" aria-hidden="true">+</span><span class="chip-text">Payment</span>
				{/if}
			{/snippet}
			{@render chip(
				'payment',
				!!paymentMethod,
				paymentMethod ? `Payment method: ${paymentMethod.name}` : 'Add a payment method',
				paymentContent
			)}
		{/if}

		{#if repeat !== undefined}
			{#snippet repeatContent()}
				{#if repeat}
					<svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></svg>
					<span class="chip-text">{REPEAT_LABELS[repeat]}</span>
				{:else}
					<span class="chip-plus" aria-hidden="true">+</span><span class="chip-text">Repeat</span>
				{/if}
			{/snippet}
			{@render chip('repeat', !!repeat, repeat ? `Repeats ${REPEAT_LABELS[repeat].toLowerCase()}` : 'Make this repeat', repeatContent)}
		{/if}

		{#snippet noteContent()}
			{#if noteText}
				<svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9" /></svg>
				<span class="chip-text chip-note">{noteText}</span>
			{:else}
				<span class="chip-plus" aria-hidden="true">+</span><span class="chip-text">Note</span>
			{/if}
		{/snippet}
		{@render chip('note', !!noteText, noteText ? `Note: ${noteText}` : 'Add a note', noteContent)}
	</div>

	{#if openPanel}
		<div
			class="card detail-panel"
			id="expense-detail-panel"
			transition:slide={{ duration: reducedMotion ? 0 : 160 }}
		>
			<div class="panel-head">
				<span class="panel-title">{PANEL_TITLES[openPanel]}</span>
				<button type="button" class="panel-done" onclick={close}>Done</button>
			</div>
			{#if openPanel === 'category'}
				<EmojiOptionList
					label="Category"
					fallbackEmoji="📦"
					items={categories}
					selectedId={categoryId}
					onSelect={(id) => {
						onSelectCategory(id);
						close();
					}}
					onAddCustom={(item) => {
						onAddCategory(item);
						close();
					}}
				/>
			{:else if openPanel === 'payment' && paymentMethods}
				<EmojiOptionList
					label="Payment method"
					fallbackEmoji="💳"
					items={paymentMethods}
					selectedId={paymentMethodId}
					onSelect={(id) => {
						onSelectPaymentMethod(id);
						close();
					}}
					onAddCustom={(item) => {
						onAddPaymentMethod(item);
						close();
					}}
				/>
			{:else if openPanel === 'trip'}
				<TripOptionList
					{trips}
					selectedId={tripId}
					onSelect={(id) => {
						onSelectTrip(id);
						close();
					}}
					manageHref={manageTripsHref}
				/>
			{:else if openPanel === 'date'}
				<div class="date-body">
					<input class="input date-input" type="date" bind:value={dateStr} aria-label="Date" />
				</div>
			{:else if openPanel === 'repeat'}
				<ul class="repeat-list" aria-label="Repeat">
					{#each repeatOptions as option (option ?? 'never')}
						<li>
							<button
								type="button"
								class="repeat-option"
								class:on={option === (repeat ?? null)}
								aria-pressed={option === (repeat ?? null)}
								onclick={() => {
									onSelectRepeat?.(option);
									if (option === null) close();
								}}
							>
								{option ? REPEAT_LABELS[option] : 'Never'}
							</button>
						</li>
					{/each}
				</ul>
				<p class="repeat-hint">
					{#if repeatHint}
						{repeatHint}. The group gets a copy with the same payers and split each time; later edits change only the copies still to come.
					{:else}
						Add this expense again every week, month or year, for rent and subscriptions.
					{/if}
				</p>
			{:else if openPanel === 'note'}
				<NotesField bind:value={notes} />
			{/if}
		</div>
	{/if}
</div>

<style>
	.details {
		margin-bottom: 22px;
	}

	.detail-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.detail-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		min-height: 36px;
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px dashed var(--line-2);
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			border-color 0.12s ease,
			color 0.12s ease;
	}

	.detail-chip.filled {
		border-style: solid;
		border-color: var(--line);
		background: var(--bg-2);
		color: var(--ink);
	}

	.detail-chip.open {
		border-style: solid;
		border-color: var(--accent);
	}

	.detail-chip:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.chip-plus {
		color: var(--accent);
		font-weight: 700;
	}

	.chip-emoji {
		font-size: 15px;
		line-height: 1;
	}

	.chip-icon {
		width: 15px;
		height: 15px;
		flex: none;
		color: var(--ink-2);
	}

	.chip-text {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chip-note {
		max-width: 160px;
	}

	.chip-guessed {
		font-family: var(--font-mono);
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent);
		background: color-mix(in oklab, var(--accent) 14%, transparent);
		padding: 2px 6px;
		border-radius: 999px;
		line-height: 1.4;
	}

	.detail-panel {
		margin-top: 10px;
		padding: 4px 0 4px;
		overflow: hidden;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px 8px 16px;
	}

	.panel-title {
		font-size: 14px;
		font-weight: 600;
	}

	.panel-done {
		padding: 4px 6px;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.repeat-list {
		list-style: none;
		margin: 0;
		padding: 0 8px;
	}

	.repeat-list li + li {
		border-top: 1px solid var(--line);
	}

	.repeat-option {
		width: 100%;
		padding: 11px 8px;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}

	.repeat-option.on {
		color: var(--accent);
	}

	.repeat-hint {
		margin: 4px 16px 12px;
		font-size: 12px;
		line-height: 1.45;
		color: var(--ink-2);
	}

	.date-body {
		padding: 0 12px 12px;
	}

	.date-input {
		padding: 12px 14px;
		font-family: var(--font-sans);
		font-size: 15px;
	}
</style>
