<script lang="ts">
	import LogoBrush from './LogoBrush.svelte';

	type Props = {
		label?: string;
		hint?: string;
	};

	let { label, hint }: Props = $props();
</script>

<div class="screen loading-screen">
	<div class="loading-mark" aria-hidden="true"><LogoBrush size={38} /></div>
	{#if label}<p class="dim mono loading-label">{label}</p>{/if}
	{#if hint}<p class="dim loading-hint">{hint}</p>{/if}
</div>

<style>
	.loading-screen {
		justify-content: center;
		align-items: center;
		text-align: center;
		gap: 14px;
		padding: 24px;
	}

	.loading-mark {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 18px;
		background: var(--accent);
		color: var(--accent-ink);
	}

	@media (prefers-reduced-motion: no-preference) {
		.loading-mark { animation: pulse 1.4s ease-in-out infinite; }
	}

	.loading-label {
		font-size: 12px;
		letter-spacing: 0.06em;
		margin: 0;
	}

	.loading-hint {
		font-size: 12px;
		max-width: 280px;
		line-height: 1.5;
		margin: 0;
	}

	@keyframes pulse {
		0%, 100% { transform: scale(0.92); opacity: 0.75; }
		50% { transform: scale(1); opacity: 1; }
	}
</style>
