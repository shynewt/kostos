<script lang="ts">
	import { iosInstallHint } from '$lib/install.svelte';

	$effect(() => iosInstallHint.check());
</script>

{#if iosInstallHint.visible}
	<aside class="hint" aria-label="Install Kostos">
		<img class="icon" src="/icon.svg" alt="" width="40" height="40" />
		<p class="text">
			<strong>Install Kostos on your iPhone</strong>
			Tap
			<svg class="share" viewBox="0 0 24 24" role="img" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" /></svg>
			then <em>Add to Home Screen</em>
		</p>
		<button type="button" class="close" aria-label="Don’t show this again" onclick={() => iosInstallHint.dismiss()}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
	</aside>
{/if}

<style>
	.hint {
		position: fixed; z-index: 20; inset-inline: 0.75rem; bottom: calc(0.75rem + env(safe-area-inset-bottom));
		display: flex; align-items: center; gap: 0.75rem; max-width: 26rem; margin-inline: auto; padding: 0.75rem 0.5rem 0.75rem 0.85rem;
		border: 1px solid var(--line-2); border-radius: 1.25rem; background: color-mix(in oklab, var(--bg-2) 88%, transparent);
		backdrop-filter: blur(12px); box-shadow: 0 0.75rem 2.5rem color-mix(in oklab, black 35%, transparent);
		color: var(--ink-2); font-size: 0.875rem; line-height: 1.35;
	}
	@media (prefers-reduced-motion: no-preference) {
		.hint { animation: rise 0.35s ease-out both; }
		@keyframes rise { from { opacity: 0; translate: 0 1rem; } }
	}
	.icon { flex: none; border-radius: 0.65rem; }
	.text { flex: 1; margin: 0; min-width: 0; }
	.text strong { display: block; color: var(--ink); font-weight: 600; }
	.text em { font-style: normal; color: var(--ink); font-weight: 600; }
	.share { width: 1.15em; height: 1.15em; vertical-align: -0.2em; fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
	.close { flex: none; display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border: 0; border-radius: 50%; background: none; color: var(--ink-3); cursor: pointer; }
	.close svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
	.close:focus-visible { outline: 2px solid var(--accent); }
</style>
