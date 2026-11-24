<script lang="ts">
	export type EmojiItem = { id: string; name: string; emoji: string };

	type Props = {
		label: string;
		fallbackEmoji?: string;
		items: EmojiItem[];
		selectedId: string | undefined;
		onSelect: (id: string) => void;
		onAddCustom: (item: EmojiItem) => void;
	};

	let { label, fallbackEmoji = '📦', items, selectedId, onSelect, onAddCustom }: Props = $props();

	let customName = $state('');
	let customEmoji = $state('');

	const idPrefix = $derived(label.toLowerCase().replace(/\s+/g, '-'));

	function commitCustom() {
		const name = customName.trim();
		if (!name) return;
		const emoji = Array.from(customEmoji.trim())[0] ?? fallbackEmoji;
		onAddCustom({ id: `${idPrefix}-${Date.now().toString(36)}`, name, emoji });
		customName = '';
		customEmoji = '';
	}
</script>

<div class="option-panel">
	<ul class="option-list" aria-label={label}>
		{#each items as item (item.id)}
			<li>
				<button
					type="button"
					class="option"
					class:on={item.id === selectedId}
					aria-pressed={item.id === selectedId}
					onclick={() => onSelect(item.id)}
				>
					<span class="option-emoji">{item.emoji}</span>
					<span class="option-name">{item.name}</span>
					{#if item.id === selectedId}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="option-check" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
	<div class="option-custom">
		<label class="option-custom-label" for="option-custom-name-{idPrefix}">Or add your own</label>
		<div class="row gap-6">
			<input
				class="input option-custom-emoji mono"
				bind:value={customEmoji}
				maxlength="4"
				placeholder={fallbackEmoji}
				aria-label="Custom emoji"
			/>
			<input
				id="option-custom-name-{idPrefix}"
				class="input option-custom-name"
				bind:value={customName}
				placeholder="Label"
				autocomplete="off"
			/>
			<button
				type="button"
				class="btn btn-primary option-custom-apply"
				onclick={commitCustom}
				disabled={!customName.trim()}
			>
				Add
			</button>
		</div>
	</div>
</div>

<style>
	.option-list {
		list-style: none;
		margin: 0;
		padding: 0 8px;
	}

	.option-list li + li {
		border-top: 1px solid var(--line);
	}

	.option {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 4px;
		width: 100%;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.option-emoji {
		font-size: 18px;
		width: 28px;
		text-align: center;
	}

	.option-name {
		flex: 1;
		font-size: 14px;
		font-weight: 500;
	}

	.option.on .option-name {
		color: var(--accent);
	}

	.option-check {
		width: 18px;
		height: 18px;
		color: var(--accent);
	}

	.option-custom {
		padding: 12px 12px 14px;
		border-top: 1px solid var(--line);
	}

	.option-custom-label {
		display: block;
		font-size: 12px;
		color: var(--ink-2);
		margin-bottom: 8px;
	}

	.option-custom-emoji {
		width: 56px;
		padding: 8px 10px;
		font-size: 16px;
		text-align: center;
	}

	.option-custom-name {
		flex: 1;
		padding: 8px 12px;
		font-size: 13px;
	}

	.option-custom-apply {
		padding: 8px 16px;
		font-size: 13px;
	}

	.option-custom-apply:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
