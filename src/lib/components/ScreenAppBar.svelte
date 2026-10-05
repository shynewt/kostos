<script lang="ts">
	import SyncStatus from './SyncStatus.svelte';
	import SyncBanner from './SyncBanner.svelte';
	import { PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import type { Project } from '$lib/types';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		backHref?: string;
		onCancel?: () => void;
		project?: Project | null;
		right?: Snippet;
	};

	let { title, backHref, onCancel, project, right }: Props = $props();
</script>

<header class="app-bar">
	<div class="row gap-8 left-side">
		{#if backHref}
			<a class="icon-btn" href={backHref} aria-label="Back">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6" /></svg>
			</a>
		{:else if onCancel}
			<button class="icon-btn" type="button" aria-label="Cancel" onclick={onCancel}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		{/if}
		{#if project}
			<span
				class="project-tile"
				style="background: {tileBackground(project.color)}; color: {PROJECT_COLOR_VALUES[project.color]};"
			>
				{project.emoji}
			</span>
		{/if}
	</div>
	<div class="title-wrap">
		<div class="app-bar-title">{title}</div>
		<SyncStatus variant="dot" />
	</div>
	<div class="row gap-6 right-side">
		{#if right}{@render right()}{/if}
	</div>
</header>
<SyncBanner />

<style>
	.left-side {
		flex: 1;
		align-items: center;
	}

	.title-wrap {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.right-side {
		flex: 1;
		justify-content: flex-end;
	}

	.project-tile {
		width: 28px;
		height: 28px;
		border-radius: 9px;
		display: grid;
		place-items: center;
		font-size: 14px;
		flex-shrink: 0;
	}
</style>
