<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		onclose: () => void;
		/** blocks closing, e.g. while a save is in flight */
		locked?: boolean;
		children: Snippet;
	};

	let { title, onclose, locked = false, children }: Props = $props();

	const sheetId = $props.id();
	const titleId = `${sheetId}-title`;

	function close() {
		if (!locked) onclose();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
	}

	function focusOnOpen(node: HTMLElement) {
		node.focus({ preventScroll: true });
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="sheet-backdrop" role="presentation" onclick={close}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1" use:focusOnOpen>
	<div class="grabber" aria-hidden="true"></div>
	<h2 class="sheet-title" id={titleId}>{title}</h2>
	{@render children()}
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		background: color-mix(in oklab, black 55%, transparent);
		z-index: 1100;
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
		max-height: 92dvh;
		overflow-y: auto;
		background: var(--bg-2);
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		border: 1px solid var(--line);
		border-bottom: 0;
		padding: 6px 20px calc(20px + max(env(safe-area-inset-bottom, 0px), var(--math-toolbar-space, 0px)));
		z-index: 1101;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		outline: none;
		box-shadow: 0 -10px 30px color-mix(in oklab, black 35%, transparent);
		animation: slide-up 0.18s ease-out;
	}

	.grabber {
		width: 36px;
		height: 4px;
		border-radius: 999px;
		background: var(--line-2);
		margin: 6px auto 14px;
	}

	.sheet-title {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.01em;
		text-align: center;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slide-up {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}
</style>
