<script lang="ts">
	import Avatar from './Avatar.svelte';
	import type { Member } from '$lib/types';

	type Props = {
		current: Member | null;
		members: Member[];
		expanded: boolean;
		onPick: (memberId: string) => void;
	};

	let { current, members, expanded, onPick }: Props = $props();
</script>

<div class="card identity-card">
	<div class="row gap-12 identity-row">
		<Avatar member={current} size="lg" />
		<div class="col identity-text">
			<span class="identity-name">{current?.name ?? 'No member claimed'}</span>
			<span class="dim mono identity-hint">
				{current
					? 'New expenses on this device are added as this member.'
					: 'Pick a member to record expenses as.'}
			</span>
		</div>
	</div>
	{#if expanded || !current}
		<ul class="identity-list">
			{#each members as m (m.id)}
				<li>
					<button
						type="button"
						class="identity-option"
						class:on={m.id === current?.id}
						onclick={() => onPick(m.id)}
					>
						<Avatar member={m} size="sm" />
						<span class="identity-option-name">{m.name}</span>
						{#if m.id === current?.id}
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="identity-check"
							>
								<path d="M5 12l5 5L20 7" />
							</svg>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.identity-card {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.identity-row {
		align-items: center;
	}

	.identity-text {
		flex: 1;
		gap: 2px;
		min-width: 0;
	}

	.identity-name {
		font-size: 15px;
		font-weight: 600;
	}

	.identity-hint {
		font-size: 11px;
		line-height: 1.4;
	}

	.identity-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}

	.identity-list li + li {
		border-top: 1px solid var(--line);
	}

	.identity-option {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 4px;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}

	.identity-option-name {
		flex: 1;
		font-size: 13px;
		font-weight: 500;
	}

	.identity-option.on .identity-option-name {
		color: var(--accent);
	}

	.identity-check {
		width: 18px;
		height: 18px;
		color: var(--accent);
	}
</style>
