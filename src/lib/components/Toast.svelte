<script lang="ts">
	import { currentToast, dismissToast } from '$lib/toast.svelte';

	const toast = $derived(currentToast());
	let running = $state(false);

	async function runAction() {
		const action = toast?.action;
		if (!toast || !action || running) return;
		// the action may show its own message; only close the toast that was tapped
		const tappedId = toast.id;
		running = true;
		try {
			await action.run();
			dismissToast(tappedId);
		} finally {
			running = false;
		}
	}
</script>

<div class="toast-region" role="status" aria-live="polite">
	{#if toast}
		{#key toast.id}
			<div class="toast">
				<span class="toast-text">{toast.text}</span>
				{#if toast.action}
					<button type="button" class="toast-action" onclick={runAction} disabled={running}>{toast.action.label}</button>
				{/if}
			</div>
		{/key}
	{/if}
</div>

<style>
	.toast-region {
		position: fixed;
		left: 16px;
		right: 16px;
		bottom: calc(20px + env(safe-area-inset-bottom, 0px));
		max-width: 448px;
		margin-inline: auto;
		z-index: 1100;
		pointer-events: none;
	}

	/* sit above the tab bar and its raised add button */
	:global(body:has(.tabbar)) .toast-region {
		bottom: calc(100px + env(safe-area-inset-bottom, 0px));
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 6px 6px 16px;
		min-height: 48px;
		background: var(--ink);
		color: var(--bg);
		border-radius: var(--radius);
		box-shadow: 0 10px 30px -10px color-mix(in oklab, black 55%, transparent);
		pointer-events: auto;
		animation: toast-rise 0.2s ease-out;
	}

	.toast-text {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 500;
	}

	.toast-action {
		padding: 10px 14px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--bg);
		font: inherit;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.toast-action:focus-visible {
		background: color-mix(in oklab, var(--bg) 14%, transparent);
	}

	@media (hover: hover) {
		.toast-action:hover {
			background: color-mix(in oklab, var(--bg) 14%, transparent);
		}
	}

	.toast-action:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	@keyframes toast-rise {
		from { opacity: 0; transform: translateY(12px); }
		to { opacity: 1; transform: translateY(0); }
	}

	@media (prefers-reduced-motion: reduce) {
		.toast { animation: none; }
	}
</style>
