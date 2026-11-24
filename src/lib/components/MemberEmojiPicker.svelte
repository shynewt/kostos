<script lang="ts">
	import { ANIMAL_EMOJIS } from '$lib/emojis';

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

	function onBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

{#if open}
	<div
		class="sheet-backdrop"
		role="button"
		tabindex="-1"
		aria-label="Close emoji picker"
		onclick={onClose}
		onkeydown={onBackdropKeydown}
	></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Choose an avatar emoji">
		<div class="grabber" aria-hidden="true"></div>
		<div class="sheet-head">
			<span class="sheet-title">{name}'s avatar</span>
			<button type="button" class="icon-btn sheet-close" onclick={onClose} aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>
		<div class="sheet-scroll">
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
		</div>
	</div>
{/if}

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		background: color-mix(in oklab, black 55%, transparent);
		z-index: 1100;
		border: 0;
		cursor: pointer;
		animation: fade-in 0.12s ease-out;
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		margin-inline: auto;
		width: 100%;
		max-width: 480px;
		max-height: 78vh;
		background: var(--bg-2);
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		border: 1px solid var(--line);
		border-bottom: 0;
		padding: 6px 14px calc(16px + env(safe-area-inset-bottom, 0px));
		z-index: 1101;
		display: flex;
		flex-direction: column;
		box-shadow: 0 -10px 30px color-mix(in oklab, black 35%, transparent);
		animation: slide-up 0.18s ease-out;
	}

	.grabber {
		width: 36px;
		height: 4px;
		border-radius: 999px;
		background: var(--line-2);
		margin: 6px auto 8px;
	}

	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 2px 8px;
	}

	.sheet-title {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.sheet-close {
		width: 28px;
		height: 28px;
	}

	.sheet-close svg {
		width: 14px;
		height: 14px;
	}

	.sheet-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 0 8px;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slide-up {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}

	.emoji-grid {
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

	.emoji-cell:hover {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
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
