<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import BottomSheet from './BottomSheet.svelte';
	import ExpenseForm from './ExpenseForm.svelte';
	import LoadingScreen from './LoadingScreen.svelte';
	import PageSheet from './PageSheet.svelte';
	import { getCurrentMember } from '$lib/storage';
	import { todayDay } from '$lib/recurring';
	import { addCategory, addExpense, addPaymentMethod, generateId, updateExpense } from '$lib/sync/doc';
	import { saveRepeat } from '$lib/sync/recurring';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import type { Category, Expense, PaymentMethodItem, RepeatFrequency } from '$lib/types';

	type Props = {
		/** false once back was pressed while the sheet is open over another screen */
		isOpen?: boolean;
		/** after the sheet has slid away, saved or not */
		onLeave: () => void;
	};

	let { isOpen = true, onLeave }: Props = $props();

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const members = $derived(room.members);

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));

	let sheet = $state<PageSheet>();
	let hasInput = $state(false);
	let isConfirmingDiscard = $state(false);
	let isLeaving = false;

	async function onSave(expense: Expense, repeat: RepeatFrequency | null) {
		// a retry after a failed save must reuse the rule the first try started
		const saved = room.expenses.find((e) => e.id === expense.id);
		handle.doc.transact(() => {
			const withRepeat = saveRepeat(handle, { ...expense, recurrenceId: saved?.recurrenceId }, repeat, todayDay());
			if (saved) updateExpense(handle, withRepeat);
			else addExpense(handle, withRepeat);
		});
		await handle.persistence?.flush();
		close();
	}

	function close() {
		isLeaving = true;
		sheet?.close();
	}

	function requestClose() {
		if (hasInput) isConfirmingDiscard = true;
		else close();
	}

	function discard() {
		isConfirmingDiscard = false;
		close();
	}

	// the phone's back gesture would otherwise drop what was typed without asking
	beforeNavigate((navigation) => {
		if (isLeaving || !hasInput || navigation.type !== 'popstate') return;
		navigation.cancel();
		isConfirmingDiscard = true;
	});

	// over another screen, back only drops the history entry; the sheet stays until it has
	// asked about anything typed, then slides away
	$effect(() => {
		if (isOpen || isLeaving) return;
		untrack(() => {
			if (!hasInput) return close();
			pushState(`/p/${roomId}/add`, { addingExpense: true });
			isConfirmingDiscard = true;
		});
	});
</script>

<PageSheet bind:this={sheet} onRequestClose={requestClose} onClosed={onLeave}>
	{#if project && members.length > 0}
		<ExpenseForm
			{project}
			{members}
			{currentMemberId}
			expenses={room.expenses}
			mode="create"
			{onSave}
			onCancel={requestClose}
			bind:hasInput
			onAddCategory={(cat: Category) => addCategory(handle, cat)}
			onAddPaymentMethod={(m: PaymentMethodItem) => addPaymentMethod(handle, m)}
			{generateId}
		/>
	{:else}
		<LoadingScreen />
	{/if}
</PageSheet>

{#if isConfirmingDiscard}
	<BottomSheet title="Discard this expense?" onclose={() => (isConfirmingDiscard = false)}>
		<p class="dim discard-note">What you typed won’t be saved.</p>
		<div class="discard-actions">
			<button type="button" class="btn" onclick={() => (isConfirmingDiscard = false)}>Keep editing</button>
			<button type="button" class="btn btn-danger" onclick={discard}>Discard</button>
		</div>
	</BottomSheet>
{/if}

<style>
	.discard-note {
		margin: 4px 0 16px;
		font-size: 14px;
		text-align: center;
	}

	.discard-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
</style>
