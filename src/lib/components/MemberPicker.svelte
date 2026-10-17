<script lang="ts">
	import type { Member } from '$lib/types';
	import Avatar from './Avatar.svelte';

	type Props = { members: Member[]; selectedId: string | null };

	let { members, selectedId = $bindable() }: Props = $props();

	// one tab stop for the whole group; arrow keys move the choice, as in a native radio group
	const ARROW_STEPS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

	function onKeydown(event: KeyboardEvent, index: number) {
		const step = ARROW_STEPS[event.key];
		if (!step) return;
		event.preventDefault();
		const nextIndex = (index + step + members.length) % members.length;
		selectedId = members[nextIndex].id;
		const radios = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
		radios?.[nextIndex].focus();
	}
</script>

<div class="card member-list" role="radiogroup" aria-label="Which member are you?">
	{#each members as member, index (member.id)}
		{#if index > 0}<hr class="hairline" aria-hidden="true" style="margin-left: 56px;" />{/if}
		<button
			type="button"
			class="member-row"
			class:on={member.id === selectedId}
			role="radio"
			aria-checked={member.id === selectedId}
			tabindex={member.id === (selectedId ?? members[0].id) ? 0 : -1}
			onclick={() => (selectedId = member.id)}
			onkeydown={(event) => onKeydown(event, index)}
		>
			<Avatar {member} size="md" />
			<span class="member-name">{member.name}</span>
			<span class="check" class:on={member.id === selectedId}>
				{#if member.id === selectedId}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
				{/if}
			</span>
		</button>
	{/each}
</div>

<style>
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

	.member-name {
		flex: 1;
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
</style>
