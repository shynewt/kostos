<script lang="ts">
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import { parseProjectArchive, type ProjectArchive } from '$lib/io/projectArchive';
	import { addProject, setCurrentMember } from '$lib/storage';
	import { addExpense, initProject, openRoom } from '$lib/sync/doc';
	import { generateRoomId, generateSecret } from '$lib/token';
	import type { Project } from '$lib/types';

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
			const roomId = generateRoomId();
			const secret = generateSecret();
			const a = archive;

			const project: Project = {
				id: roomId,
				name: a.project.name,
				description: a.project.description,
				emoji: a.project.emoji,
				color: a.project.color,
				currency: a.project.currency,
				currencySymbol: a.project.currencySymbol,
				defaultSplit: a.project.defaultSplit,
				autoFetchRates: a.project.autoFetchRates,
				paymentMethodsEnabled: a.project.paymentMethodsEnabled,
				categories: a.project.categories,
				paymentMethods: a.project.paymentMethods,
				trips: a.project.trips ?? [],
				createdAt: a.project.createdAt
			};

			const handle = openRoom(roomId, secret);
			await handle.ready;
			initProject(handle, project, a.members);

			// Seed expenses inside a single transaction so the IndexedDB write is one shot
			// and Yjs only fires observers once.
			handle.doc.transact(() => {
				for (const e of a.expenses) addExpense(handle, e);
			});

			addProject({
				roomId,
				secret,
				name: project.name,
				emoji: project.emoji,
				color: project.color,
				lastActiveAt: Date.now()
			});
			setCurrentMember(roomId, youMemberId);

			await handle.persistence?.flush();
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
					A JSON file exported from another project's Settings · Data section. This will create
					a new group on this device with all the imported data.
				</p>
				<button type="button" class="btn btn-primary pick-btn" onclick={() => fileInput?.click()}>
					Choose file
				</button>
				{#if parseError}
					<p class="error">{parseError}</p>
				{/if}
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
				<div class="eyebrow">Which member is you?</div>
			</div>
			<div class="card members-card">
				{#each archive.members as m, i (m.id)}
					{#if i > 0}<hr class="hairline" style="margin-left: 56px;" />{/if}
					<button
						type="button"
						class="member-row"
						class:on={youMemberId === m.id}
						onclick={() => (youMemberId = m.id)}
					>
						<Avatar member={m} size="sm" />
						<span class="member-name">{m.name}</span>
						{#if youMemberId === m.id}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="member-check">
								<path d="M5 12l5 5L20 7" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>

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

	.error {
		font-size: 12px;
		color: var(--owe);
		margin: 12px 0 0;
		line-height: 1.4;
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

	.members-card {
		padding: 4px;
	}

	.member-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}

	.member-name {
		flex: 1;
		font-size: 14px;
		font-weight: 500;
	}

	.member-row.on .member-name {
		color: var(--accent);
	}

	.member-check {
		width: 18px;
		height: 18px;
		color: var(--accent);
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
