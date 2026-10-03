<script lang="ts">
	import { version } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PROJECT_COLORS, PROJECT_COLOR_VALUES } from '$lib/colors';
	import CurrencyPicker from '$lib/components/CurrencyPicker.svelte';
	import EmojiListEditor from '$lib/components/EmojiListEditor.svelte';
	import type { EditorItem } from '$lib/components/EmojiListEditor.svelte';
	import EmojiTilePicker from '$lib/components/EmojiTilePicker.svelte';
	import IdentityCard from '$lib/components/IdentityCard.svelte';
	import ScreenAppBar from '$lib/components/ScreenAppBar.svelte';
	import { getCurrentMember, removeProject, setCurrentMember } from '$lib/storage';
	import {
		addCategory,
		addPaymentMethod,
		generateId,
		removeCategory,
		removePaymentMethod,
		updateCategory,
		updatePaymentMethod,
		updateProject
	} from '$lib/sync/doc';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import { serializeProject, toCSV } from '$lib/io/projectArchive';
	import type { Category, PaymentMethodItem, ProjectColor } from '$lib/types';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const members = $derived(room.members);

	let signingOut = $state(false);
	let switchingMember = $state(false);

	const currentMemberId = $derived.by(() => getCurrentMember(roomId));
	const currentMember = $derived(
		currentMemberId ? members.find((m) => m.id === currentMemberId) : null
	);

	function commitName(value: string) {
		const trimmed = value.trim();
		if (!project || !trimmed || trimmed === project.name) return;
		updateProject(handle, { name: trimmed });
	}

	function commitDescription(value: string) {
		if (!project) return;
		const trimmed = value.trim();
		if (trimmed === (project.description ?? '')) return;
		updateProject(handle, { description: trimmed });
	}

	function setColor(color: ProjectColor) {
		if (!project || project.color === color) return;
		updateProject(handle, { color });
	}

	function pickCurrency(p: { code: string; sym: string }) {
		if (expenses.length > 0) return;
		updateProject(handle, { currency: p.code, currencySymbol: p.sym });
	}

	function customCurrency(sym: string) {
		if (expenses.length > 0) return;
		updateProject(handle, { currency: '—', currencySymbol: sym });
	}

	function toggleAutoFetch() {
		if (!project) return;
		updateProject(handle, { autoFetchRates: !(project.autoFetchRates ?? true) });
	}

	function onAddCategory(input: Omit<EditorItem, 'id'>) {
		const cat: Category = { id: generateId(), name: input.name, emoji: input.emoji };
		addCategory(handle, cat);
	}

	function onUpdateCategory(id: string, updates: Partial<Omit<EditorItem, 'id'>>) {
		updateCategory(handle, id, updates);
	}

	function onRemoveCategory(id: string) {
		removeCategory(handle, id);
	}

	function onAddMethod(input: Omit<EditorItem, 'id'>) {
		const m: PaymentMethodItem = { id: generateId(), name: input.name, emoji: input.emoji };
		addPaymentMethod(handle, m);
	}

	function onUpdateMethod(id: string, updates: Partial<Omit<EditorItem, 'id'>>) {
		updatePaymentMethod(handle, id, updates);
	}

	function onRemoveMethod(id: string) {
		removePaymentMethod(handle, id);
	}

	function signOut() {
		if (signingOut) return;
		signingOut = true;
		removeProject(roomId);
		goto('/', { replaceState: true });
	}

	function pickMember(id: string) {
		setCurrentMember(roomId, id);
		// Force a reload so every $derived(getCurrentMember(roomId)) re-evaluates;
		// localStorage reads aren't tracked by Svelte's runtime.
		window.location.href = `/p/${roomId}`;
	}

	const expenses = $derived(room.expenses);

	function downloadFile(name: string, mime: string, contents: string) {
		const blob = new Blob([contents], { type: mime });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		document.body.appendChild(link);
		link.click();
		link.remove();
		// Revoke after the click finishes so Safari has time to start the download.
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function slug(value: string): string {
		const cleaned = value
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-');
		return cleaned || 'project';
	}

	function exportJson() {
		if (!project) return;
		const archive = serializeProject(project, members, expenses);
		const date = new Date().toISOString().slice(0, 10);
		downloadFile(
			`kostos-${slug(project.name)}-${date}.json`,
			'application/json',
			JSON.stringify(archive, null, 2)
		);
	}

	function exportCsv() {
		if (!project) return;
		const csv = toCSV(project, members, expenses);
		const date = new Date().toISOString().slice(0, 10);
		downloadFile(`kostos-${slug(project.name)}-${date}.csv`, 'text/csv', csv);
	}
</script>

<svelte:head>
	<title>Settings · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="settings">
	<ScreenAppBar title="Settings" backHref="/p/{roomId}" />

	{#if project}
		<div class="scroll">
			<section class="project-block">
				<EmojiTilePicker
					emoji={project.emoji}
					color={project.color}
					onPick={(value) => updateProject(handle, { emoji: value })}
				/>

				<div class="swatch-row" role="radiogroup" aria-label="Project color">
					{#each PROJECT_COLORS as c (c)}
						<button
							type="button"
							class="swatch"
							class:on={project.color === c}
							role="radio"
							aria-checked={project.color === c}
							aria-label={c}
							style="--swatch: {PROJECT_COLOR_VALUES[c]};"
							onclick={() => setColor(c)}
						></button>
					{/each}
				</div>

				<input
					class="input project-name"
					value={project.name}
					placeholder="Group name"
					onblur={(e) => commitName(e.currentTarget.value)}
				/>
				<input
					class="input project-description"
					value={project.description ?? ''}
					placeholder="Description (optional)"
					onblur={(e) => commitDescription(e.currentTarget.value)}
				/>
			</section>

			<div class="section-head">
				<div class="eyebrow">Joined as</div>
				{#if currentMember}
					<button
						type="button"
						class="btn btn-ghost switch-btn"
						aria-expanded={switchingMember}
						onclick={() => (switchingMember = !switchingMember)}
					>
						{switchingMember ? 'Cancel' : 'Switch'}
					</button>
				{/if}
			</div>
			<IdentityCard
				current={currentMember ?? null}
				{members}
				expanded={switchingMember}
				onPick={pickMember}
			/>

			<div class="section-head">
				<div class="eyebrow">Currency</div>
			</div>
			<div class="card field-card">
				<CurrencyPicker
					code={project.currency}
					symbol={project.currencySymbol}
					locked={expenses.length > 0}
					describedBy="currency-locked-note"
					onSelect={pickCurrency}
					onCustom={customCurrency}
				/>
			</div>
			{#if expenses.length > 0}
				<p class="dim currency-locked" id="currency-locked-note">
					Fixed once the group has expenses: their exchange rates convert into this currency, so
					switching would misread every one of them.
				</p>
			{/if}
			<button
				type="button"
				class="card field-card rate-toggle"
				onclick={toggleAutoFetch}
				aria-pressed={project.autoFetchRates ?? true}
			>
				<span class="col rate-toggle-text">
					<span class="rate-toggle-title">Auto-fetch exchange rates</span>
					<span class="dim rate-toggle-sub">
						Look up a live rate for foreign-currency expenses. Off keeps every rate manual and
						avoids the outbound request.
					</span>
				</span>
				<span class="rate-switch" data-on={project.autoFetchRates ?? true}>
					<span class="rate-knob"></span>
				</span>
			</button>

			<div class="section-head">
				<div class="eyebrow">Categories</div>
				<span class="dim mono section-count">{project.categories.length}</span>
			</div>
			<div class="card editor-card">
				<EmojiListEditor
					items={project.categories}
					fallbackEmoji="📦"
					onUpdate={onUpdateCategory}
					onRemove={onRemoveCategory}
					onAdd={onAddCategory}
				/>
			</div>

			<div class="section-head">
				<div class="eyebrow">Payment methods</div>
				<span class="dim mono section-count">{project.paymentMethods.length}</span>
			</div>
			<div class="card editor-card">
				<EmojiListEditor
					items={project.paymentMethods}
					fallbackEmoji="💳"
					onUpdate={onUpdateMethod}
					onRemove={onRemoveMethod}
					onAdd={onAddMethod}
				/>
			</div>

			<div class="section-head">
				<div class="eyebrow">Members</div>
				<span class="dim mono section-count">{members.length}</span>
			</div>
			<a class="card nav-row" href="/p/{roomId}/people">
				<span class="nav-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
						<circle cx="9" cy="7" r="4" />
						<path d="M22 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75" />
					</svg>
				</span>
				<span class="nav-title">Manage members</span>
				<span class="nav-chevron" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 6l6 6-6 6" /></svg>
				</span>
			</a>

			<div class="section-head">
				<div class="eyebrow">Trips</div>
				<span class="dim mono section-count">{project.trips.length}</span>
			</div>
			<a class="card nav-row" href="/p/{roomId}/settings/trips">
				<span class="nav-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
						<path d="M9 3v15M15 6v15" />
					</svg>
				</span>
				<span class="nav-title">Manage trips</span>
				<span class="nav-chevron" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 6l6 6-6 6" /></svg>
				</span>
			</a>

			<div class="section-head">
				<div class="eyebrow">Data</div>
				<span class="dim mono section-count">{expenses.length} expenses</span>
			</div>
			<div class="card data-card">
				<button type="button" class="data-row" onclick={exportJson}>
					<span class="data-icon">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
							<path d="M14 3v5h5M12 12v6M9 15l3 3 3-3" />
						</svg>
					</span>
					<span class="col data-text">
						<span class="data-title">Export backup (JSON)</span>
						<span class="data-sub">Full lossless copy. Restore from "New project".</span>
					</span>
				</button>
				<hr class="hairline" />
				<button type="button" class="data-row" onclick={exportCsv}>
					<span class="data-icon">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
							<rect x="4" y="4" width="16" height="16" rx="2" />
							<path d="M4 10h16M10 4v16M16 4v16" />
						</svg>
					</span>
					<span class="col data-text">
						<span class="data-title">Export spreadsheet (CSV)</span>
						<span class="data-sub">One row per expense. For Numbers, Excel, Sheets.</span>
					</span>
				</button>
			</div>

			<button class="btn btn-block sign-out-btn" type="button" onclick={signOut} disabled={signingOut}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 7V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2M4 12h11M11 8l-3 4 3 4" /></svg>
				<span>Forget this project on this device</span>
			</button>
			<p class="dim sign-out-hint">
				Your data stays in the group. Joining again with the token restores everything.
			</p>
			<p class="dim version-line">Kostos v{version}</p>
		</div>
	{:else}
		<div class="scroll empty-screen">
			<div class="card">
				<p class="muted">Loading…</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.project-block {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 12px;
		padding: 16px 0 18px;
	}

	.swatch-row {
		display: flex;
		justify-content: center;
		gap: 10px;
	}

	.swatch {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		background: var(--swatch);
		border: 2px solid transparent;
		cursor: pointer;
		padding: 0;
		transition: transform 0.12s ease;
	}

	.swatch:hover {
		transform: scale(1.08);
	}

	.swatch.on {
		border-color: var(--ink);
		box-shadow: 0 0 0 2px var(--bg);
	}

	.project-name {
		font-size: 17px;
		font-weight: 600;
		text-align: center;
		padding: 14px;
	}

	.project-description {
		font-size: 13px;
		text-align: center;
		padding: 12px;
		color: var(--ink-2);
	}

	.section-count {
		font-size: 11px;
	}

	.field-card {
		padding: 4px;
	}

	.rate-toggle {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 14px;
		margin-top: 8px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		text-align: left;
		cursor: pointer;
		color: inherit;
		font: inherit;
	}

	.rate-toggle-text {
		flex: 1;
		gap: 4px;
	}

	.rate-toggle-title {
		font-size: 14px;
		font-weight: 600;
	}

	.currency-locked {
		font-size: 11px;
		line-height: 1.5;
		margin: 8px 4px 0;
	}

	.rate-toggle-sub {
		font-size: 11px;
		line-height: 1.5;
	}

	.rate-switch {
		flex-shrink: 0;
		width: 42px;
		height: 24px;
		border-radius: 999px;
		background: var(--line-2);
		position: relative;
		transition: background 0.15s ease;
	}

	.rate-switch[data-on='true'] {
		background: var(--accent);
	}

	.rate-knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 999px;
		background: var(--bg);
		transition: transform 0.15s ease;
	}

	.rate-switch[data-on='true'] .rate-knob {
		transform: translateX(18px);
	}

	.switch-btn {
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 999px;
		color: var(--accent);
	}

	.editor-card {
		padding: 10px 14px;
	}

	.nav-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
		text-decoration: none;
		color: inherit;
	}

	.nav-row:active {
		background: color-mix(in oklab, var(--accent) 12%, transparent);
	}

	.nav-icon {
		display: inline-flex;
		width: 28px;
		height: 28px;
		align-items: center;
		justify-content: center;
		color: var(--ink-2);
		flex-shrink: 0;
	}

	.nav-icon svg {
		width: 20px;
		height: 20px;
	}

	.nav-title {
		flex: 1;
		font-size: 14px;
		font-weight: 500;
	}

	.nav-chevron {
		color: var(--ink-3);
	}

	.nav-chevron svg {
		width: 18px;
		height: 18px;
	}

	.data-card {
		padding: 0;
	}

	.data-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 14px;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.data-row:active {
		background: color-mix(in oklab, var(--accent) 12%, transparent);
	}

	.data-icon {
		display: inline-flex;
		width: 28px;
		height: 28px;
		align-items: center;
		justify-content: center;
		color: var(--ink-2);
		flex-shrink: 0;
	}

	.data-icon svg {
		width: 20px;
		height: 20px;
	}

	.data-text {
		flex: 1;
		align-items: flex-start;
		gap: 2px;
	}

	.data-title {
		font-size: 14px;
		font-weight: 500;
	}

	.data-sub {
		font-size: 11px;
		color: var(--ink-3);
	}

	.sign-out-btn {
		margin-top: 24px;
		color: var(--owe);
		border-color: color-mix(in oklab, var(--owe) 30%, var(--line));
	}

	.sign-out-btn svg {
		width: 18px;
		height: 18px;
	}

	.sign-out-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sign-out-hint {
		font-size: 11px;
		font-family: var(--font-mono);
		text-align: center;
		margin: 8px 0 0;
		line-height: 1.5;
	}

	.version-line {
		font-size: 10px;
		font-family: var(--font-mono);
		text-align: center;
		margin: 18px 0 0;
		color: var(--ink-3);
	}

	.empty-screen {
		padding-top: 24px;
	}
</style>
