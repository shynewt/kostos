<script lang="ts">
	import { page } from '$app/state';
	import EmptyCard from '$lib/components/EmptyCard.svelte';
	import ScreenAppBar from '$lib/components/ScreenAppBar.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';
	import SettingsRow from '$lib/components/SettingsRow.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import { REPEAT_LABELS } from '$lib/recurring';
	import { useRoom } from '$lib/sync/useRoom.svelte';

	const roomId = $derived(page.params.roomId ?? '');
	const room = $derived(useRoom(roomId));
	$effect(() => room.observe());

	const project = $derived(room.project);
</script>

<svelte:head>
	<title>Repeating expenses · {project?.name ?? 'Kostos'}</title>
</svelte:head>

<div class="screen" data-page="repeating">
	<ScreenAppBar title="Repeating" backHref="/p/{roomId}/settings" />

	<div class="scroll">
		{#if room.repeating.length === 0}
			<EmptyCard>
				<p>Nothing repeats right now. Set an expense to repeat when you add or edit it.</p>
			</EmptyCard>
		{:else}
			<SettingsGroup
				heading="Active"
				count={room.repeating.length}
				footnote="Each row opens the newest copy, where you can change the repeat or stop it."
			>
				{#each room.repeating as { rule, latest } (rule.id)}
					<SettingsRow
						title={rule.template.description || 'Expense'}
						value={REPEAT_LABELS[rule.frequency]}
						href="/p/{roomId}/expenses/{latest.id}"
					>
						{#snippet icon()}<path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" />{/snippet}
					</SettingsRow>
				{/each}
			</SettingsGroup>
		{/if}
	</div>

	<TabBar {roomId} active="group" />
</div>
