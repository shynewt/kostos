<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import { getCurrentMember } from '$lib/storage';
	import { addCategory, addExpense, addPaymentMethod, generateId, updateExpense } from '$lib/sync/doc';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import type { Category, Expense, PaymentMethodItem } from '$lib/types';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const members = $derived(room.members);

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));

	async function onSave(expense: Expense) {
		if (room.expenses.some((e) => e.id === expense.id)) updateExpense(handle, expense);
		else addExpense(handle, expense);
		await handle.persistence?.flush();
		// replace so back doesn't return to the now-submitted add form
		await goto(`/p/${roomId}`, { replaceState: true });
	}

	function onCancel() {
		goto(`/p/${roomId}`, { replaceState: true });
	}
</script>

{#if project && members.length > 0}
	<ExpenseForm
		{project}
		{members}
		{currentMemberId}
		expenses={room.expenses}
		mode="create"
		{onSave}
		{onCancel}
		onAddCategory={(cat: Category) => addCategory(handle, cat)}
		onAddPaymentMethod={(m: PaymentMethodItem) => addPaymentMethod(handle, m)}
		{generateId}
	/>
{:else}
	<LoadingScreen />
{/if}
