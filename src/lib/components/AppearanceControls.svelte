<script lang="ts">
	import { getPalette, getTheme, setPalette, setTheme } from '$lib/storage';

	type Theme = 'system' | 'light' | 'dark';
	type Palette = 'lime' | 'cyan' | 'violet' | 'amber' | 'coral' | 'blue';

	const themes: { value: Theme; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	// dark-default accent hexes, mirrored from tokens.css so each swatch shows its
	// own colour regardless of the active palette
	const palettes: { value: Palette; color: string }[] = [
		{ value: 'lime', color: '#c4ff4f' },
		{ value: 'cyan', color: '#5eead4' },
		{ value: 'violet', color: '#b29cff' },
		{ value: 'amber', color: '#ffc457' },
		{ value: 'coral', color: '#ff8a6b' },
		{ value: 'blue', color: '#7eb0ff' }
	];

	let theme = $state<Theme>(getTheme());
	let palette = $state<Palette>(getPalette());

	function chooseTheme(next: Theme) {
		theme = next;
		setTheme(next);
	}

	function choosePalette(next: Palette) {
		palette = next;
		setPalette(next);
	}
</script>

<div class="appearance">

	<div class="row">
		<span class="label">Theme</span>
		<div class="seg" role="group" aria-label="Theme">
			{#each themes as t (t.value)}
				<button
					type="button"
					class="seg-btn"
					aria-pressed={theme === t.value}
					onclick={() => chooseTheme(t.value)}
				>
					{t.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="row">
		<span class="label">Accent</span>
		<div class="swatches" role="group" aria-label="Accent colour">
			{#each palettes as p (p.value)}
				<button
					type="button"
					class="swatch"
					class:selected={palette === p.value}
					style="--swatch: {p.color};"
					aria-label={p.value}
					aria-pressed={palette === p.value}
					onclick={() => choosePalette(p.value)}
				></button>
			{/each}
		</div>
	</div>
</div>

<style>
	.appearance {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.label {
		color: var(--ink-2);
		font-size: 0.9rem;
	}

	.seg {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--bg-2);
	}

	.seg-btn {
		border: 0;
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.85rem;
		padding: 6px 12px;
		border-radius: calc(var(--radius-sm) - 4px);
		cursor: pointer;
	}

	.seg-btn[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}

	.swatches {
		display: inline-flex;
		gap: 8px;
	}

	.swatch {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--swatch);
		cursor: pointer;
	}

	.swatch.selected {
		/* colour dot, a gap in the card colour, then an ink ring */
		box-shadow:
			0 0 0 2px var(--bg-2),
			0 0 0 4px var(--ink);
	}

	.seg-btn:focus-visible,
	.swatch:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
