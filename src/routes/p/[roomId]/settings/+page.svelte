<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pickMemberColor, pickMemberEmoji } from '$lib/avatar';
	import { computeBalances } from '$lib/balance';
	import { PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import { findCurrency } from '$lib/currencies';
	import { ANIMAL_EMOJIS } from '$lib/emojis';
	import AppearanceControls from '$lib/components/AppearanceControls.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import CurrencySheet from '$lib/components/CurrencySheet.svelte';
	import GroupDetailsSheet from '$lib/components/GroupDetailsSheet.svelte';
	import InviteSheet, { groupInviteUrl } from '$lib/components/InviteSheet.svelte';
	import MemberEmojiPicker from '$lib/components/MemberEmojiPicker.svelte';
	import MemberSheet from '$lib/components/MemberSheet.svelte';
	import ProjectAppBar from '$lib/components/ProjectAppBar.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';
	import SettingsRow from '$lib/components/SettingsRow.svelte';
	import SplitDefaultOptions from '$lib/components/SplitDefaultOptions.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import { backupFile, saveFile, spreadsheetFile } from '$lib/io/exportFiles';
	import { plural } from '$lib/plural';
	import { SPLIT_DEFAULT_LABELS } from '$lib/split-default';
	import { getCurrentMember, getTheme, removeProject, setCurrentMember } from '$lib/storage';
	import { addMember, DEMO_ROOM_ID, generateId, memberHistoryCount, removeMember, updateMember, updateProject } from '$lib/sync/doc';
	import { archiveRules } from '$lib/sync/recurring';
	import { useRoom } from '$lib/sync/useRoom.svelte';
	import type { SplitDefault } from '$lib/types';

	type Sheet = 'details' | 'add-member' | 'invite' | 'currency' | 'split' | 'appearance' | 'forget';

	const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' } as const;

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const handle = $derived(room.handle);
	const project = $derived(room.project);
	const members = $derived(room.members);
	const expenses = $derived(room.expenses);

	let openSheet = $state<Sheet | null>(null);
	let selectedMemberId = $state<string | null>(null);
	let avatarMemberId = $state<string | null>(null);
	let newMemberName = $state('');
	let lastAddedName = $state('');
	let signingOut = $state(false);
	let themeLabel = $state(THEME_LABELS[getTheme()]);

	// a local copy so claiming a member shows at once; localStorage reads aren't reactive
	let currentMemberId = $state<string | null>(null);
	$effect(() => {
		currentMemberId = getCurrentMember(roomId);
	});

	const inviteUrl = $derived(groupInviteUrl(roomId));
	const canOpenInvite = $derived(inviteUrl !== null || roomId === DEMO_ROOM_ID);
	const currencyLocked = $derived(expenses.length > 0);
	const autoFetchRates = $derived(project?.autoFetchRates ?? true);
	const paymentMethodsEnabled = $derived(project?.paymentMethodsEnabled ?? true);
	const splitDefault = $derived(project?.splitDefault ?? 'even');

	const currencyLabel = $derived.by(() => {
		if (!project) return '';
		if (project.currency === '—') return `Custom · ${project.currencySymbol}`;
		return `${project.currency} · ${findCurrency(project.currency)?.name ?? project.currency}`;
	});

	const selectedMember = $derived(members.find((m) => m.id === selectedMemberId) ?? null);
	const avatarMember = $derived(members.find((m) => m.id === avatarMemberId) ?? null);
	const selectedBalance = $derived.by(() => {
		if (!selectedMember) return 0;
		return computeBalances(members, expenses, room.currency).find((b) => b.memberId === selectedMember.id)?.net ?? 0;
	});

	function claimMember(memberId: string) {
		setCurrentMember(roomId, memberId);
		currentMemberId = memberId;
		selectedMemberId = null;
	}

	function removeSelectedMember() {
		if (!selectedMemberId) return;
		removeMember(handle, selectedMemberId);
		selectedMemberId = null;
	}

	function addNewMember(event: Event) {
		event.preventDefault();
		const name = newMemberName.trim();
		if (!name) return;
		addMember(handle, {
			id: generateId(),
			name,
			color: pickMemberColor(members),
			emoji: pickMemberEmoji(members),
			createdAt: Date.now()
		});
		lastAddedName = name;
		newMemberName = '';
	}

	function closeAddMember() {
		openSheet = null;
		newMemberName = '';
		lastAddedName = '';
	}

	function setAvatar(emoji: string) {
		if (!avatarMemberId) return;
		updateMember(handle, avatarMemberId, { emoji });
		avatarMemberId = null;
	}

	function pickCurrency(preset: { code: string; sym: string }) {
		if (currencyLocked) return;
		updateProject(handle, { currency: preset.code, currencySymbol: preset.sym });
	}

	function customCurrency(symbol: string) {
		if (currencyLocked) return;
		updateProject(handle, { currency: '—', currencySymbol: symbol });
	}

	function setSplitDefault(mode: SplitDefault) {
		if (splitDefault !== mode) updateProject(handle, { splitDefault: mode });
	}

	function closeAppearance() {
		openSheet = null;
		themeLabel = THEME_LABELS[getTheme()];
	}

	function exportCsv() {
		if (project) saveFile(spreadsheetFile(project, members, expenses));
	}

	function exportJson() {
		if (project) saveFile(backupFile(project, members, expenses, new Date(), archiveRules(handle)));
	}

	function forgetGroup() {
		if (signingOut) return;
		signingOut = true;
		removeProject(roomId);
		goto('/', { replaceState: true });
	}
</script>

<svelte:head>
	<title>Group · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="settings">
	<ProjectAppBar {roomId} {project} />

	{#if project}
		<div class="scroll">
			<section class="identity">
				<span
					class="identity-tile"
					aria-hidden="true"
					style="background: {tileBackground(project.color)}; color: {PROJECT_COLOR_VALUES[project.color]};"
				>
					{project.emoji}
				</span>
				<div class="identity-text">
					<h1 class="identity-name">{project.name}</h1>
					{#if project.description}
						<p class="identity-description">{project.description}</p>
					{/if}
				</div>
				<button type="button" class="identity-edit" aria-haspopup="dialog" onclick={() => (openSheet = 'details')}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4zM14 6l4 4" /></svg>
					<span>Edit details</span>
				</button>
			</section>

			<SettingsGroup heading="Members" count={members.length}>
				{#each members as member (member.id)}
					<SettingsRow
						title={member.name}
						detail={member.id === currentMemberId ? '(you)' : undefined}
						onopen={() => (selectedMemberId = member.id)}
					>
						{#snippet leading()}<Avatar {member} size="sm" />{/snippet}
					</SettingsRow>
				{/each}
				<SettingsRow title="Add member" onopen={() => (openSheet = 'add-member')}>
					{#snippet icon()}<path d="M12 5v14M5 12h14" />{/snippet}
				</SettingsRow>
				{#if canOpenInvite}
					<SettingsRow title="Invite people" onopen={() => (openSheet = 'invite')}>
						{#snippet icon()}<path d="M12 4v12M8 8l4-4 4 4M5 14v5h14v-5" />{/snippet}
					</SettingsRow>
				{/if}
			</SettingsGroup>

			<SettingsGroup
				heading="Expenses"
				footnoteId="currency-note"
				footnote={currencyLocked
					? 'The currency is locked once there are expenses, since their exchange rates depend on it. With rate fetching off, you type rates in and nothing is requested.'
					: 'With rate fetching off, you type rates in and nothing is requested.'}
			>
				{#if currencyLocked}
					<SettingsRow title="Currency" value={currencyLabel} describedBy="currency-note">
						{#snippet icon()}<circle cx="12" cy="12" r="9" /><path d="M14.8 9.2a3 3 0 0 0-2.8-1.7c-1.7 0-3 1-3 2.3s1.3 1.9 3 2.2 3 .9 3 2.2-1.3 2.3-3 2.3a3 3 0 0 1-2.8-1.7M12 5.5v13" />{/snippet}
					</SettingsRow>
				{:else}
					<SettingsRow title="Currency" value={currencyLabel} onopen={() => (openSheet = 'currency')}>
						{#snippet icon()}<circle cx="12" cy="12" r="9" /><path d="M14.8 9.2a3 3 0 0 0-2.8-1.7c-1.7 0-3 1-3 2.3s1.3 1.9 3 2.2 3 .9 3 2.2-1.3 2.3-3 2.3a3 3 0 0 1-2.8-1.7M12 5.5v13" />{/snippet}
					</SettingsRow>
				{/if}
				<SettingsRow
					title="Fetch exchange rates"
					checked={autoFetchRates}
					ontoggle={(on) => updateProject(handle, { autoFetchRates: on })}
				>
					{#snippet icon()}<path d="M4 8h13l-3-3M20 16H7l3 3" />{/snippet}
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup
				heading="New expenses"
				footnote={paymentMethodsEnabled
					? 'Each new expense asks how it was paid.'
					: 'The payment field is hidden. Tags already on expenses are kept.'}
			>
				<SettingsRow title="Default split" value={SPLIT_DEFAULT_LABELS[splitDefault]} onopen={() => (openSheet = 'split')}>
					{#snippet icon()}<path d="M12 4v16M6 7h12M4 11l2-4 2 4a2 2 0 1 1-4 0zM16 11l2-4 2 4a2 2 0 1 1-4 0z" />{/snippet}
				</SettingsRow>
				<SettingsRow
					title="Track payment methods"
					checked={paymentMethodsEnabled}
					ontoggle={(on) => updateProject(handle, { paymentMethodsEnabled: on })}
				>
					{#snippet icon()}<rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />{/snippet}
				</SettingsRow>
				{#if paymentMethodsEnabled}
					<SettingsRow title="Payment methods" value={String(project.paymentMethods.length)} href="/p/{roomId}/settings/payment-methods">
						{#snippet icon()}<path d="M5 7h14M5 12h14M5 17h9" />{/snippet}
					</SettingsRow>
				{/if}
			</SettingsGroup>

			<SettingsGroup heading="Organise">
				<SettingsRow title="Categories" value={String(project.categories.length)} href="/p/{roomId}/settings/categories">
					{#snippet icon()}<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" />{/snippet}
				</SettingsRow>
				<SettingsRow title="Trips" value={String(project.trips.length)} href="/p/{roomId}/settings/trips">
					{#snippet icon()}<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" />{/snippet}
				</SettingsRow>
				{#if room.repeating.length > 0}
					<SettingsRow title="Repeating expenses" value={String(room.repeating.length)} href="/p/{roomId}/settings/repeating">
						{#snippet icon()}<path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" />{/snippet}
					</SettingsRow>
				{/if}
			</SettingsGroup>

			<SettingsGroup
				heading="Your data"
				footnote="Both files cover all {plural(expenses.length, 'expense', 'expenses')}. To restore a backup, tap New group on the groups screen, then Restore it."
			>
				<SettingsRow title="Export spreadsheet (CSV)" onclick={exportCsv}>
					{#snippet icon()}<rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 4v16M16 4v16" />{/snippet}
				</SettingsRow>
				<SettingsRow title="Back up (JSON)" onclick={exportJson}>
					{#snippet icon()}<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 12v6M9 15l3 3 3-3" />{/snippet}
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup heading="This device">
				<SettingsRow title="Appearance" value={themeLabel} onopen={() => (openSheet = 'appearance')}>
					{#snippet icon()}<circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />{/snippet}
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup
				footnote={handle.legacy
					? 'This group can’t be rejoined, so forgetting it deletes its data here. Back it up first.'
					: 'Your data stays in the group. Rejoin with the invite link.'}
			>
				<SettingsRow title="Forget this group on this device" tone="danger" onclick={() => (openSheet = 'forget')}>
					{#snippet icon()}<path d="M9 7V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2M4 12h11M11 8l-3 4 3 4" />{/snippet}
				</SettingsRow>
			</SettingsGroup>
		</div>

		{#if openSheet === 'details'}
			<GroupDetailsSheet {project} onUpdate={(updates) => updateProject(handle, updates)} onclose={() => (openSheet = null)} />
		{:else if openSheet === 'add-member'}
			<BottomSheet title="Add member" onclose={closeAddMember}>
				<form class="sheet-form" onsubmit={addNewMember}>
					<label class="sheet-label" for="new-member-input">Name</label>
					<input
						id="new-member-input"
						class="input sheet-input"
						bind:value={newMemberName}
						placeholder="Like Dan"
						autocomplete="off"
					/>
					<p class="dim sheet-hint" role="status">
						{lastAddedName ? `Added ${lastAddedName}. Add another or close.` : 'They can pick their name later when they open the invite link.'}
					</p>
					<div class="sheet-actions">
						<button type="button" class="btn" onclick={closeAddMember}>{lastAddedName ? 'Done' : 'Cancel'}</button>
						<button type="submit" class="btn btn-primary" disabled={!newMemberName.trim()}>Add</button>
					</div>
				</form>
			</BottomSheet>
		{:else if openSheet === 'invite' && canOpenInvite}
			<InviteSheet url={inviteUrl} groupName={project.name} onclose={() => (openSheet = null)} />
		{:else if openSheet === 'currency'}
			<CurrencySheet code={project.currency} onSelect={pickCurrency} onCustom={customCurrency} onclose={() => (openSheet = null)} />
		{:else if openSheet === 'split'}
			<BottomSheet title="Default split" onclose={() => (openSheet = null)}>
				<SplitDefaultOptions
					mode={splitDefault}
					{members}
					{currentMemberId}
					onSetMode={setSplitDefault}
					onSetWeight={(memberId, splitWeight) => updateMember(handle, memberId, { splitWeight })}
				/>
				<p class="dim sheet-hint">Applies to new expenses. Each one can still be split another way.</p>
				<button type="button" class="btn btn-primary sheet-done" onclick={() => (openSheet = null)}>Done</button>
			</BottomSheet>
		{:else if openSheet === 'appearance'}
			<BottomSheet title="Appearance" onclose={closeAppearance}>
				<div class="appearance"><AppearanceControls /></div>
				<p class="dim sheet-hint">Only changes this device.</p>
			</BottomSheet>
		{:else if openSheet === 'forget'}
			<BottomSheet title="Forget this group?" onclose={() => (openSheet = null)}>
				<p class="sheet-body">
					{#if handle.legacy}
						{project.name} can’t be rejoined, so its data on this device is deleted. Back it up first if you need it.
					{:else}
						{project.name} disappears from this device. Your data stays in the group, and the invite link brings it back.
					{/if}
				</p>
				<div class="sheet-actions">
					<button type="button" class="btn" onclick={() => (openSheet = null)}>Cancel</button>
					<button type="button" class="btn btn-danger" disabled={signingOut} onclick={forgetGroup}>Forget group</button>
				</div>
			</BottomSheet>
		{/if}

		{#if selectedMember}
			<MemberSheet
				member={selectedMember}
				isYou={selectedMember.id === currentMemberId}
				historyCount={memberHistoryCount(handle, selectedMember.id)}
				balance={selectedBalance}
				currencySymbol={room.currencySymbol}
				currency={room.currency}
				onRename={(name) => updateMember(handle, selectedMember.id, { name })}
				onChangeAvatar={() => (avatarMemberId = selectedMember.id)}
				onClaim={() => claimMember(selectedMember.id)}
				onRemove={removeSelectedMember}
				onclose={() => (selectedMemberId = null)}
			/>
		{/if}

		<MemberEmojiPicker
			open={avatarMember !== null}
			current={avatarMember?.emoji}
			name={avatarMember?.name ?? ''}
			emojis={ANIMAL_EMOJIS}
			onPick={setAvatar}
			onClear={() => setAvatar('')}
			onClose={() => (avatarMemberId = null)}
		/>
	{/if}

	<TabBar {roomId} active="group" />
</div>

<style>
	.identity {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 14px 0 4px;
		text-align: center;
	}

	.identity-tile {
		width: 72px;
		height: 72px;
		border-radius: 22px;
		display: grid;
		place-items: center;
		font-size: 36px;
	}

	.identity-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-width: 100%;
	}

	.identity-name {
		margin: 4px 0 0;
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.2;
		overflow-wrap: anywhere;
		text-wrap: balance;
	}

	.identity-description {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	.identity-edit {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		border: 1px solid var(--line-2);
		border-radius: 999px;
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	/* the whole header opens the sheet, not just the small button */
	.identity-edit::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 22px;
	}

	.identity-edit svg {
		width: 14px;
		height: 14px;
	}

	.identity:has(.identity-edit:active) .identity-tile {
		transform: scale(0.97);
	}

	@media (hover: hover) {
		.identity-edit:hover {
			color: var(--ink);
			border-color: var(--ink-3);
		}
	}

	.sheet-form {
		display: flex;
		flex-direction: column;
		margin-top: 18px;
	}

	.sheet-label {
		margin: 0 4px 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-2);
	}

	.sheet-input {
		padding: 12px 14px;
		font-size: 16px;
	}

	.sheet-hint {
		margin: 10px 4px 0;
		font-size: 12px;
		line-height: 1.5;
	}

	.sheet-body {
		margin: 12px 0 0;
		font-size: 14px;
		line-height: 1.55;
		color: var(--ink-2);
		text-align: center;
		text-wrap: pretty;
	}

	.sheet-actions {
		display: flex;
		gap: 8px;
		margin-top: 18px;
	}

	.sheet-actions .btn {
		flex: 1;
		padding: 13px;
		font-size: 15px;
	}

	.sheet-actions .btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sheet-done {
		margin-top: 18px;
		padding: 14px;
		font-size: 15px;
	}

	.appearance {
		margin-top: 18px;
	}
</style>
