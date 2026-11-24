<script lang="ts">
	import { ANIMAL_EMOJIS } from '$lib/emojis';
	import BottomSheet from './BottomSheet.svelte';

	type Props = {
		open: boolean;
		current?: string;
		name: string;
		emojis?: string[];
		onPick: (emoji: string) => void;
		onClear: () => void;
		onClose: () => void;
	};

	let { open, current, name, emojis = ANIMAL_EMOJIS, onPick, onClear, onClose }: Props = $props();

	let custom = $state('');

	function pick(value: string) {
		onPick(value);
		custom = '';
	}

	function commitCustom() {
		const first = Array.from(custom.trim())[0];
		if (!first) return;
		pick(first);
	}
</script>

{#if open}
	<BottomSheet title="{name}'s avatar" onclose={onClose}>
		<div class="emoji-grid">
			{#each emojis as e (e)}
				<button type="button" class="emoji-cell" class:on={e === current} onclick={() => pick(e)}>
					{e}
				</button>
			{/each}
		</div>
		<div class="picker-custom">
			<label class="picker-custom-label" for="member-emoji-custom">Or type your own</label>
			<div class="row gap-6">
				<input
					id="member-emoji-custom"
					class="input picker-input"
					bind:value={custom}
					maxlength="6"
					placeholder="Paste emoji"
					autocomplete="off"
				/>
				<button
					type="button"
					class="btn btn-primary picker-apply"
					onclick={commitCustom}
					disabled={!custom.trim()}
				>
					Use
				</button>
			</div>
			{#if current}
				<button type="button" class="btn btn-block picker-clear" onclick={onClear}>
					Use the name initial instead
				</button>
			{/if}
		</div>
	</BottomSheet>
{/if}

<style>
	.emoji-grid {
		margin-top: 16px;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 6px;
	}

	.emoji-cell {
		aspect-ratio: 1;
		font-size: 22px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		cursor: pointer;
		display: grid;
		place-items: center;
		color: var(--ink);
		transition: background 0.12s ease, transform 0.12s ease;
	}

	@media (hover: hover) {
		.emoji-cell:hover {
			background: color-mix(in oklab, var(--ink) 6%, transparent);
		}
	}

	.emoji-cell.on {
		background: color-mix(in oklab, var(--accent) 22%, transparent);
		outline: 1px solid var(--accent);
	}

	.picker-custom {
		margin-top: 14px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}

	.picker-custom-label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-2);
		margin-bottom: 8px;
	}

	.picker-input {
		flex: 1;
		padding: 10px 12px;
		font-size: 14px;
	}

	.picker-apply {
		padding: 8px 16px;
		font-size: 13px;
	}

	.picker-apply:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.picker-clear {
		margin-top: 10px;
		font-size: 12px;
		color: var(--ink-2);
	}
</style>
