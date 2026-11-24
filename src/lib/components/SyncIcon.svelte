<script lang="ts">
	import type { SyncTone } from '$lib/sync/describe';
	let { tone }: { tone: SyncTone } = $props();
</script>

{#if tone === 'busy'}
	<span class="spinner" aria-hidden="true"></span>
{:else if tone === 'ok'}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19H8.5a6 6 0 1 1 5.6-8.2h1.4a4.1 4.1 0 1 1 2 8.2z" /><path d="M9.2 14.2l2 2 3.6-3.6" /></svg>
{:else if tone === 'offline'}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M5.6 7.4A6 6 0 0 0 8.5 19h9" /><path d="M20.6 16.7a4.1 4.1 0 0 0-3.1-5.9h-1.4A6 6 0 0 0 10 5.1" /></svg>
{:else if tone === 'idle'}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="3" /><path d="M11 17.5h2" /></svg>
{:else}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></svg>
{/if}

<style>
	svg { width: 100%; height: 100%; display: block; }
	.spinner {
		display: block; width: 100%; height: 100%; box-sizing: border-box; border-radius: 50%;
		border: 2px solid color-mix(in oklab, currentColor 22%, transparent);
		border-top-color: currentColor;
		animation: spin 900ms linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	/* a still quarter ring keeps reading as "in progress" without the motion */
	@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
