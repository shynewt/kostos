<script lang="ts">
	import { goto } from '$app/navigation';
	import FormError from '$lib/components/FormError.svelte';
	import MemberPicker from '$lib/components/MemberPicker.svelte';
	import { parseProjectArchive, type ProjectArchive } from '$lib/io/projectArchive';
	import { archiveContents, createGroup } from '$lib/io/createGroup';

	let fileInput = $state<HTMLInputElement | null>(null);
	let archive = $state<ProjectArchive | null>(null);
	let fileName = $state<string>('');
	let parseError = $state<string | null>(null);
	let restoring = $state(false);
	let youMemberId = $state<string | null>(null);

	const canRestore = $derived(archive !== null && youMemberId !== null);

	async function handleFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		fileName = file.name;
		parseError = null;
		archive = null;
		youMemberId = null;

		const text = await file.text();
		const result = parseProjectArchive(text);
		if (!result.ok) {
			parseError = result.error;
			input.value = '';
			return;
		}
		archive = result.archive;
		// Preselect the first member so the user can hit Restore quickly if they're alone.
		youMemberId = result.archive.members[0]?.id ?? null;
	}

	function reset() {
		archive = null;
		fileName = '';
		parseError = null;
		youMemberId = null;
		if (fileInput) fileInput.value = '';
	}

	async function onRestore() {
		if (!archive || !youMemberId || restoring) return;
		restoring = true;
		parseError = null;
		try {
			const roomId = await createGroup(archiveContents(archive), youMemberId);
			await goto(`/p/${roomId}`);
		} catch (error) {
			parseError = error instanceof Error ? error.message : 'Could not save the group on this device';
		} finally { restoring = false; }
	}

	function exportDateRange(a: ProjectArchive): string {
		if (a.expenses.length === 0) return 'no expenses yet';
		const dates = a.expenses.map((e) => e.date);
		const oldest = Math.min(...dates);
		const newest = Math.max(...dates);
		const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
		return oldest === newest ? fmt(oldest) : `${fmt(oldest)} → ${fmt(newest)}`;
	}
</script>

<svelte:head>
	<title>Restore from backup · Kostos</title>
</svelte:head>

<div class="screen" data-page="restore">
	<header class="app-bar">
		<div class="row gap-8" style="flex: 1;">
			<button class="icon-btn" aria-label="Cancel" onclick={() => goto('/new')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>
		<div class="app-bar-title">Restore from backup</div>
		<div style="flex: 1;"></div>
	</header>

	<div class="scroll" style="padding-top: 8px;">
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			class="hidden-input"
			onchange={handleFile}
		/>

		{#if !archive}
			<div class="card pick-card">
				<div class="pick-emoji">📦</div>
				<h2 class="pick-title">Pick a Kostos backup file</h2>
				<p class="pick-sub">
					A JSON backup file exported from a group's Settings. Restoring it creates a new group on
					this device with the members and expenses it holds.
				</p>
				<button type="button" class="btn btn-primary pick-btn" onclick={() => fileInput?.click()}>
					Choose file
				</button>
				{#if parseError}<FormError message={parseError} />{/if}
				{#if fileName && !parseError}
					<p class="dim file-hint">{fileName}</p>
				{/if}
			</div>
		{:else}
			<div class="preview-block">
				<div class="preview-tile" style="background: color-mix(in oklab, var(--accent) 16%, var(--bg-2));">
					<span class="preview-emoji">{archive.project.emoji}</span>
				</div>
				<h2 class="preview-name">{archive.project.name}</h2>
				{#if archive.project.description}
					<p class="dim preview-desc">{archive.project.description}</p>
				{/if}
			</div>

			<div class="card stats-card">
				<div class="stat-row">
					<span class="stat-label">Members</span>
					<span class="stat-value mono">{archive.members.length}</span>
				</div>
				<hr class="hairline" />
				<div class="stat-row">
					<span class="stat-label">Expenses</span>
					<span class="stat-value mono">{archive.expenses.length}</span>
				</div>
				<hr class="hairline" />
				<div class="stat-row">
					<span class="stat-label">Date range</span>
					<span class="stat-value mono">{exportDateRange(archive)}</span>
				</div>
				<hr class="hairline" />
				<div class="stat-row">
					<span class="stat-label">Currency</span>
					<span class="stat-value mono">{archive.project.currencySymbol} {archive.project.currency}</span>
				</div>
			</div>

			<div class="section-head">
				<div class="eyebrow">Which member are you?</div>
			</div>
			<MemberPicker members={archive.members} bind:selectedId={youMemberId} />

			{#if parseError}<FormError message={parseError} />{/if}
			<button
				type="button"
				class="btn btn-primary btn-block submit-btn"
				disabled={!canRestore || restoring}
				onclick={onRestore}
			>
				{restoring ? 'Restoring…' : 'Restore on this device'}
			</button>
			<button type="button" class="btn btn-block reset-btn" onclick={reset} disabled={restoring}>
				Pick a different file
			</button>
		{/if}
	</div>
</div>

<style>
	.hidden-input {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.pick-card {
		text-align: center;
		padding: 28px 20px;
		margin-top: 24px;
	}

	.pick-emoji {
		font-size: 40px;
		margin-bottom: 8px;
	}

	.pick-title {
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 8px;
	}

	.pick-sub {
		font-size: 13px;
		color: var(--ink-2);
		line-height: 1.5;
		margin: 0 0 20px;
	}

	.pick-btn {
		padding: 12px 24px;
	}

	.file-hint {
		font-size: 11px;
		font-family: var(--font-mono);
		margin: 12px 0 0;
	}

	.preview-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px 0 18px;
	}

	.preview-tile {
		width: 72px;
		height: 72px;
		border-radius: 18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.preview-emoji {
		font-size: 38px;
	}

	.preview-name {
		font-size: 20px;
		font-weight: 600;
		margin: 4px 0 0;
	}

	.preview-desc {
		font-size: 13px;
		text-align: center;
		margin: 0;
	}

	.stats-card {
		padding: 0;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 14px;
	}

	.stat-label {
		font-size: 13px;
		color: var(--ink-2);
	}

	.stat-value {
		font-size: 13px;
		font-weight: 500;
	}

	.submit-btn {
		margin-top: 22px;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.reset-btn {
		margin-top: 10px;
		color: var(--ink-2);
	}
</style>
