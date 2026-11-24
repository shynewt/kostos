<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { MAX_SPLIT_WEIGHT, SPLIT_DEFAULT_LABELS, splitWeight } from '$lib/split-default';
	import type { Member, SplitDefault } from '$lib/types';

	type Props = {
		mode: SplitDefault;
		members: Member[];
		currentMemberId: string | null;
		onSetMode: (mode: SplitDefault) => void;
		onSetWeight: (memberId: string, weight: number) => void;
	};

	let { mode, members, currentMemberId, onSetMode, onSetWeight }: Props = $props();

	const options: { value: SplitDefault; description: string }[] = [
		{ value: 'even', description: 'Everyone pays an equal part.' },
		{ value: 'ratio', description: 'Split by weights you set, so a 2 pays twice as much as a 1.' },
		{ value: 'last', description: 'Reuse the split from your last expense. Even until you add one.' }
	];

	const totalWeight = $derived(members.reduce((sum, member) => sum + splitWeight(member), 0));
</script>

<div class="options" role="radiogroup" aria-label="Default split for new expenses">
	{#each options as option (option.value)}
		{@const selected = mode === option.value}
		<button
			type="button"
			class="option"
			class:on={selected}
			role="radio"
			aria-checked={selected}
			onclick={() => onSetMode(option.value)}
		>
			<span class="option-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					{#if option.value === 'even'}
						<path d="M12 4v16M6 7h12M4 11l2-4 2 4a2 2 0 1 1-4 0zM16 11l2-4 2 4a2 2 0 1 1-4 0z" />
					{:else if option.value === 'ratio'}
						<path d="M6 18L18 6" /><circle cx="7.5" cy="7.5" r="2" /><circle cx="16.5" cy="16.5" r="2" />
					{:else}
						<path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" />
					{/if}
				</svg>
			</span>
			<span class="option-text">
				<span class="option-label">{SPLIT_DEFAULT_LABELS[option.value]}</span>
				<span class="option-description">{option.description}</span>
			</span>
			<span class="option-mark" aria-hidden="true">
				{#if selected}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
				{/if}
			</span>
		</button>
	{/each}
</div>

{#if mode === 'ratio'}
	<p class="weights-heading">Weights</p>
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

<style>
	.options {
		display: flex;
		flex-direction: column;
		margin-top: 16px;
		border: 1px solid var(--line);
		border-radius: 18px;
		overflow: hidden;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 14px;
		background: transparent;
		border: 0;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.option + .option {
		border-top: 1px solid var(--line);
	}

	.option:active {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}

	.option-icon {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		color: var(--ink-2);
	}

	.option-icon svg {
		width: 20px;
		height: 20px;
	}

	.option.on .option-icon {
		color: var(--accent);
	}

	.option-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.option-label {
		font-size: 15px;
		font-weight: 500;
	}

	.option-description {
		font-size: 12px;
		line-height: 1.4;
		color: var(--ink-3);
	}

	.option-mark {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--accent);
	}

	.option-mark svg {
		width: 100%;
		height: 100%;
	}

	.weights-heading {
		margin: 20px 4px 10px;
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		color: var(--ink-2);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.weights {
		list-style: none;
		margin: 0;
		padding: 0 4px;
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
		width: 32px;
		height: 32px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg);
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
