<script lang="ts">
	import LogoMark from '$lib/components/LogoMark.svelte';
	import { SOURCE_URL } from './links';
</script>

<nav class="top-bar" aria-label="Kostos">
	<a class="logo" href="/">
		<span class="logo-tile"><LogoMark size={24} strokeWidth={3} /></span>
		<span class="logo-name wordmark">kostos</span>
	</a>
	<a class="source" href={SOURCE_URL} target="_blank" rel="noopener">GitHub</a>
</nav>

<style>
	.top-bar { display: flex; align-items: center; justify-content: space-between; width: min(100% - 2rem, 68rem); margin-inline: auto; padding-block: 1.25rem; }
	.logo { display: flex; align-items: center; gap: 0.6rem; color: var(--ink); text-decoration: none; }
	.logo-tile { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 0.65rem; background: var(--accent); color: var(--accent-ink); }
	.logo-name { font-size: 1.5rem; }
	.source { color: var(--ink-2); font-size: 0.9rem; text-decoration: none; }
	@media (hover: hover) {
		.source:hover { color: var(--ink); }
	}
</style>
