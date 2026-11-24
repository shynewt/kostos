<script lang="ts">
	import Avatar from './Avatar.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import SettingsGroup from './SettingsGroup.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import { formatSigned } from '$lib/money';
	import type { Member } from '$lib/types';

	type Props = {
		member: Member;
		isYou: boolean;
		/** expenses the member created, paid or shares in */
		historyCount: number;
		balance: number;
		currencySymbol: string;
		currency: string;
		onRename: (name: string) => void;
		onChangeAvatar: () => void;
		onClaim: () => void;
		onRemove: () => void;
		onclose: () => void;
	};

	let {
		member,
		isYou,
		historyCount,
		balance,
		currencySymbol,
		currency,
		onRename,
		onChangeAvatar,
		onClaim,
		onRemove,
		onclose
	}: Props = $props();

	let step = $state<'actions' | 'rename' | 'remove'>('actions');
	let draftName = $state('');

	function startRename() {
		draftName = member.name;
		step = 'rename';
	}

	function commitRename(event: Event) {
		event.preventDefault();
		const name = draftName.trim();
		if (name && name !== member.name) onRename(name);
		step = 'actions';
	}

	function focusAndSelect(node: HTMLInputElement) {
		node.focus();
		node.select();
	}
</script>

<BottomSheet title={member.name} {onclose}>
	{#snippet icon()}<Avatar {member} size="lg" />{/snippet}
	{#if isYou}<p class="dim subtitle">That’s you on this device</p>{/if}

	{#if step === 'rename'}
		<form class="rename" onsubmit={commitRename}>
			<label class="field-label" for="member-rename-input">Name</label>
			<input
				id="member-rename-input"
				class="input rename-input"
				bind:value={draftName}
				autocomplete="off"
				use:focusAndSelect
			/>
			<div class="actions">
				<button type="button" class="btn" onclick={() => (step = 'actions')}>Cancel</button>
				<button type="submit" class="btn btn-primary" disabled={!draftName.trim()}>Save</button>
			</div>
		</form>
	{:else if step === 'remove'}
		<p class="warning">
			{#if historyCount > 0 || balance !== 0}
				<strong>{member.name}</strong> shows up in <strong>{historyCount}</strong>
				{historyCount === 1 ? 'expense' : 'expenses'}{balance !== 0
					? ` and has an open balance of ${formatSigned(balance, currencySymbol, currency)}`
					: ''}.
				Removing them keeps the history, but they can’t be added to new expenses.
			{:else}
				Remove <strong>{member.name}</strong> from the group?
			{/if}
		</p>
		<div class="actions">
			<button type="button" class="btn" onclick={() => (step = 'actions')}>Cancel</button>
			<button type="button" class="btn btn-danger" onclick={onRemove}>Remove</button>
		</div>
	{:else}
		<SettingsGroup>
			<SettingsRow title="Rename" onclick={startRename}>
				{#snippet icon()}<path d="M4 20h4l11-11-4-4L4 16v4zM14 6l4 4" />{/snippet}
			</SettingsRow>
			<SettingsRow title="Change avatar" onopen={onChangeAvatar}>
				{#snippet icon()}<circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />{/snippet}
			</SettingsRow>
			{#if !isYou}
				<SettingsRow title="This is me" onclick={onClaim}>
					{#snippet icon()}<path d="M5 12.5l4.5 4.5L19 7.5" />{/snippet}
				</SettingsRow>
			{/if}
			<SettingsRow title="Remove from group" tone="danger" onclick={() => (step = 'remove')}>
				{#snippet icon()}<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />{/snippet}
			</SettingsRow>
		</SettingsGroup>
	{/if}
</BottomSheet>

<style>
	.subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		text-align: center;
	}

	.rename {
		display: flex;
		flex-direction: column;
		margin-top: 18px;
	}

	.field-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-2);
		margin: 0 4px 8px;
	}

	.rename-input {
		padding: 12px 14px;
		font-size: 16px;
	}

	.warning {
		margin: 14px 0 0;
		font-size: 14px;
		line-height: 1.55;
		color: var(--ink-2);
		text-align: center;
		text-wrap: pretty;
	}

	.actions {
		display: flex;
		gap: 8px;
		margin-top: 18px;
	}

	.actions .btn {
		flex: 1;
		padding: 13px;
		font-size: 15px;
	}

	.actions .btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
