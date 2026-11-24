<script lang="ts">
	import InviteSheet, { groupInviteUrl } from './InviteSheet.svelte';
	import LegacyGroupBanner from './LegacyGroupBanner.svelte';
	import SyncBanner from './SyncBanner.svelte';
	import SyncStatus from './SyncStatus.svelte';
	import { PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import { plural } from '$lib/plural';
	import { useRoomContext } from '$lib/sync/useRoom.svelte';
	import type { Project } from '$lib/types';

	type Props = {
		roomId: string;
		project: Project | null;
	};

	let { roomId, project }: Props = $props();

	const context = useRoomContext();
	const memberCount = $derived(context?.room?.members.length ?? 0);
	const name = $derived(project?.name ?? 'Loading');
	const subtitle = $derived(plural(memberCount, 'person', 'people'));

	let showInvite = $state(false);
	const inviteUrl = $derived(groupInviteUrl(roomId));
</script>

<header class="app-bar">
	<a class="project-head" href="/" aria-label="{name}, {subtitle}. Switch group" title="Switch group">
		<span
			class="project-tile"
			aria-hidden="true"
			style={project
				? `background: ${tileBackground(project.color)}; color: ${PROJECT_COLOR_VALUES[project.color]};`
				: ''}
		>
			{project?.emoji ?? '🏖'}
		</span>
		<span class="project-text">
			<span class="project-name">
				<span class="project-name-text">{name}</span>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="switch-chevron" aria-hidden="true">
					<path d="M6 9l6 6 6-6" />
				</svg>
			</span>
			<span class="project-subtitle">{subtitle}</span>
		</span>
	</a>
	<div class="actions">
		{#if inviteUrl}
			<button class="icon-btn" type="button" aria-label="Share invite" aria-haspopup="dialog" onclick={() => (showInvite = true)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 4v12M8 8l4-4 4 4M5 14v5h14v-5" /></svg>
			</button>
		{/if}
		<SyncStatus />
	</div>
</header>
<SyncBanner conflicts />
<LegacyGroupBanner />

{#if inviteUrl && showInvite}
	<InviteSheet url={inviteUrl} groupName={name} onclose={() => (showInvite = false)} />
{/if}

<style>
	.project-head {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		margin: -6px 0 -6px -8px;
		padding: 6px 8px;
		border-radius: 16px;
		color: inherit;
		text-decoration: none;
		-webkit-tap-highlight-color: transparent;
		transition: background-color 160ms;
	}

	.project-head:active {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}

	@media (hover: hover) {
		.project-head:hover {
			background: color-mix(in oklab, var(--ink) 5%, transparent);
		}
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

	.project-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 1px;
	}

	.project-name {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--ink);
	}

	.project-name-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.switch-chevron {
		width: 13px;
		height: 13px;
		color: var(--ink-3);
		flex-shrink: 0;
	}

	.project-subtitle {
		font-size: 12px;
		color: var(--ink-3);
		white-space: nowrap;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
</style>
