<script lang="ts">
	import type { Snippet } from 'svelte';
	import SiteFooter from './SiteFooter.svelte';
	import SiteTopBar from './SiteTopBar.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="screen article-screen">
	<div class="scroll article-scroll">
		<SiteTopBar />
		<article class="article">
			{@render children()}
		</article>
		<aside class="cta" aria-label="Try Kostos">
			<p class="cta-title">Split your next bill with Kostos</p>
			<p class="cta-body">Free, open source and end-to-end encrypted. No account needed.</p>
			<div class="cta-actions">
				<a class="btn btn-primary" href="/new">Create a group</a>
				<a class="btn" href="/">See all features</a>
			</div>
		</aside>
		<SiteFooter />
	</div>
</div>

<style>
	.article-screen { max-width: none; }
	.article-scroll { padding: 0 0 2rem; }
	.article { width: min(100% - 2rem, 44rem); margin: clamp(1.5rem, 1rem + 3vw, 3.5rem) auto 0; line-height: 1.6; font-size: 1.05rem; color: var(--ink-2); }
	.article :global(h1) {
		margin: 0 0 1.25rem; color: var(--ink); font-family: var(--font-display); font-weight: 400;
		font-size: clamp(2.5rem, 1.6rem + 3.5vw, 4.25rem); line-height: 1; letter-spacing: -0.02em; text-wrap: balance;
	}
	.article :global(h2) {
		margin: 3rem 0 1rem; color: var(--ink); font-family: var(--font-display); font-weight: 400;
		font-size: clamp(1.75rem, 1.3rem + 1.8vw, 2.5rem); line-height: 1.1; text-wrap: balance;
	}
	.article :global(h3) { margin: 1.75rem 0 0.5rem; color: var(--ink); font-size: 1.1rem; font-weight: 600; }
	.article :global(p) { margin: 0 0 1rem; text-wrap: pretty; }
	.article :global(.lede) { font-size: clamp(1.1rem, 1rem + 0.4vw, 1.3rem); color: var(--ink); }
	.article :global(ul), .article :global(ol) { margin: 0 0 1.25rem; padding-left: 1.25rem; }
	.article :global(li) { margin-bottom: 0.5rem; }
	.article :global(li::marker) { color: var(--accent); }
	.article :global(strong) { color: var(--ink); font-weight: 600; }
	.article :global(a) { color: var(--ink); text-underline-offset: 0.2em; }
	.article :global(.updated) { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
	.article :global(.updated.dateline) { font-family: var(--font-sans); font-size: 0.875rem; letter-spacing: 0; text-transform: none; }

	.cta {
		display: grid; gap: 0.5rem; justify-items: center; width: min(100% - 2rem, 44rem); margin: 4rem auto 0; padding: 2rem 1.5rem;
		border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent); border-radius: 1.5rem; text-align: center;
		background: color-mix(in oklab, var(--accent) 10%, var(--bg-2));
	}
	.cta-title { margin: 0; font-family: var(--font-display); font-size: clamp(1.75rem, 1.4rem + 1.4vw, 2.4rem); line-height: 1.1; color: var(--ink); text-wrap: balance; }
	.cta-body { margin: 0 0 0.75rem; color: var(--ink-2); }
	.cta-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.75rem; }
	.cta-actions .btn { flex: 1 1 11rem; max-width: 15rem; }
</style>
