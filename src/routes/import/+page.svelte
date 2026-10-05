<script lang="ts">
	import { goto } from '$app/navigation';
	import { currencyDecimals } from '$lib/currencies';
	import { isV1Export, mapV1ToV2, type ImportResult } from '$lib/import/v1';
	import { addProject } from '$lib/storage';
	import { addExpense, initProject, openRoom } from '$lib/sync/doc';
	import { generateRoomId, generateSecret } from '$lib/token';

	let fileInputEl = $state<HTMLInputElement | null>(null);
	let parsed = $state<ImportResult | null>(null);
	let error = $state<string | null>(null);
	let fileName = $state<string | null>(null);
	let busy = $state(false);
	let dragOver = $state(false);

	async function handleFile(file: File): Promise<void> {
		error = null;
		parsed = null;
		fileName = file.name;
		try {
			const text = await file.text();
			const raw = JSON.parse(text) as unknown;
			if (!isV1Export(raw)) {
				error = 'That JSON does not look like a Kostos v1 export.';
				return;
			}
			parsed = mapV1ToV2(raw);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			error = `Could not parse JSON: ${message}`;
		}
	}

	function onFileChosen(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) handleFile(file);
	}

	function onDrop(event: DragEvent): void {
		event.preventDefault();
		dragOver = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) handleFile(file);
	}

	function onDragOver(event: DragEvent): void {
		event.preventDefault();
		dragOver = true;
	}

	function onDragLeave(): void {
		dragOver = false;
	}

	function reset(): void {
		parsed = null;
		error = null;
		fileName = null;
		if (fileInputEl) fileInputEl.value = '';
	}

	async function confirmImport(): Promise<void> {
		if (!parsed || busy) return;
		busy = true;
		try {
			const roomId = generateRoomId();
			const secret = generateSecret();
			const handle = openRoom(roomId, secret);
			await handle.ready;

			// Tag the project header with the freshly minted roomId so v2 keys match.
			initProject(handle, { ...parsed.project, id: roomId }, parsed.members);
			for (const e of parsed.expenses) addExpense(handle, e);

			addProject({
				roomId,
				secret,
				name: parsed.project.name,
				emoji: parsed.project.emoji,
				color: parsed.project.color,
				lastActiveAt: Date.now()
			});

			await handle.persistence?.flush();
		await goto(`/p/${roomId}`);
		} catch (err) {
			busy = false;
			const message = err instanceof Error ? err.message : String(err);
			error = `Import failed: ${message}`;
		}
	}

	function formatAmount(cents: number, currency: string): string {
		const decimals = currencyDecimals(currency);
		const value = cents / 10 ** decimals;
		try {
			return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
		} catch {
			return `${value} ${currency}`;
		}
	}

	function formatDate(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Import from v1 · Kostos</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="screen" data-page="import">
	<header class="app-bar">
		<div class="row gap-8" style="flex: 1;">
			<a class="icon-btn" href="/" aria-label="Cancel">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</a>
		</div>
		<div class="app-bar-title">Import from v1</div>
		<div class="row gap-6" style="flex: 1;"></div>
	</header>

	<div class="scroll import-scroll">
		<p class="lede">
			Drop a Kostos v1 export JSON here. We'll create a fresh v2 project with the same
			members, categories, payment methods, and expenses, then open it.
		</p>

		{#if !parsed}
			<button
				type="button"
				class="dropzone"
				class:on={dragOver}
				ondragover={onDragOver}
				ondragleave={onDragLeave}
				ondrop={onDrop}
				onclick={() => fileInputEl?.click()}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
					<path d="M12 3v12M7 8l5-5 5 5" />
					<path d="M5 21h14a2 2 0 0 0 2-2v-4M3 15v4a2 2 0 0 0 2 2" />
				</svg>
				<div class="col">
					<span class="dz-title">Drop JSON here or click to choose</span>
					<span class="dim mono dz-hint">KOSTOS V1 EXPORT · .JSON</span>
				</div>
			</button>
			<input
				bind:this={fileInputEl}
				type="file"
				accept="application/json,.json"
				class="hidden-input"
				onchange={onFileChosen}
			/>
		{:else}
			<section class="card preview-card">
				<div class="eyebrow">Ready to import</div>
				<div class="h2 project-name">{parsed.project.name}</div>
				<div class="dim mono preview-meta">
					{parsed.project.currency} · {parsed.stats.memberCount} members · {parsed.stats.expenseCount} expenses
				</div>

				<div class="stats-row">
					<div class="stat">
						<span class="stat-label">Total</span>
						<span class="stat-value">{formatAmount(parsed.stats.totalCents, parsed.project.currency)}</span>
					</div>
					{#if parsed.stats.dateRange}
						<div class="stat">
							<span class="stat-label">Range</span>
							<span class="stat-value">
								{formatDate(parsed.stats.dateRange.from)} – {formatDate(parsed.stats.dateRange.to)}
							</span>
						</div>
					{/if}
				</div>

				<div class="lists">
					<div class="col">
						<div class="eyebrow eyebrow-tight">Members</div>
						<ul class="chip-list">
							{#each parsed.members as m (m.id)}<li class="chip">{m.name}</li>{/each}
						</ul>
					</div>
					<div class="col">
						<div class="eyebrow eyebrow-tight">Categories</div>
						<ul class="chip-list">
							{#each parsed.project.categories as c (c.id)}
								<li class="chip">{c.emoji} {c.name}</li>
							{/each}
						</ul>
					</div>
					<div class="col">
						<div class="eyebrow eyebrow-tight">Payment methods</div>
						<ul class="chip-list">
							{#each parsed.project.paymentMethods as m (m.id)}
								<li class="chip">{m.emoji} {m.name}</li>
							{/each}
						</ul>
					</div>
				</div>

				{#if parsed.warnings.length > 0}
					<div class="warnings">
						<div class="eyebrow eyebrow-tight">Warnings</div>
						<ul>
							{#each parsed.warnings as w}<li>{w}</li>{/each}
						</ul>
					</div>
				{/if}
			</section>

			<div class="row gap-8 actions">
				<button type="button" class="btn" onclick={reset} disabled={busy}>Choose another</button>
				<button
					type="button"
					class="btn btn-primary"
					onclick={confirmImport}
					disabled={busy || parsed.stats.expenseCount === 0}
				>
					{busy ? 'Creating…' : 'Create v2 project'}
				</button>
			</div>
		{/if}

		{#if error}
			<div class="error" role="alert">{error}</div>
		{/if}

		{#if fileName && !error && !parsed}
			<p class="dim mono file-name">{fileName}</p>
		{/if}
	</div>
</div>

<style>
	.import-scroll {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 8px;
	}

	.lede {
		font-size: 13px;
		color: var(--ink-2);
		margin: 0;
		line-height: 1.5;
	}

	.dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 36px 18px;
		border: 1.5px dashed var(--line-2);
		border-radius: 18px;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
		font: inherit;
		transition: border-color 0.12s ease, background 0.12s ease;
	}

	.dropzone:hover,
	.dropzone.on {
		border-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 6%, transparent);
	}

	.dropzone svg {
		width: 30px;
		height: 30px;
		color: var(--ink-3);
	}

	.dz-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
	}

	.dz-hint {
		font-size: 11px;
		margin-top: 2px;
	}

	.hidden-input {
		display: none;
	}

	.preview-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.project-name {
		margin: 0;
	}

	.preview-meta {
		font-size: 11px;
	}

	.stats-row {
		display: flex;
		gap: 18px;
		margin-top: 4px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat-label {
		font-size: 10px;
		color: var(--ink-3);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.stat-value {
		font-size: 13px;
		font-weight: 600;
	}

	.lists {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 6px;
	}

	.eyebrow-tight {
		margin-bottom: 4px;
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.chip {
		font-size: 12px;
		padding: 4px 8px;
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		border-radius: 999px;
	}

	.warnings {
		margin-top: 8px;
		padding: 10px 12px;
		border-radius: 12px;
		background: color-mix(in oklab, #f59e0b 14%, transparent);
		font-size: 12px;
	}

	.warnings ul {
		margin: 4px 0 0;
		padding-left: 18px;
	}

	.actions {
		justify-content: flex-end;
	}

	.error {
		padding: 10px 12px;
		border-radius: 12px;
		background: color-mix(in oklab, #ef4444 16%, transparent);
		color: var(--ink);
		font-size: 13px;
	}

	.file-name {
		font-size: 11px;
		margin: 0;
		text-align: center;
	}
</style>
