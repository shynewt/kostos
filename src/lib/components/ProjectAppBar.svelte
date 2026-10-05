<script lang="ts">
	import SyncBanner from './SyncBanner.svelte';
	import SyncStatus from './SyncStatus.svelte';
	import { PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import { findProject } from '$lib/storage';
	import type { Project } from '$lib/types';
	import QrCode from './QrCode.svelte';

	type Props = {
		roomId: string;
		project: Project | null;
	};

	let { roomId, project }: Props = $props();

	let showShare = $state(false);
	let copied = $state(false);

	const shareUrl = $derived.by(() => {
		const stored = findProject(roomId);
		if (!stored) return null;
		return `${location.origin}/join?room=${encodeURIComponent(roomId)}#${stored.secret}`;
	});

	async function copyShareUrl() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			const el = document.getElementById('share-url-display');
			if (el instanceof HTMLInputElement) el.select();
		}
	}
</script>

<header class="app-bar">
	<div class="project-head">
		<a class="project-tile-link" href="/" tabindex="-1" aria-hidden="true">
			<span
				class="project-tile"
				style={project
					? `background: ${tileBackground(project.color)}; color: ${PROJECT_COLOR_VALUES[project.color]};`
					: ''}
			>
				{project?.emoji ?? '🏖'}
			</span>
		</a>
		<a class="app-bar-title project-name" href="/" aria-label="Switch group" title="Switch group">
			{project?.name ?? 'Loading'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="switch-chevron" aria-hidden="true">
				<path d="M6 9l6 6 6-6" />
			</svg>
		</a>
		<div class="project-status"><SyncStatus /></div>
	</div>
	<div class="row gap-6" style="flex: 0; justify-content: flex-end;">
		<button
			class="icon-btn"
			aria-label="Share invite"
			aria-expanded={showShare}
			onclick={() => (showShare = !showShare)}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v12M8 8l4-4 4 4M5 14v5h14v-5" /></svg>
		</button>
		<a
			class="icon-btn"
			href="/p/{roomId}/settings"
			aria-label="Project settings"
			title="Project settings"
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
				<circle cx="12" cy="12" r="2.6" />
				<path d="M19 12a7 7 0 0 0-.16-1.5l2.05-1.58-2-3.46-2.43.83a7 7 0 0 0-2.59-1.5L13.5 2h-3l-.37 2.79a7 7 0 0 0-2.59 1.5l-2.43-.83-2 3.46L5.16 10.5A7 7 0 0 0 5 12a7 7 0 0 0 .16 1.5l-2.05 1.58 2 3.46 2.43-.83a7 7 0 0 0 2.59 1.5L10.5 22h3l.37-2.79a7 7 0 0 0 2.59-1.5l2.43.83 2-3.46-2.05-1.58A7 7 0 0 0 19 12z" />
			</svg>
		</a>
	</div>
</header>
<SyncBanner conflicts />

{#if showShare}
	<section class="card share-card">
		<div class="row between" style="margin-bottom: 10px;">
			<span class="eyebrow">Invite token</span>
			<button class="btn btn-ghost copy-btn" type="button" onclick={copyShareUrl} disabled={!shareUrl}>
				{#if copied}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
					<span>Copied</span>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 4H6a2 2 0 0 0-2 2v10" /></svg>
					<span>Copy link</span>
				{/if}
			</button>
		</div>
		<span class="token-pill">{roomId}</span>
		{#if shareUrl}
			<div class="qr-wrap">
				<QrCode value={shareUrl} size={200} />
				<p class="dim mono qr-caption">SCAN TO JOIN</p>
			</div>
			<input id="share-url-display" class="share-url-display" value={shareUrl} readonly />
		{/if}
		<p class="dim share-hint">
			Anyone with this link joins instantly; the secret lives in the URL fragment so the server never sees it.
		</p>
	</section>
{/if}

<style>
	.project-head {
		flex: 1;
		min-width: 0;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: auto auto;
		column-gap: 10px;
		align-items: center;
	}

	.project-tile-link {
		grid-row: 1 / span 2;
		display: block;
		text-decoration: none;
	}

	.project-tile {
		width: 36px;
		height: 36px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		font-size: 22px;
		flex-shrink: 0;
	}

	.project-name {
		font-family: var(--font-sans);
		font-size: 14px;
		text-transform: none;
		letter-spacing: 0;
		color: var(--ink);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		align-self: end;
		justify-self: start;
		gap: 4px;
		max-width: 100%;
		min-width: 0;
	}

	.switch-chevron {
		width: 12px;
		height: 12px;
		color: var(--ink-3);
		flex-shrink: 0;
	}

	.project-status {
		display: flex;
		min-width: 0;
		align-self: start;
		margin-top: 1px;
	}

	.share-card {
		display: flex;
		flex-direction: column;
		margin: 0 0 14px;
	}

	.copy-btn {
		padding: 6px 10px;
		font-size: 12px;
		gap: 6px;
		border-radius: 999px;
		color: var(--ink-2);
	}

	.copy-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.qr-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		margin: 16px auto 4px;
	}

	.qr-caption {
		font-size: 10px;
		letter-spacing: 0.08em;
		margin: 0;
	}

	.share-url-display {
		margin-top: 12px;
		width: 100%;
		background: transparent;
		border: 1px dashed var(--line-2);
		border-radius: var(--radius-sm);
		padding: 8px 10px;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-3);
		outline: none;
	}

	.share-hint {
		font-size: 11px;
		font-family: var(--font-mono);
		line-height: 1.5;
		margin: 10px 0 0;
	}
</style>
