<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ExpenseForm from '$lib/components/ExpenseForm.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import { getCurrentMember } from '$lib/storage';
	import {
		addCategory,
		addPaymentMethod,
		generateId,
		expenseVersions,
		updateExpense
	} from '$lib/sync/doc';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import type { Category, Expense, PaymentMethodItem } from '$lib/types';

	const roomId = $derived(page.params.roomId ?? '');
	const expenseId = $derived(page.params.expenseId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const members = $derived(room.members);

	let initial = $state<Expense | null>(null);
	let initialVersions: string[] = [];
	let notFound = $state(false);

	$effect(() => {
		const expense = room.expenses.find((e) => e.id === expenseId);
		if (expense) {
			if (!initial) { initial = expense; initialVersions = expenseVersions(handle, expenseId).map((v) => v.id); }
		} else if (project) {
			notFound = true;
		}
	});

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));

	async function onSave(expense: Expense) {
		updateExpense(handle, expense, initialVersions);
		await handle.persistence?.flush();
		// replace so back from the detail doesn't land on the edit form again
		await goto(`/p/${roomId}/expenses/${expense.id}`, { replaceState: true });
	}

	function onCancel() {
		goto(`/p/${roomId}/expenses/${expenseId}`, { replaceState: true });
	}
</script>

{#if notFound}
	<div class="screen empty-screen">
		<div class="card">
			<p class="muted">Expense not found.</p>
			<a href="/p/{roomId}/expenses" class="btn btn-block back-btn">Back to expenses</a>
		</div>
	</div>
{:else if project && members.length > 0 && initial}
	<ExpenseForm
		{project}
		{members}
		{currentMemberId}
		expenses={room.expenses}
		mode="edit"
		{initial}
		{onSave}
		{onCancel}
		onAddCategory={(cat: Category) => addCategory(handle, cat)}
		onAddPaymentMethod={(m: PaymentMethodItem) => addPaymentMethod(handle, m)}
		{generateId}
	/>
{:else}
	<LoadingScreen />
{/if}

<style>
	.empty-screen {
		justify-content: center;
		align-items: center;
		padding: 24px;
	}

	.back-btn {
		margin-top: 14px;
	}
</style>
