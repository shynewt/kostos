<script lang="ts">
	import { page } from '$app/state';
	import EmojiListEditor from '$lib/components/EmojiListEditor.svelte';
	import type { EditorItem } from '$lib/components/EmojiListEditor.svelte';
	import EmptyCard from '$lib/components/EmptyCard.svelte';
	import ScreenAppBar from '$lib/components/ScreenAppBar.svelte';
	import { addPaymentMethod, generateId, removePaymentMethod, updatePaymentMethod } from '$lib/sync/doc';
	import { useRoom } from '$lib/sync/useRoom.svelte';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);

	function onAdd(input: Omit<EditorItem, 'id'>) {
		addPaymentMethod(handle, { id: generateId(), name: input.name, emoji: input.emoji });
	}

	function onUpdate(id: string, updates: Partial<Omit<EditorItem, 'id'>>) {
		updatePaymentMethod(handle, id, updates);
	}
</script>

<svelte:head>
	<title>Payment methods · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="payment-methods">
	<ScreenAppBar title="Payment methods" backHref="/p/{roomId}/settings" />

	<div class="scroll">
		{#if project && !(project.paymentMethodsEnabled ?? true)}
			<EmptyCard>
				<p>Payment methods are off. Turn on "Track payment method" in settings to edit them.</p>
			</EmptyCard>
		{:else if project}
			<p class="dim intro">Note how each expense was paid, like cash or card.</p>
			<div class="section-head">
				<div class="eyebrow">All payment methods</div>
				<span class="dim mono section-count">{project.paymentMethods.length}</span>
			</div>
			<div class="card editor-card">
				<EmojiListEditor
					items={project.paymentMethods}
					fallbackEmoji="💳"
					{onUpdate}
					onRemove={(id) => removePaymentMethod(handle, id)}
					{onAdd}
				/>
			</div>
		{/if}
	</div>
</div>

<style>
	.intro {
		margin: 4px 2px 8px;
		font-size: 12px;
		line-height: 1.5;
	}

	.section-count {
		font-size: 11px;
	}

	.editor-card {
		padding: 10px 14px;
	}
</style>
