<script lang="ts">
	import type { SyncTone } from '$lib/sync/describe';
	let { tone }: { tone: SyncTone } = $props();
</script>

{#if tone === 'busy'}
	<span class="spinner" aria-hidden="true"></span>
{:else if tone === 'ok'}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
{:else if tone === 'offline'}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M8.5 16.4a5 5 0 0 1 7 0" /><path d="M5 12.9a10 10 0 0 1 3.2-2.1" /><path d="M10.7 5.1A15 15 0 0 1 22 9" /><path d="M2 9a15 15 0 0 1 2.4-1.9" /><path d="M12 20h.01" /></svg>
{:else if tone === 'idle'}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="3" /><path d="M11 17.5h2" /></svg>
{:else}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6.5" /><path d="M12 17h.01" /></svg>
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
	@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
</style>
