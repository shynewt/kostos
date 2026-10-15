<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { MAX_SPLIT_WEIGHT, splitWeight } from '$lib/split-default';
	import type { Member, SplitDefault } from '$lib/types';

	type Props = {
		mode: SplitDefault;
		members: Member[];
		currentMemberId: string | null;
		onSetMode: (mode: SplitDefault) => void;
		onSetWeight: (memberId: string, weight: number) => void;
	};

	let { mode, members, currentMemberId, onSetMode, onSetWeight }: Props = $props();

	const options: { value: SplitDefault; label: string; sub: string; description: string }[] = [
		{
			value: 'even',
			label: 'Evenly',
			sub: 'equal parts',
			description: 'New expenses are split equally.'
		},
		{
			value: 'ratio',
			label: 'Fixed ratio',
			sub: 'set per person',
			description: 'New expenses are split by these weights, so a 2 pays twice as much as a 1.'
		},
		{
			value: 'last',
			label: 'My last split',
			sub: 'copy mine',
			description: 'New expenses reuse the split from your last one. Until then, they are split equally.'
		}
	];

	const active = $derived(options.find((option) => option.value === mode) ?? options[0]);
	const totalWeight = $derived(members.reduce((sum, member) => sum + splitWeight(member), 0));
</script>

<div class="card default-split">
	<div class="split-tabs" role="radiogroup" aria-label="Default split for new expenses">
		{#each options as option (option.value)}
			<button
				type="button"
				class="split-tab"
				class:on={mode === option.value}
				role="radio"
				aria-checked={mode === option.value}
				onclick={() => onSetMode(option.value)}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					{#if option.value === 'even'}
						<path d="M12 4v16M6 7h12M4 11l2-4 2 4a2 2 0 1 1-4 0zM16 11l2-4 2 4a2 2 0 1 1-4 0z" />
					{:else if option.value === 'ratio'}
						<path d="M6 18L18 6" /><circle cx="7.5" cy="7.5" r="2" /><circle cx="16.5" cy="16.5" r="2" />
					{:else}
						<path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" />
					{/if}
				</svg>
				<span class="split-tab-label">{option.label}</span>
				<span class="split-tab-sub">{option.sub}</span>
			</button>
		{/each}
	</div>

	<p class="dim description">{active.description}</p>

	{#if mode === 'ratio'}
		<hr class="hairline" />
		<ul class="weights">
			{#each members as member (member.id)}
				{@const weight = splitWeight(member)}
				<li class="weight-row">
					<Avatar {member} size="sm" />
					<span class="weight-name">{member.name}{member.id === currentMemberId ? ' (you)' : ''}</span>
					<span class="dim mono weight-percent">{Math.round((weight / totalWeight) * 100)}%</span>
					<div class="stepper">
						<button
							type="button"
							class="step-btn"
							disabled={weight <= 1}
							onclick={() => onSetWeight(member.id, weight - 1)}
							aria-label="Decrease {member.name}'s share"
						>−</button>
						<span class="num weight-value">{weight}</span>
						<button
							type="button"
							class="step-btn"
							disabled={weight >= MAX_SPLIT_WEIGHT}
							onclick={() => onSetWeight(member.id, weight + 1)}
							aria-label="Increase {member.name}'s share"
						>+</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.default-split {
		padding: 14px;
	}

	.split-tabs {
		display: flex;
		gap: 6px;
	}

	.split-tab {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 10px 6px;
		border-radius: 14px;
		background: var(--bg);
		color: var(--ink-2);
		border: 1px solid var(--line);
		cursor: pointer;
		font-family: inherit;
		transition: background-color 140ms, color 140ms, border-color 140ms;
	}

	.split-tab.on {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
	}

	.split-tab svg {
		width: 18px;
		height: 18px;
	}

	.split-tab-label {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}

	.split-tab-sub {
		font-size: 10px;
		font-family: var(--font-mono);
		opacity: 0.75;
		white-space: nowrap;
	}

	.description {
		margin: 12px 2px 0;
		font-size: 12px;
		line-height: 1.5;
	}

	hr {
		margin: 14px 0 10px;
	}

	.weights {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.weight-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.weight-name {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.weight-percent {
		font-size: 11px;
		min-width: 32px;
		text-align: right;
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.step-btn {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg-2);
		color: var(--ink);
		cursor: pointer;
		font-size: 14px;
		font-weight: 700;
	}

	.step-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.weight-value {
		min-width: 22px;
		text-align: center;
		font-weight: 700;
	}
</style>
