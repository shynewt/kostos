<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import EmojiOptionList from './EmojiOptionList.svelte';
	import type { EmojiItem } from './EmojiOptionList.svelte';
	import NotesField from './NotesField.svelte';
	import TripOptionList from './TripOptionList.svelte';
	import { compactDayLabel, dayLabel } from '$lib/date-label';
	import { REPEAT_LABELS, repeatSummary } from '$lib/recurring';
	import type { Category, PaymentMethodItem, RepeatFrequency, Trip } from '$lib/types';

	export type DetailPanel = 'category' | 'date' | 'trip' | 'payment' | 'repeat' | 'note';
	type Panel = DetailPanel;

	type Props = {
		categories: Category[];
		categoryId: string | undefined;
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
		/** undefined hides the slot, e.g. for settlements */
		repeat?: RepeatFrequency | null;
		/** the day copies count from: the rule's own start once it exists, else the expense date */
		repeatStartDay?: string;
		onSelectRepeat?: (frequency: RepeatFrequency | null) => void;
		openPanel?: Panel | null;
	};

	let {
		categories,
		categoryId,
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
		onSelectRepeat,
		openPanel = $bindable(null)
	}: Props = $props();

	const paymentMethod = $derived(paymentMethods?.find((m) => m.id === paymentMethodId));
	const trip = $derived(trips.find((t) => t.id === tripId));
	const dateText = $derived(dayLabel(dateStr, Date.now()));
	const dateSlotText = $derived(compactDayLabel(dateStr, Date.now()));
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

{#snippet cell(panel: Panel, label: string, value: string | undefined, emoji: string | undefined, accessibleName: string)}
	<button
		type="button"
		class="detail-cell"
		class:filled={!!value}
		class:open={openPanel === panel}
		aria-haspopup="dialog"
		aria-label={accessibleName}
		onclick={() => toggle(panel)}
	>
		<span class="cell-icon" aria-hidden="true">
			{#if emoji}
				{emoji}
			{:else}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					{#if panel === 'date'}
						<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
					{:else if panel === 'payment'}
						<rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10.5h18M7 15h3" />
					{:else if panel === 'note'}
						<path d="M5 7h14M5 12h14M5 17h9" />
					{:else if panel === 'repeat'}
						<path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" />
					{:else}
						<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.3" />
					{/if}
				</svg>
			{/if}
		</span>
		<span class="cell-label">{value ?? label}</span>
	</button>
{/snippet}

<div class="details">
	<div class="detail-bar">
		{@render cell('date', 'Date', dateSlotText, undefined, `Date: ${dateText}`)}
		{#if paymentMethods}
			{@render cell(
				'payment',
				'Payment',
				paymentMethod?.name,
				paymentMethod?.emoji,
				paymentMethod ? `Payment method: ${paymentMethod.name}` : 'Add a payment method'
			)}
		{/if}
		{@render cell('note', 'Note', noteText || undefined, undefined, noteText ? `Note: ${noteText}` : 'Add a note')}
		{#if repeat !== undefined}
			{@render cell(
				'repeat',
				'Repeat',
				repeat ? REPEAT_LABELS[repeat] : undefined,
				undefined,
				repeat ? `Repeats ${REPEAT_LABELS[repeat].toLowerCase()}` : 'Make this repeat'
			)}
		{/if}
		{#if trips.length > 0}
			{@render cell('trip', 'Trip', trip?.name, trip?.emoji, trip ? `Trip: ${trip.name}` : 'Add a trip')}
		{/if}
	</div>

	{#if openPanel}
		<BottomSheet title={PANEL_TITLES[openPanel]} onclose={close}>
			<div class="sheet-body">
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
			{#if openPanel === 'date' || openPanel === 'repeat' || openPanel === 'note'}
				<button type="button" class="btn btn-primary btn-block sheet-done" onclick={close}>Done</button>
			{/if}
		</BottomSheet>
	{/if}
</div>

<style>
	.details {
		margin-bottom: 10px;
	}

	/* every detail keeps its own slot, so nothing scrolls out of view or moves once it's filled in */
	.detail-bar {
		display: flex;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}

	.detail-cell {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 9px 3px 8px;
		border: 0;
		border-radius: calc(var(--radius) - 1px);
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 11px;
		font-weight: 500;
		line-height: 1.2;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color 0.12s ease,
			color 0.12s ease;
	}

	.detail-cell + .detail-cell::before {
		content: '';
		position: absolute;
		left: -0.5px;
		top: 11px;
		bottom: 11px;
		width: 1px;
		background: var(--line);
	}

	.detail-cell:active {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}

	.detail-cell.filled {
		color: var(--ink);
		font-weight: 600;
	}

	.detail-cell.open {
		background: color-mix(in oklab, var(--accent) 12%, transparent);
	}

	.detail-cell:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.cell-icon {
		position: relative;
		display: grid;
		place-items: center;
		height: 18px;
		font-size: 15px;
		line-height: 1;
		color: var(--ink-3);
	}

	.cell-icon svg {
		width: 18px;
		height: 18px;
	}

	.filled .cell-icon {
		color: var(--accent);
	}

	.cell-label {
		max-width: 100%;
		padding-inline: 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* the date is always first and never cut short, and "Tomorrow" needs the slot's full width on a 360px phone */
	.detail-cell:first-child .cell-label {
		padding-inline: 0;
	}

	/* an empty slot gets a small plus on its icon, so it reads as something still to add */
	.detail-cell:not(.filled) .cell-icon::after {
		content: '+';
		position: absolute;
		left: calc(50% + 8px);
		top: -4px;
		font-size: 11px;
		font-weight: 700;
		color: var(--accent);
	}

	/* below 390px the slots get too narrow for that much breathing room: an 11-letter trip name has to fit whole */
	@media (max-width: 389px) {
		.cell-label {
			padding-inline: 2px;
		}
	}

	/* five slots on a 320px phone leave about 50px each: "Tomorrow" only fits a size down */
	@media (max-width: 340px) {
		.detail-cell {
			padding-inline: 2px;
			font-size: 10px;
		}

		.cell-label {
			padding-inline: 1px;
		}
	}

	.sheet-body {
		margin: 14px -8px 0;
	}

	.sheet-done {
		margin-top: 16px;
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
