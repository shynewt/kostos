<script lang="ts">
	type Props = {
		value: string;
		maxLength?: number;
		placeholder?: string;
	};

	let { value = $bindable(), maxLength = 280, placeholder = 'Optional context' }: Props = $props();

	let textarea = $state<HTMLTextAreaElement | null>(null);

	// it only mounts when the person asks to write a note, so go straight to typing
	$effect(() => textarea?.focus());

	// one line to start, then taller with each line; max-height takes over with a scrollbar
	$effect(() => {
		void value;
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight}px`;
	});
</script>

<div class="notes">
	<textarea
		bind:this={textarea}
		class="input notes-input"
		bind:value
		maxlength={maxLength}
		{placeholder}
		rows="1"
		aria-label="Note"
	></textarea>
	<span class="dim note-count">{value.length} / {maxLength}</span>
</div>

<style>
	.notes {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 12px 12px;
	}

	.notes-input {
		padding: 12px;
		font-size: 14px;
		line-height: 1.45;
		resize: none;
		max-height: 40dvh;
		font-family: var(--font-sans);
	}

	.note-count {
		align-self: flex-end;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
</style>
