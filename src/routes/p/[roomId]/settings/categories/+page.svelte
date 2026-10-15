<script lang="ts">
	import { page } from '$app/state';
	import EmojiListEditor from '$lib/components/EmojiListEditor.svelte';
	import type { EditorItem } from '$lib/components/EmojiListEditor.svelte';
	import ScreenAppBar from '$lib/components/ScreenAppBar.svelte';
	import { addCategory, generateId, removeCategory, updateCategory } from '$lib/sync/doc';
	import { useRoom } from '$lib/sync/useRoom.svelte';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);

	function onAdd(input: Omit<EditorItem, 'id'>) {
		addCategory(handle, { id: generateId(), name: input.name, emoji: input.emoji });
	}

	function onUpdate(id: string, updates: Partial<Omit<EditorItem, 'id'>>) {
		updateCategory(handle, id, updates);
	}
</script>

<svelte:head>
	<title>Categories · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="categories">
	<ScreenAppBar title="Categories" backHref="/p/{roomId}/settings" />

	<div class="scroll">
		<p class="dim intro">Label expenses by what they were for.</p>

		{#if project}
			<div class="section-head">
				<div class="eyebrow">All categories</div>
				<span class="dim mono section-count">{project.categories.length}</span>
			</div>
			<div class="card editor-card">
				<EmojiListEditor
					items={project.categories}
					fallbackEmoji="📦"
					{onUpdate}
					onRemove={(id) => removeCategory(handle, id)}
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
