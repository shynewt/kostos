<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pickMemberColor, pickMemberEmoji } from '$lib/avatar';
	import { PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import Avatar from '$lib/components/Avatar.svelte';
	import EmptyCard from '$lib/components/EmptyCard.svelte';
	import { addProject, setCurrentMember } from '$lib/storage';
	import {
		addMember,
		generateId,
		openRoom
	} from '$lib/sync/doc';
	import type { Member, Project } from '$lib/types';
	import { setContext } from 'svelte';
	import SyncBanner from '$lib/components/SyncBanner.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import { useRoom } from '$lib/sync/useRoom.svelte';

	type Status = 'parsing' | 'syncing' | 'ready' | 'empty' | 'invalid';

	const roomId = $derived((page.url.searchParams.get('room') ?? '').toUpperCase());
	const secret = $derived(page.url.hash.startsWith('#') ? page.url.hash.slice(1) : '');

	let status = $state<Status>('parsing');
	let project = $state<Project | null>(null);
	let members = $state<Member[]>([]);
	let pickedId = $state<string | null>(null);
	let newName = $state('');
	let joining = $state(false);
	let joinError = $state<string | null>(null);

	const room = $derived(roomId && secret ? useRoom(roomId, secret) : null);
	setContext('kostos-room', { get room() { return room; } });
	$effect(() => room?.observe());
	$effect(() => {
		if (!room) { status = 'invalid'; return; }
		project = room.project;
		members = room.members;
		if (project && !room.checking) {
			status = 'ready';
			if (!pickedId && members.length) pickedId = members[0].id;
		} else if (['error', 'offline', 'synced'].includes(room.sync.phase)) status = 'empty';
		else status = 'syncing';
	});
	function retry() { room?.handle.syncProvider?.retry(); }

	async function joinAsExisting() {
		if (!project || !pickedId || joining) return;
		joining = true;
		joinError = null;
		try {
			addProject({
				roomId,
				secret,
				name: project.name,
				emoji: project.emoji,
				color: project.color,
				lastActiveAt: Date.now()
			});
			setCurrentMember(roomId, pickedId);
			await goto(`/p/${roomId}`);
		} catch (error) {
			joinError = error instanceof Error ? error.message : 'Could not save the group on this device';
		} finally { joining = false; }
	}

	async function joinAsNew(event?: Event) {
		event?.preventDefault();
		if (!project || joining) return;
		const name = newName.trim();
		if (!name) return;
		joining = true;
		joinError = null;
		try {
			const handle = openRoom(roomId, secret);
			const member: Member = {
				id: generateId(),
				name,
				color: pickMemberColor(members),
				emoji: pickMemberEmoji(members),
				createdAt: Date.now()
			};
			addMember(handle, member);
			await handle.persistence?.flush();
			addProject({
				roomId,
				secret,
				name: project.name,
				emoji: project.emoji,
				color: project.color,
				lastActiveAt: Date.now()
			});
			setCurrentMember(roomId, member.id);
			await goto(`/p/${roomId}`);
		} catch (error) {
			joinError = error instanceof Error ? error.message : 'Could not save the group on this device';
		} finally { joining = false; }
	}
</script>

<svelte:head>
	<title>Join {project?.name ?? 'a group'} · Kostos</title>
</svelte:head>

<div class="screen" data-page="join">
	<header class="app-bar">
		<div class="row gap-8" style="flex: 1;">
			<a class="icon-btn" href="/" aria-label="Cancel">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</a>
		</div>
		<div class="row" style="flex-shrink: 0;"><div class="app-bar-title">Joining</div><SyncStatus variant="dot" /></div>
		<div class="row gap-6" style="flex: 1;"></div>
	</header>
	<SyncBanner />

	<div class="scroll">
		{#if status === 'invalid'}
			<EmptyCard>
				<p>This invite link is missing the room or the secret. Ask the sender to share the full link from their <strong>Share</strong> button.</p>
				<a href="/" class="btn btn-block back-btn">Back</a>
			</EmptyCard>
		{:else if status === 'parsing' || status === 'syncing'}
			<div class="loading-block">
				<div class="loading-pulse" aria-hidden="true"></div>
				<p class="dim mono loading-label">Reaching the group…</p>
				<p class="dim loading-hint">
					Decrypting state with your secret token. The server never sees the contents.
				</p>
			</div>
		{:else if status === 'empty'}
			<EmptyCard>
				<p>
					Group data isn’t available for <strong>{roomId}</strong> yet. Check your connection and use the full invite link shared by your group.
				</p>
				<div class="row gap-8 retry-row">
					<a href="/" class="btn">Cancel</a>
					<button type="button" class="btn btn-primary" onclick={retry}>Try again</button>
				</div>
			</EmptyCard>
		{:else if project}
			<section class="hero">
				<div class="row gap-10 hero-row">
					<span
						class="hero-tile"
						style="background: {tileBackground(project.color)}; color: {PROJECT_COLOR_VALUES[project.color]};"
					>
						{project.emoji}
					</span>
					<div class="col">
						<div class="eyebrow">Joining</div>
						<div class="h2 hero-title">{project.name}</div>
						<div class="dim mono hero-meta">{members.length} {members.length === 1 ? 'member' : 'members'} · {roomId}</div>
					</div>
				</div>
			</section>

			<div class="section-head">
				<div class="eyebrow">Which one are you?</div>
				<span class="dim mono">PICK ANY · MULTIPLE DEVICES OK</span>
			</div>

			{#if members.length > 0}
				<div class="card member-list">
					{#each members as m, i (m.id)}
						{#if i > 0}<hr class="hairline" style="margin-left: 56px;" />{/if}
						<button
							type="button"
							class="member-row"
							class:on={m.id === pickedId}
							onclick={() => (pickedId = m.id)}
						>
							<Avatar member={m} size="md" />
							<span class="col member-text">
								<span class="member-name">{m.name}</span>
							</span>
							<span class="check" class:on={m.id === pickedId}>
								{#if m.id === pickedId}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
								{/if}
							</span>
						</button>
					{/each}
				</div>
			{:else}
				<p class="dim no-members">
					This project has no members yet. Add yourself below.
				</p>
			{/if}

			<form class="card new-member-card" onsubmit={joinAsNew}>
				<div class="eyebrow new-member-eyebrow">Or add a new member</div>
				<div class="row gap-8">
					<input
						class="input new-member-input"
						bind:value={newName}
						placeholder="Your name"
						autocomplete="off"
					/>
					<button type="submit" class="btn new-member-btn" disabled={!newName.trim() || joining}>
						Add & join
					</button>
				</div>
			</form>

			{#if joinError}<p role="alert">{joinError}</p>{/if}
			<button
				type="button"
				class="btn btn-primary btn-block continue-btn"
				disabled={!pickedId || joining}
				onclick={joinAsExisting}
			>
				{joining ? 'Joining…' : `Continue as ${members.find((m) => m.id === pickedId)?.name ?? '…'}`}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
			</button>

			<p class="dim privacy-hint mono">NO PASSWORD · NO EMAIL · LIVES ON YOUR DEVICE</p>
		{/if}
	</div>
</div>

<style>
	.back-btn {
		margin-top: 14px;
	}

	.retry-row {
		justify-content: center;
		margin-top: 14px;
	}

	.loading-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 14px;
		padding: 48px 24px 24px;
	}

	.loading-pulse {
		width: 40px;
		height: 40px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--accent) 30%, transparent);
		animation: pulse 1.4s ease-in-out infinite;
	}

	.loading-label {
		font-size: 12px;
		letter-spacing: 0.06em;
	}

	.loading-hint {
		font-size: 12px;
		max-width: 280px;
		line-height: 1.5;
	}

	@keyframes pulse {
		0%, 100% { transform: scale(0.85); opacity: 0.6; }
		50% { transform: scale(1); opacity: 1; }
	}

	.hero {
		padding: 18px 0 12px;
	}

	.hero-row {
		align-items: center;
	}

	.hero-tile {
		width: 48px;
		height: 48px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		font-size: 26px;
		flex-shrink: 0;
	}

	.hero-title {
		margin-top: 2px;
	}

	.hero-meta {
		font-size: 11px;
		margin-top: 4px;
	}

	.member-list {
		padding: 4px;
	}

	.member-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 14px 12px;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		font: inherit;
		text-align: left;
		border-radius: 14px;
	}

	.member-row.on {
		background: color-mix(in oklab, var(--accent) 8%, transparent);
	}

	.member-text {
		flex: 1;
	}

	.member-name {
		font-size: 14px;
		font-weight: 600;
	}

	.check {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		border: 1.5px solid var(--line-2);
		display: grid;
		place-items: center;
		color: transparent;
	}

	.check.on {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
	}

	.check svg {
		width: 13px;
		height: 13px;
	}

	.no-members {
		font-size: 12px;
		line-height: 1.5;
		padding: 12px 4px;
	}

	.new-member-card {
		margin-top: 14px;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.new-member-eyebrow {
		font-size: 10px;
	}

	.new-member-input {
		flex: 1;
		padding: 10px 14px;
		font-size: 14px;
	}

	.new-member-btn {
		padding: 8px 14px;
		font-size: 13px;
	}

	.new-member-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.continue-btn {
		margin-top: 22px;
	}

	.continue-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.privacy-hint {
		font-size: 11px;
		text-align: center;
		margin: 14px 0 0;
		letter-spacing: 0.04em;
	}
</style>
