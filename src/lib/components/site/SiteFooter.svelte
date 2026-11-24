<script lang="ts">
	import { version } from '$app/environment';
	import { GUIDE_LINKS, SOURCE_URL } from './links';
</script>

<footer class="footer">
	<nav class="guides" aria-label="Guides">
		{#each GUIDE_LINKS as link (link.href)}<a href={link.href}>{link.label}</a>{/each}
	</nav>
	<div class="meta">
		<span>Kostos v{version}</span>
		<a href={SOURCE_URL} target="_blank" rel="noopener">Source code</a>
		<a href="{SOURCE_URL}#docker--self-host" target="_blank" rel="noopener">Host it yourself</a>
	</div>
</footer>

<style>
	.footer {
		display: grid; gap: 0.75rem; justify-items: center; width: min(100% - 2rem, 68rem); margin: 5rem auto 0; padding-top: 1.5rem;
		border-top: 1px solid var(--line); color: var(--ink-3); font-size: 0.85rem; text-align: center;
	}
	.guides, .meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem 1.5rem; }
	a { color: var(--ink-2); }
</style>
