<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import { getCurrentMember } from '$lib/storage';
	import { todayDay } from '$lib/recurring';
	import { addCategory, addExpense, addPaymentMethod, generateId, updateExpense } from '$lib/sync/doc';
	import { saveRepeat } from '$lib/sync/recurring';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import type { Category, Expense, PaymentMethodItem, RepeatFrequency } from '$lib/types';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const members = $derived(room.members);

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));

	async function onSave(expense: Expense, repeat: RepeatFrequency | null) {
		// a retry after a failed save must reuse the rule the first try started
		const saved = room.expenses.find((e) => e.id === expense.id);
		handle.doc.transact(() => {
			const withRepeat = saveRepeat(handle, { ...expense, recurrenceId: saved?.recurrenceId }, repeat, todayDay());
			if (saved) updateExpense(handle, withRepeat);
			else addExpense(handle, withRepeat);
		});
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
