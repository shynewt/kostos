<script lang="ts">
	import type { Snippet } from 'svelte';
	import SiteFooter from '$lib/components/site/SiteFooter.svelte';
	import SiteTopBar from '$lib/components/site/SiteTopBar.svelte';
	import ComparisonTable from './ComparisonTable.svelte';
	import { FAQS, HIGHLIGHTS, MORE_FEATURES, SHOWCASE } from './content';

	type Props = {
		inviteOpen: boolean;
		inviteForm: Snippet;
		demoLoading: boolean;
		onTryDemo: () => void;
	};

	let { inviteOpen = $bindable(), inviteForm, demoLoading, onTryDemo }: Props = $props();

</script>

<div class="marketing">
	<SiteTopBar />

	<header class="wrap hero">
		<div class="hero-text">
			<h1>Split group expenses with friends, privately</h1>
			<p class="lede">Free and open source. Encrypted on your phone before anything syncs, so no server can read your expenses. Share a link and everyone’s in.</p>
			<ul class="chips" aria-label="Highlights">
				{#each HIGHLIGHTS as highlight (highlight.label)}
					<li><span aria-hidden="true">{highlight.emoji}</span>{highlight.label}</li>
				{/each}
			</ul>
			<div class="actions">
				<div class="cta-row">
					<a class="btn btn-primary cta" href="/new">Create a group</a>
					<button type="button" class="btn cta join-toggle" aria-expanded={inviteOpen} onclick={() => (inviteOpen = !inviteOpen)}>Join a group</button>
				</div>
				{#if inviteOpen}<div class="invite">{@render inviteForm()}</div>{/if}
				<button type="button" class="demo" onclick={onTryDemo} disabled={demoLoading}>
					<span class="demo-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 7.5v9l7.5-4.5z" /></svg></span>
					<span class="demo-text">{#if demoLoading}Loading the demo…{:else}Just looking? <strong>Try the live demo</strong>{/if}</span>
				</button>
			</div>
		</div>
		<figure class="phone">
			<img
				src="/landing/home.webp"
				width="780"
				height="1560"
				alt="A Kostos group's home screen: you're owed €222.92, with Bob, Carol and Dan's transfers listed to settle up"
				fetchpriority="high"
			/>
		</figure>
	</header>

	<section class="wrap" aria-labelledby="compare">
		<p class="kicker">How it compares</p>
		<h2 id="compare">A private Splitwise alternative</h2>
		<ComparisonTable />
		<nav class="compare-links" aria-label="Full comparisons">
			<a class="compare-link" href="/splitwise-alternative">Kostos vs Splitwise <span aria-hidden="true">→</span></a>
			<a class="compare-link" href="/tricount-alternative">Kostos vs Tricount <span aria-hidden="true">→</span></a>
		</nav>
	</section>

	<section class="wrap" aria-labelledby="features">
		<p class="kicker">Everything it does</p>
		<h2 id="features">Features</h2>
		<div class="showcase">
			{#each SHOWCASE as feature, index (feature.title)}
				<article class="feature" class:flip={index % 2 === 1}>
					<div class="shot">
						<img src={feature.image} width={feature.width} height={feature.height} alt={feature.alt} loading="lazy" decoding="async" />
					</div>
					<div class="copy">
						<h3>{feature.title}</h3>
						<p>{feature.body}</p>
					</div>
				</article>
			{/each}
		</div>
		<h3 class="more-title">And more</h3>
		<ul class="chips more" aria-label="More features">
			{#each MORE_FEATURES as feature (feature.label)}
				<li><span aria-hidden="true">{feature.emoji}</span>{feature.label}</li>
			{/each}
		</ul>
	</section>

	<section class="wrap narrow" aria-labelledby="faq">
		<p class="kicker">Questions</p>
		<h2 id="faq">FAQ</h2>
		<div class="faq">
			{#each FAQS as item (item.question)}
				<details name="faq">
					<summary>{item.question}</summary>
					<p>{item.answer}</p>
				</details>
			{/each}
		</div>
	</section>

	<section class="wrap closing" aria-labelledby="start">
		<h2 id="start">Start splitting in a few seconds</h2>
		<a class="btn btn-primary cta" href="/new">Create a group</a>
		<p>No account needed.</p>
	</section>

	<SiteFooter />
</div>

<style>
	.marketing {
		--gutter: 1rem;
		padding-bottom: 2rem;
		background: radial-gradient(60rem 36rem at 85% -10%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%);
		line-height: 1.5;
	}
	.wrap { width: min(100% - 2 * var(--gutter), 68rem); margin-inline: auto; }
	.narrow { width: min(100% - 2 * var(--gutter), 46rem); }

	h1, h2, h3 { text-wrap: balance; }
	h2 { margin: 0 0 1.75rem; font-family: var(--font-display); font-weight: 400; font-size: clamp(2rem, 1.4rem + 2.5vw, 3.25rem); line-height: 1.05; letter-spacing: -0.01em; }
	p { margin: 0; text-wrap: pretty; }
	section { margin-top: clamp(4rem, 3rem + 4vw, 6.5rem); }
	.kicker { margin-bottom: 0.5rem; font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }


	.hero { display: grid; gap: 3rem; align-items: center; padding-top: clamp(1.5rem, 1rem + 3vw, 3.5rem); }
	@media (min-width: 56rem) { .hero { grid-template-columns: 1.15fr 1fr; } }
	h1 {
		margin: 0 0 1rem; font-family: var(--font-display); font-weight: 400;
		font-size: clamp(2.75rem, 1.6rem + 4.5vw, 5.25rem); line-height: 0.98; letter-spacing: -0.02em;
	}
	.lede { max-width: 34rem; color: var(--ink-2); font-size: clamp(1.1rem, 1rem + 0.4vw, 1.3rem); }
	.chips { list-style: none; margin: 1.5rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; max-width: 36rem; }
	.chips li {
		display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.8rem; border: 1px solid var(--line-2); border-radius: 999px;
		background: var(--bg-2); color: var(--ink); font-size: 0.875rem; white-space: nowrap;
	}
	/* the two buttons, the join box and the demo link share one width so their edges line up */
	.actions { display: grid; gap: 1rem; max-width: 34rem; margin-top: 2rem; }
	.cta-row { display: flex; flex-wrap: wrap; gap: 0.75rem; }
	.cta { flex: 1 1 12rem; }
	.cta:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
	.join-toggle[aria-expanded='true'] { border-color: var(--accent); }
	.demo {
		display: flex; align-items: center; gap: 0.55rem; justify-self: center; padding: 0.25rem 0.9rem 0.25rem 0.3rem;
		border: 1px solid color-mix(in oklab, var(--line) 70%, transparent); border-radius: 999px; background: transparent; color: var(--ink-2);
		font: inherit; font-size: 0.875rem; cursor: pointer;
	}
	.demo strong { color: var(--ink); font-weight: 600; }
	.demo:hover { border-color: var(--line-2); background: var(--bg-2); }
	.demo:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
	.demo:disabled { cursor: progress; }
	.demo-icon { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: color-mix(in oklab, var(--accent) 18%, transparent); }
	.demo-icon svg { width: 0.95rem; height: 0.95rem; fill: var(--accent); }

	.phone { margin: 0; justify-self: center; width: min(100%, 20rem); padding: 0.6rem; border: 1px solid var(--line-2); border-radius: 2.4rem; background: var(--bg-2);
		box-shadow: 0 1.5rem 4rem -1.5rem color-mix(in oklab, var(--accent) 35%, transparent), 0 0.5rem 1.5rem color-mix(in oklab, black 25%, transparent); }
	.phone img, .shot img { display: block; width: 100%; height: auto; }
	.phone img { border-radius: 1.9rem; }

	.showcase { display: grid; gap: clamp(2.5rem, 2rem + 3vw, 4.5rem); }
	.feature { display: grid; gap: 1.5rem; align-items: center; }
	@media (min-width: 48rem) {
		.feature { grid-template-columns: 1fr 1fr; gap: 4rem; }
		.feature.flip .shot { order: 2; }
	}
	.shot { justify-self: center; width: min(100%, 22rem); overflow: hidden; border: 1px solid var(--line-2); border-radius: 1.5rem; background: var(--bg-2); }
	.copy { max-width: 28rem; }
	.copy h3 { margin: 0 0 0.6rem; font-family: var(--font-display); font-weight: 400; font-size: clamp(1.75rem, 1.4rem + 1.5vw, 2.5rem); line-height: 1.05; }
	.copy p { color: var(--ink-2); font-size: clamp(1.05rem, 1rem + 0.25vw, 1.15rem); }
	.more-title { margin: clamp(3rem, 2.5rem + 2vw, 4.5rem) 0 1rem; font-size: 1.1rem; font-weight: 600; }
	.chips.more { max-width: none; margin-top: 0; }

	.faq { border-top: 1px solid var(--line); }
	.faq details { border-bottom: 1px solid var(--line); }
	.faq summary {
		list-style: none; display: flex; align-items: center; gap: 0.75rem; padding-block: 1.1rem; cursor: pointer;
		font-size: 1.05rem; font-weight: 600;
	}
	.faq summary::-webkit-details-marker { display: none; }
	.faq summary::before {
		content: '+'; flex: none; display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%;
		border: 1px solid var(--line-2); color: var(--accent); font-weight: 400; line-height: 1;
	}
	.faq details[open] summary::before { content: '−'; }
	.faq details p { padding: 0 0 1.25rem 2.25rem; max-width: 40rem; color: var(--ink-2); }
	.faq details::details-content { interpolate-size: allow-keywords; overflow: clip; contain: layout; }
	.faq details:not([open])::details-content { block-size: 0; }
	@media (prefers-reduced-motion: no-preference) {
		.faq details::details-content { transition: block-size 0.25s ease-in-out, content-visibility 0.25s allow-discrete; }
	}

	.compare-links { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.25rem; }
	.compare-link {
		display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.55rem 1rem; border: 1px solid var(--line-2); border-radius: 999px;
		color: var(--ink); font-size: 0.9rem; font-weight: 600; text-decoration: none;
	}
	.compare-link span { color: var(--accent); }
	.compare-link:hover { background: var(--bg-2); border-color: color-mix(in oklab, var(--accent) 45%, var(--line-2)); }
	.compare-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
	.closing { display: grid; justify-items: center; gap: 1rem; text-align: center; }
	.closing h2 { margin: 0; }
	.closing .cta { width: min(100%, 16rem); }
	.closing p { color: var(--ink-3); font-size: 0.9rem; }

</style>
