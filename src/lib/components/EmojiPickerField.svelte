<script lang="ts">
	export type EmojiItem = { id: string; name: string; emoji: string };

	type Props = {
		label: string;
		fallbackEmoji?: string;
		items: EmojiItem[];
		selectedId: string | undefined;
		onSelect: (id: string) => void;
		onAddCustom: (item: EmojiItem) => void;
		/** Marks the current value as auto-filled (e.g. guessed from the description) so the
		 *  user notices and can correct it. Cleared once they pick a value themselves. */
		suggested?: boolean;
	};

	let {
		label,
		fallbackEmoji = '📦',
		items,
		selectedId,
		onSelect,
		onAddCustom,
		suggested = false
	}: Props = $props();

	let open = $state(false);
	let customName = $state('');
	let customEmoji = $state('');

	const selected = $derived(items.find((i) => i.id === selectedId));
	const displayEmoji = $derived(selected?.emoji ?? fallbackEmoji);
	const displayName = $derived(selected?.name ?? 'None');

	function commitCustom() {
		const name = customName.trim();
		if (!name) return;
		const emoji = Array.from(customEmoji.trim())[0] ?? fallbackEmoji;
		const id = `${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
		onAddCustom({ id, name, emoji });
		customName = '';
		customEmoji = '';
		open = false;
	}
</script>

<div class="picker-field">
	<button
		type="button"
		class="picker-row"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<span class="picker-tile">{displayEmoji}</span>
		<span class="col picker-text">
			<span class="picker-label">{label}</span>
			<span class="picker-value-row">
				<span class="picker-value" class:is-empty={!selected}>{displayName}</span>
				{#if suggested && selected}
					<span class="picker-suggested">guessed</span>
				{/if}
			</span>
		</span>
		<span class="picker-chevron" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
				<path d="M6 9l6 6 6-6" />
			</svg>
		</span>
	</button>
	{#if open}
		<ul class="picker-list">
			{#each items as item (item.id)}
				<li>
					<button
						type="button"
						class="picker-option"
						class:on={item.id === selectedId}
						onclick={() => {
							onSelect(item.id);
							open = false;
						}}
					>
						<span class="picker-option-emoji">{item.emoji}</span>
						<span class="picker-option-name">{item.name}</span>
						{#if item.id === selectedId}
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="picker-check"
							>
								<path d="M5 12l5 5L20 7" />
							</svg>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		<div class="picker-custom">
			<label class="picker-custom-label" for="picker-custom-name-{label}">Or add your own</label>
			<div class="row gap-6 picker-custom-row">
				<input
					class="input picker-custom-emoji mono"
					bind:value={customEmoji}
					maxlength="4"
					placeholder={fallbackEmoji}
					aria-label="Custom emoji"
				/>
				<input
					id="picker-custom-name-{label}"
					class="input picker-custom-name"
					bind:value={customName}
					placeholder="Label"
					autocomplete="off"
				/>
				<button
					type="button"
					class="btn btn-primary picker-custom-apply"
					onclick={commitCustom}
					disabled={!customName.trim()}
				>
					Add
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.picker-field {
		display: flex;
		flex-direction: column;
	}

	.picker-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 12px;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		text-align: left;
		width: 100%;
		font: inherit;
	}

	.picker-tile {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		font-size: 18px;
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}

	.picker-text {
		flex: 1;
		align-items: flex-start;
	}

	.picker-label {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.picker-value-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 4px;
	}

	.picker-value {
		font-size: 14px;
		color: var(--ink);
	}

	.picker-value.is-empty {
		color: var(--ink-3);
	}

	.picker-suggested {
		font-family: var(--font-mono);
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent);
		background: color-mix(in oklab, var(--accent) 14%, transparent);
		padding: 2px 6px;
		border-radius: 999px;
		line-height: 1.4;
	}

	.picker-chevron {
		color: var(--ink-3);
	}

	.picker-chevron svg {
		width: 18px;
		height: 18px;
	}

	.picker-list {
		list-style: none;
		margin: 0;
		padding: 4px 8px 8px;
		border-top: 1px solid var(--line);
		max-height: 240px;
		overflow-y: auto;
	}

	.picker-list li + li {
		border-top: 1px solid var(--line);
	}

	.picker-option {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 4px;
		width: 100%;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.picker-option-emoji {
		font-size: 18px;
		width: 28px;
		text-align: center;
	}

	.picker-option-name {
		flex: 1;
		font-size: 13px;
		font-weight: 500;
	}

	.picker-option.on .picker-option-name {
		color: var(--accent);
	}

	.picker-check {
		width: 18px;
		height: 18px;
		color: var(--accent);
	}

	.picker-custom {
		padding: 10px 12px 14px;
		border-top: 1px solid var(--line);
	}

	.picker-custom-label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-2);
		margin-bottom: 8px;
	}

	.picker-custom-row {
		align-items: stretch;
	}

	.picker-custom-emoji {
		width: 56px;
		padding: 8px 10px;
		font-size: 16px;
		text-align: center;
	}

	.picker-custom-name {
		flex: 1;
		padding: 8px 12px;
		font-size: 13px;
	}

	.picker-custom-apply {
		padding: 8px 16px;
		font-size: 13px;
	}

	.picker-custom-apply:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
