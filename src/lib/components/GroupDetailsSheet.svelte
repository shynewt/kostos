<script lang="ts">
	import { untrack } from 'svelte';
	import BottomSheet from './BottomSheet.svelte';
	import EmojiTilePicker from './EmojiTilePicker.svelte';
	import { PROJECT_COLORS, PROJECT_COLOR_VALUES } from '$lib/colors';
	import type { Project, ProjectColor } from '$lib/types';

	type Props = {
		project: Project;
		onUpdate: (updates: Partial<Pick<Project, 'name' | 'description' | 'emoji' | 'color'>>) => void;
		onclose: () => void;
	};

	let { project, onUpdate, onclose }: Props = $props();

	let draftName = $state(untrack(() => project.name));
	let draftDescription = $state(untrack(() => project.description ?? ''));

	// text is saved however the sheet closes (Done, backdrop or Escape), so nothing typed is lost
	function close() {
		const name = draftName.trim();
		const description = draftDescription.trim();
		const updates: Partial<Pick<Project, 'name' | 'description'>> = {};
		if (name && name !== project.name) updates.name = name;
		if (description !== (project.description ?? '')) updates.description = description;
		if (Object.keys(updates).length > 0) onUpdate(updates);
		onclose();
	}

	function setColor(color: ProjectColor) {
		if (project.color !== color) onUpdate({ color });
	}
</script>

<BottomSheet title="Group details" onclose={close}>
	<div class="tile">
		<EmojiTilePicker emoji={project.emoji} color={project.color} onPick={(emoji) => onUpdate({ emoji })} />
	</div>

	<div class="swatch-row" role="radiogroup" aria-label="Group colour">
		{#each PROJECT_COLORS as color (color)}
			<button
				type="button"
				class="swatch"
				class:on={project.color === color}
				role="radio"
				aria-checked={project.color === color}
				aria-label={color}
				style="--swatch: {PROJECT_COLOR_VALUES[color]};"
				onclick={() => setColor(color)}
			></button>
		{/each}
	</div>

	<label class="field-label" for="group-name-input">Name</label>
	<input id="group-name-input" class="input field-input" bind:value={draftName} placeholder="Group name" autocomplete="off" />

	<label class="field-label" for="group-description-input">Description</label>
	<input
		id="group-description-input"
		class="input field-input"
		bind:value={draftDescription}
		placeholder="Optional, like dates or a place"
		autocomplete="off"
	/>

	<button type="button" class="btn btn-primary done" onclick={close}>Done</button>
</BottomSheet>

<style>
	.tile {
		margin-top: 18px;
	}

	.swatch-row {
		display: flex;
		justify-content: center;
		gap: 12px;
		margin: 20px 0 6px;
	}

	.swatch {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: var(--swatch);
		border: 0;
		padding: 0;
		cursor: pointer;
	}

	.swatch.on {
		box-shadow:
			0 0 0 2px var(--bg-2),
			0 0 0 4px var(--ink);
	}

	.swatch:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}

	.field-label {
		margin: 16px 4px 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-2);
	}

	.field-input {
		padding: 12px 14px;
		font-size: 16px;
	}

	.done {
		margin-top: 22px;
		padding: 14px;
		font-size: 15px;
	}
</style>
