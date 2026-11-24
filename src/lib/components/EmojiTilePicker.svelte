<script lang="ts">
	import { tileBackground } from '$lib/colors';
	import { PROJECT_EMOJI_PRESETS } from '$lib/emojis';
	import type { ProjectColor } from '$lib/types';

	type Props = {
		emoji: string;
		color: ProjectColor;
		onPick: (emoji: string) => void;
	};

	let { emoji, color, onPick }: Props = $props();

	let open = $state(false);
	let custom = $state('');

	function close() {
		open = false;
		custom = '';
	}

	function pick(value: string) {
		onPick(value);
		close();
	}

	function commitCustom() {
		const cleaned = custom.trim();
		if (!cleaned) return;
		const first = Array.from(cleaned)[0];
		if (!first) return;
		pick(first);
	}

	function onBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
	}
</script>

<div class="tile-block">
	<button
		type="button"
		class="emoji-tile"
		style="background: {tileBackground(color)};"
		aria-label="Change icon"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<span class="emoji-glyph">{emoji}</span>
		<span class="emoji-pencil" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
				<path d="M4 20h4l11-11-4-4L4 16v4zM14 6l4 4" />
			</svg>
		</span>
	</button>

</div>

{#if open}
	<div
		class="sheet-backdrop"
		role="button"
		tabindex="-1"
		aria-label="Close emoji picker"
		onclick={close}
		onkeydown={onBackdropKeydown}
	></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Choose an emoji">
		<div class="grabber" aria-hidden="true"></div>
		<div class="sheet-head">
			<span class="sheet-title">Choose an emoji</span>
			<button type="button" class="icon-btn sheet-close" onclick={close} aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>
		<div class="sheet-scroll">
			<div class="emoji-grid">
				{#each PROJECT_EMOJI_PRESETS as e (e)}
					<button
						type="button"
						class="emoji-cell"
						class:on={e === emoji}
						onclick={() => pick(e)}
					>
						{e}
					</button>
				{/each}
			</div>
			<div class="picker-custom">
				<label class="picker-custom-label" for="emoji-tile-custom-input">Or type your own</label>
				<div class="row gap-6">
					<input
						id="emoji-tile-custom-input"
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
			</div>
		</div>
	</div>
{/if}

<style>
	.tile-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}

	.emoji-tile {
		width: 72px;
		height: 72px;
		border-radius: 22px;
		display: grid;
		place-items: center;
		font-size: 36px;
		border: 0;
		cursor: pointer;
		color: var(--ink);
		position: relative;
		transition: transform 0.12s ease;
	}

	.emoji-tile:active {
		transform: scale(0.97);
	}

	.emoji-glyph {
		pointer-events: none;
	}

	.emoji-pencil {
		position: absolute;
		bottom: -6px;
		right: -6px;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		display: grid;
		place-items: center;
		color: var(--ink);
	}

	.emoji-pencil svg {
		width: 14px;
		height: 14px;
	}

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
</style>
