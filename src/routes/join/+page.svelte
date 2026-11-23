<script lang="ts">
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pickMemberColor, pickMemberEmoji } from '$lib/avatar';
	import { PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import EmptyCard from '$lib/components/EmptyCard.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import MemberPicker from '$lib/components/MemberPicker.svelte';
	import { addProject, getCurrentMember, setCurrentMember } from '$lib/storage';
	import { deriveLocalId, InsecureContextError } from '$lib/sync/crypto';
	import {
		addMember,
		generateId,
		openRoom
	} from '$lib/sync/doc';
	import type { Member, Project } from '$lib/types';
	import { isOldInvite, memberFromInviteHash, OLD_INVITE_MESSAGE, parseInvite } from '$lib/invite';
	import SyncBanner from '$lib/components/SyncBanner.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import { plural } from '$lib/plural';
	import { PROBLEM_LABELS } from '$lib/sync/status';
	import { provideRoomContext, useRoom } from '$lib/sync/useRoom.svelte';

	const INCOMPLETE_INVITE_MESSAGE = 'This invite link is incomplete. Ask the sender for the full link from their Share button.';

	const LOCAL_STORAGE_MESSAGE = 'This browser won’t let Kostos save data here, so the group can’t be joined. Close other Kostos tabs, turn off private browsing if it’s on, then open the invite link again.';

	type Status = 'parsing' | 'syncing' | 'ready' | 'empty' | 'denied' | 'invalid' | 'unreadable' | 'storage';

	// the page is prerendered for link previews; the link itself, and the key after its #, only exist in the browser
	let mounted = $state(false);
	$effect(() => { mounted = true; });
	const secret = $derived(mounted ? (parseInvite(page.url.hash) ?? '') : '');
	const oldInvite = $derived(mounted && isOldInvite(`${page.url.search}${page.url.hash}`));
	let unreadableMessage = $state('');
	let derivation = $state<{ secret: string; roomId: string } | null>(null);
	// the hash can change in place; an ID derived from the previous secret must never open a room with the new one
	const roomId = $derived(derivation?.secret === secret ? derivation.roomId : '');
	$effect(() => {
		const current = secret;
		unreadableMessage = '';
		if (!current) return;
		let stale = false;
		deriveLocalId(current).then(
			(id) => { if (!stale) derivation = { secret: current, roomId: id }; },
			(error) => {
				if (!stale) unreadableMessage = error instanceof InsecureContextError ? error.message : 'This invite couldn’t be opened on this device.';
			}
		);
		return () => { stale = true; };
	});

	const room = $derived(roomId && secret ? useRoom(roomId, secret) : null);
	provideRoomContext(() => room);
	$effect(() => room?.observe());
	const project = $derived(room?.project ?? null);
	const members = $derived(room?.members ?? []);
	const status = $derived.by<Status>(() => {
		if (!secret) return 'invalid';
		if (unreadableMessage) return 'unreadable';
		if (!room) return 'parsing';
		if (project && !room.checking) return 'ready';
		if (room.sync.problem === 'denied') return 'denied';
		if (room.local?.phase === 'error') return 'storage';
		if (['error', 'offline', 'synced'].includes(room.sync.phase)) return 'empty';
		return 'syncing';
	});

	// a link from the old site names the member this phone already was, so the picker can be skipped
	const linkedMemberId = $derived(mounted ? memberFromInviteHash(page.url.hash) : null);
	let chosenId = $state<string | null>(null);
	// a choice made in another group (the hash can change in place) falls back to the first member
	const pickedId = $derived(members.some((member) => member.id === chosenId) ? chosenId : (members[0]?.id ?? null));
	let newName = $state('');
	let joining = $state(false);
	let joinError = $state<string | null>(null);

	function retry() { room?.handle.syncProvider?.retry(); }

	async function join(memberId: string, newMember?: Member) {
		if (!project || joining) return;
		joining = true;
		joinError = null;
		try {
			if (newMember) {
				const handle = openRoom(roomId, secret);
				addMember(handle, newMember);
				await handle.persistence?.flush();
			}
			addProject({
				roomId,
				secret,
				name: project.name,
				emoji: project.emoji,
				color: project.color,
				lastActiveAt: Date.now()
			});
			setCurrentMember(roomId, memberId);
			await goto(`/p/${roomId}`);
		} catch (error) {
			joinError = error instanceof Error ? error.message : 'Could not save the group on this device';
		} finally { joining = false; }
	}

	function joinAsExisting() {
		if (pickedId) return join(pickedId);
	}

	let joinedLinkedMember = false;
	$effect(() => {
		if (status !== 'ready' || joinedLinkedMember || !linkedMemberId) return;
		if (!members.some((member) => member.id === linkedMemberId)) return;
		joinedLinkedMember = true;
		// a phone that already chose a member in this group keeps that choice
		const alreadyChosen = getCurrentMember(roomId);
		void join(alreadyChosen && members.some((member) => member.id === alreadyChosen) ? alreadyChosen : linkedMemberId);
	});

	function joinAsNew(event: Event) {
		event.preventDefault();
		const name = newName.trim();
		if (!name) return;
		const member: Member = {
			id: generateId(),
			name,
			color: pickMemberColor(members),
			emoji: pickMemberEmoji(members),
			createdAt: Date.now()
		};
		return join(member.id, member);
	}
</script>

<ShareMeta
	title="You’re invited to a group on Kostos"
	description="Tap to join and split expenses together. No account needed, end-to-end encrypted."
	image="/og-invite.png"
	imageAlt="An invitation to join a group on Kostos"
	path="/join"
	noindex
/>

<svelte:head>
	<title>{project ? `Join ${project.name} on Kostos` : 'Join a group on Kostos'}</title>
</svelte:head>

{#if mounted}
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
	{#if status !== 'denied'}<SyncBanner />{/if}

	<div class="scroll">
		{#snippet deadEnd(message: string)}
			<EmptyCard>
				<p>{message}</p>
				<a href="/" class="btn btn-block back-btn">Back</a>
			</EmptyCard>
		{/snippet}

		{#if status === 'invalid'}
			{@render deadEnd(oldInvite ? OLD_INVITE_MESSAGE : INCOMPLETE_INVITE_MESSAGE)}
		{:else if status === 'unreadable'}
			{@render deadEnd(unreadableMessage)}
		{:else if status === 'denied'}
			{@render deadEnd(PROBLEM_LABELS.denied)}
		{:else if status === 'storage'}
			{@render deadEnd(LOCAL_STORAGE_MESSAGE)}
		{:else if status === 'parsing' || status === 'syncing'}
			<div class="loading-block">
				<div class="loading-pulse" aria-hidden="true"></div>
				<p class="dim mono loading-label">Reaching the group…</p>
				<p class="dim loading-hint">
					Decrypting with your group key. The server never sees the contents.
				</p>
			</div>
		{:else if status === 'empty'}
			<EmptyCard>
				<p>
					Group data isn’t available yet. Check your connection and use the full invite link shared by your group.
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
						<div class="dim mono hero-meta">{plural(members.length, 'member', 'members')}</div>
					</div>
				</div>
			</section>

			<div class="section-head">
				<div class="eyebrow">Which member are you?</div>
				<span class="dim mono">PICK ANY · MULTIPLE DEVICES OK</span>
			</div>

			{#if members.length > 0}
				<MemberPicker {members} bind:selectedId={() => pickedId, (id) => (chosenId = id)} />
			{:else}
				<p class="dim no-members">
					This group has no members yet. Add yourself below.
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

			{#if joinError}<FormError message={joinError} />{/if}
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
{/if}

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
