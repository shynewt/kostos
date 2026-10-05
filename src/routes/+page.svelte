<script lang="ts">
	import { relativeTime } from '$lib/sync/status';
	import { version } from '$app/environment';
	import { goto } from '$app/navigation';
	import { enterDemo } from '$lib/demo';
	import { PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import { formatAmount } from '$lib/money';
	import { listProjects, type ProjectRef } from '$lib/storage';
	import { parseToken } from '$lib/token';

	let projects = $state<ProjectRef[]>([]);
	let tokenInputOpen = $state(false);
	let token = $state('');
	let error = $state<string | null>(null);
	let demoLoading = $state(false);

	async function tryDemo() {
		if (demoLoading) return;
		demoLoading = true;
		try {
			await enterDemo();
		} finally {
			demoLoading = false;
		}
	}

	$effect(() => {
		projects = listProjects();
	});

	const hasProjects = $derived(projects.length > 0);

	function onJoinSubmit(event: SubmitEvent) {
		event.preventDefault();
		const parsed = parseToken(token);
		if (!parsed) {
			error = 'That token does not look right. Paste the full invite link, or `ROOM.SECRET`.';
			return;
		}
		error = null;
		goto(`/join?room=${encodeURIComponent(parsed.roomId)}#${parsed.secret}`);
	}

	function relativeDay(ts: number | undefined): string {
		if (!ts) return '';
		const days = Math.round((Date.now() - ts) / (86_400 * 1000));
		if (days <= 0) return 'today';
		if (days === 1) return 'yesterday';
		if (days < 7) return `${days} days ago`;
		if (days < 30) return `${Math.round(days / 7)}w ago`;
		return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	}
</script>

<svelte:head>
	<title>Kostos · Group expense splitter, no accounts needed</title>
	<meta
		name="description"
		content="Kostos is a free group expense splitter. Share a token, split bills with friends, sync live across devices. No accounts, end-to-end encrypted, open source, works offline."
	/>
	{#if !hasProjects}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html `<script type="application/ld+json">${JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'SoftwareApplication',
			name: 'Kostos',
			description:
				'Free open-source group expense splitter. Share a token, split bills with friends, sync live across devices. No accounts, end-to-end encrypted, works offline.',
			applicationCategory: 'FinanceApplication',
			operatingSystem: 'Web, iOS, Android',
			offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
		})}</script>`}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html `<script type="application/ld+json">${JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: [
				{
					'@type': 'Question',
					name: 'Is Kostos free?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'Yes. Kostos is free and open source. There is no paid tier or premium feature.'
					}
				},
				{
					'@type': 'Question',
					name: 'Do I need an account?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'No. Each group is identified by a secret token. Share the token to invite others; anyone with it joins the group. No email, no password, no sign-up.'
					}
				},
				{
					'@type': 'Question',
					name: 'How is my data protected?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'Every sync message is AES-GCM encrypted in your browser before it reaches the sync server. The server only stores opaque ciphertext and never has access to the secret token.'
					}
				},
				{
					'@type': 'Question',
					name: 'Does Kostos work offline?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'Yes. Add expenses while disconnected; they save to your device immediately and sync to the group when you come back online.'
					}
				},
				{
					'@type': 'Question',
					name: 'How do I split a bill?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'Pick a split mode: evenly between selected members, by weighted shares, or by precise per-person amounts. Math expressions like 50/3 or (120+5)/4 work inside any amount field.'
					}
				},
				{
					'@type': 'Question',
					name: 'Can multiple people use the same group from different devices?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: 'Yes. Anyone with the shared project token can join from another device. Expenses, settlements, and member changes sync live between every device that holds the token.'
					}
				}
			]
		})}</script>`}
	{/if}
</svelte:head>

<div class="screen" data-page="landing">
	{#if hasProjects}
		<a class="icon-btn settings-link" href="/settings" aria-label="Settings" title="Settings">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
				<circle cx="12" cy="12" r="2.6" />
				<path d="M19 12a7 7 0 0 0-.16-1.5l2.05-1.58-2-3.46-2.43.83a7 7 0 0 0-2.59-1.5L13.5 2h-3l-.37 2.79a7 7 0 0 0-2.59 1.5l-2.43-.83-2 3.46L5.16 10.5A7 7 0 0 0 5 12a7 7 0 0 0 .16 1.5l-2.05 1.58 2 3.46 2.43-.83a7 7 0 0 0 2.59 1.5L10.5 22h3l.37-2.79a7 7 0 0 0 2.59-1.5l2.43.83 2-3.46-2.05-1.58A7 7 0 0 0 19 12z" />
			</svg>
		</a>
	{/if}
	<div class="scroll landing-scroll">
		<header class="col brand">
			<div class="brand-mark" role="img" aria-label="Kostos logo">
				<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M5 6h14M5 12h14M5 18h9" />
					<circle cx="19" cy="18" r="2.5" fill="currentColor" stroke="none" />
				</svg>
			</div>
			<h1 class="h1 brand-name">Kostos</h1>
			{#if !hasProjects}
				<h2 class="hero-headline">Free, end-to-end encrypted, open source expense splitter.</h2>
			{/if}
		</header>

		{#snippet tokenForm()}
			<form class="card token-form" onsubmit={onJoinSubmit}>
				<div class="eyebrow" style="margin-bottom: 8px;">Paste a group token</div>
				<div class="input-wrap">
					<input
						class="input token-input"
						placeholder="PRT-XXXX-XXXX"
						bind:value={token}
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						aria-invalid={error ? 'true' : 'false'}
					/>
					<button type="button" class="icon-btn qr-btn" aria-label="Scan QR code" onclick={() => goto('/scan')}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
							<rect x="3" y="3" width="7" height="7" rx="1" />
							<rect x="14" y="3" width="7" height="7" rx="1" />
							<rect x="3" y="14" width="7" height="7" rx="1" />
							<rect x="14" y="14" width="3" height="3" />
							<rect x="18" y="18" width="3" height="3" />
							<rect x="14" y="18" width="3" height="3" />
							<rect x="18" y="14" width="3" height="3" />
						</svg>
					</button>
				</div>
				<div class="dim hint">OR PASTE A FULL LINK FROM YOUR INVITE</div>
				{#if error}
					<div class="error" role="alert">{error}</div>
				{/if}
				<button type="submit" class="btn btn-primary btn-block continue-btn">
					Continue
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				</button>
			</form>
		{/snippet}

		{#if hasProjects}
			<section class="projects-section">
				<div class="section-head">
					<div class="eyebrow">Your groups</div>
					<span class="dim mono section-count">{projects.length}</span>
				</div>
				<div class="card projects-list">
					{#each projects as p, i (p.roomId)}
						{#if i > 0}<hr class="hairline" style="margin-left: 56px;" />{/if}
						<a class="project-row" href="/p/{p.roomId}">
							<span
								class="project-tile"
								style="background: {tileBackground(p.color ?? 'lime')}; color: {PROJECT_COLOR_VALUES[
									p.color ?? 'lime'
								]};"
							>
								{p.emoji ?? '🏠'}
							</span>
							<span class="col project-text">
								<span class="project-name">{p.name}</span>
								<span class="dim mono project-meta">
									{p.roomId}{#if p.lastActiveAt}<span class="meta-sep">·</span>{relativeDay(
											p.lastActiveAt
										)}{/if}
								</span>
							</span>
							{#if p.net !== undefined && p.netSymbol}
								<span class="col project-balance">
									{#if p.net === 0}
										<span class="dim mono pb-label">settled up</span>
									{:else}
										<span
											class="num pb-amount"
											class:tone-owed={p.net > 0}
											class:tone-owe={p.net < 0}
										>
											{formatAmount(Math.abs(p.net), p.netSymbol, p.netCurrency)}
										</span>
										<span class="dim mono pb-label">{p.net > 0 ? 'owed to you' : 'you owe'}</span>
									{/if}
									<span class="dim mono pb-label">Saved · {p.lastSyncedAt ? relativeTime(p.lastSyncedAt, Date.now()) : 'not synced yet'}</span>
								</span>
							{/if}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="project-chevron">
								<path d="M9 6l6 6-6 6" />
							</svg>
						</a>
					{/each}
				</div>
			</section>

			<div class="row gap-8 action-row">
				<a class="btn action-btn" href="/new">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
					<span>New group</span>
				</a>
				<button
					class="btn action-btn"
					type="button"
					aria-expanded={tokenInputOpen}
					onclick={() => (tokenInputOpen = !tokenInputOpen)}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
					<span>Join with token</span>
				</button>
			</div>

			{#if tokenInputOpen}
				{@render tokenForm()}
			{/if}
		{:else}
			<div class="cta-stack">
				<a class="btn btn-primary btn-block primary-cta" href="/new">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
					<span>Create a group</span>
				</a>

				<button
					type="button"
					class="btn btn-block secondary-cta"
					aria-expanded={tokenInputOpen}
					onclick={() => (tokenInputOpen = !tokenInputOpen)}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
					<span>Join a group</span>
				</button>

				<button type="button" class="btn btn-block demo-cta" onclick={tryDemo} disabled={demoLoading}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" /></svg>
					<span>{demoLoading ? 'Loading the demo…' : 'Explore live demo'}</span>
				</button>
			</div>

			{#if tokenInputOpen}
				{@render tokenForm()}
			{/if}

			<section class="value-props" aria-labelledby="why-kostos">
				<h2 id="why-kostos" class="section-title">Why pick Kostos to split expenses</h2>
				<div class="value-card featured">
					<div class="value-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 11V8a6 6 0 0 1 12 0v3" /><rect x="4" y="11" width="16" height="10" rx="2" /></svg>
					</div>
					<div class="col">
						<h3 class="value-title">End-to-end encrypted by default</h3>
						<p class="dim value-sub">
							Every sync message is AES-GCM encrypted in your browser before it leaves. The sync
							server only sees opaque ciphertext; the secret token never touches the network.
						</p>
					</div>
				</div>
				<div class="value-card">
					<div class="value-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M5 6h14M5 18h14" /></svg>
					</div>
					<div class="col">
						<h3 class="value-title">No accounts, no email, no sign-up</h3>
						<p class="dim value-sub">
							A group is just a shareable token. Send it; everyone joins. No password reset emails,
							no profile to maintain, no third-party identity provider.
						</p>
					</div>
				</div>
				<div class="value-card">
					<div class="value-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /><circle cx="12" cy="12" r="4" /></svg>
					</div>
					<div class="col">
						<h3 class="value-title">Live sync across every device, works offline</h3>
						<p class="dim value-sub">
							Every device with the token sees the same expenses and balances in real time. Add a
							bill on a plane; it saves locally and syncs the moment you're back online.
						</p>
					</div>
				</div>
				<div class="value-card">
					<div class="value-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
					</div>
					<div class="col">
						<h3 class="value-title">Open source and self-hostable</h3>
						<p class="dim value-sub">
							Inspect the SvelteKit + Y.js codebase, run the sync server yourself, or fork it. No
							vendor lock-in and nothing hidden behind a paid tier.
						</p>
					</div>
				</div>
				<a
					class="source-link"
					href="https://github.com/shynewt/kostos"
					target="_blank"
					rel="noopener"
				>
					<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.4-3.88-1.4-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.45.11-3.03 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.74.12 3.03.74.81 1.18 1.84 1.18 3.1 0 4.44-2.7 5.41-5.27 5.69.41.36.77 1.05.77 2.13v3.16c0 .31.21.67.79.56A11.5 11.5 0 0 0 12 .5z"
						/>
					</svg>
					<span>View source on GitHub</span>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
						<path d="M7 17L17 7M9 7h8v8" />
					</svg>
				</a>
			</section>

			<section class="how-section" aria-labelledby="how-it-works">
				<h2 id="how-it-works" class="section-title">How to split expenses with Kostos</h2>
				<ol class="how-list">
					<li>
						<span class="how-step">1</span>
						<div>
							<h3 class="how-title">Create a group</h3>
							<p class="dim how-body">
								Pick a name, an emoji, a currency, and the people involved. The app generates a
								secret token for the group locally on your device.
							</p>
						</div>
					</li>
					<li>
						<span class="how-step">2</span>
						<div>
							<h3 class="how-title">Share the token</h3>
							<p class="dim how-body">
								Send the share link to anyone you want in the group. They open it, pick their
								member, and join. Multiple devices per person are fine.
							</p>
						</div>
					</li>
					<li>
						<span class="how-step">3</span>
						<div>
							<h3 class="how-title">Log expenses and settle up</h3>
							<p class="dim how-body">
								Add expenses with even, share-based, or precise per-person splits. Kostos
								computes the minimum number of transfers needed to bring everyone back to zero.
							</p>
						</div>
					</li>
				</ol>
			</section>

			<section class="faq-section" aria-labelledby="faq">
				<h2 id="faq" class="section-title">Common questions</h2>
				<details class="faq-item">
					<summary><h3>Is Kostos really free?</h3></summary>
					<p>
						Yes. Kostos is free and open source. There is no paid tier, no ads, and no upsell.
					</p>
				</details>
				<details class="faq-item">
					<summary><h3>Do I need an account?</h3></summary>
					<p>
						No. Each group is identified by a secret token. Share the token to invite others;
						anyone who has it joins the group. No email, no password, no sign-up.
					</p>
				</details>
				<details class="faq-item">
					<summary><h3>How is my data protected?</h3></summary>
					<p>
						Every sync message is AES-GCM encrypted in your browser before it reaches the sync
						server. The server only stores opaque ciphertext and never has access to the secret
						token, so it cannot read your expenses even if compromised.
					</p>
				</details>
				<details class="faq-item">
					<summary><h3>Does Kostos work offline?</h3></summary>
					<p>
						Yes. Add expenses while disconnected; they save to your device immediately and sync to
						the group the next time you come online. Kostos is a PWA, so it installs to your home
						screen and runs without a browser tab.
					</p>
				</details>
				<details class="faq-item">
					<summary><h3>How do I split a bill?</h3></summary>
					<p>
						Pick a split mode: <strong>evenly</strong> between selected members,
						<strong>by weighted shares</strong>, or <strong>by precise per-person amounts</strong>.
						Math expressions like <code>50/3</code> or <code>(120+5)/4</code> work inside any amount
						field, so you can write the calculation instead of pre-computing.
					</p>
				</details>
				<details class="faq-item">
					<summary><h3>Can multiple people use the same group from different devices?</h3></summary>
					<p>
						Yes. Anyone with the shared token can join from another device. Expenses, settlements,
						and member changes sync live between every device that holds the token, with
						conflict-free merging powered by Y.js CRDTs.
					</p>
				</details>
			</section>
		{/if}
		<footer class="version-footer">Kostos v{version}</footer>
	</div>
</div>

<style>
	.landing-scroll {
		padding-top: 36px;
	}

	.settings-link {
		position: absolute;
		top: 14px;
		right: 14px;
		z-index: 2;
	}

	.brand {
		align-items: center;
		margin-bottom: 28px;
	}

	.brand-mark {
		width: 84px;
		height: 84px;
		border-radius: 26px;
		background: var(--accent);
		color: var(--accent-ink);
		display: grid;
		place-items: center;
		box-shadow:
			0 0 90px -12px color-mix(in oklab, var(--accent) 60%, transparent),
			0 18px 44px -16px color-mix(in oklab, var(--accent) 55%, transparent);
	}

	.brand-mark :global(svg) {
		width: 44px;
		height: 44px;
	}

	.brand-name {
		margin-top: 22px;
	}

	.hero-headline {
		margin: 18px 0 0;
		text-align: center;
		font-size: clamp(25px, 6.4vw, 30px);
		font-weight: 600;
		line-height: 1.28;
		letter-spacing: -0.01em;
		color: var(--ink);
	}


	.projects-section {
		margin-bottom: 16px;
	}

	.section-count {
		font-size: 11px;
	}

	.projects-list {
		padding: 4px;
	}

	.project-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		text-decoration: none;
		color: inherit;
	}

	.project-tile {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		font-size: 22px;
		flex-shrink: 0;
	}

	.project-text {
		flex: 1;
		min-width: 0;
		gap: 2px;
	}

	.project-name {
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.project-meta {
		font-size: 11px;
		display: inline-flex;
		gap: 6px;
		align-items: center;
	}

	.meta-sep {
		opacity: 0.5;
	}

	.project-balance {
		align-items: flex-end;
		gap: 1px;
		flex-shrink: 0;
		text-align: right;
	}

	.pb-amount {
		font-size: 13px;
		font-weight: 600;
	}

	.pb-label {
		font-size: 10px;
		letter-spacing: 0.02em;
	}

	.project-chevron {
		width: 16px;
		height: 16px;
		color: var(--ink-3);
		flex-shrink: 0;
	}

	.action-row {
		align-items: stretch;
	}

	.action-btn {
		flex: 1;
		justify-content: center;
	}



	.section-title {
		font-family: var(--font-display);
		font-size: 23px;
		font-weight: 400;
		letter-spacing: -0.015em;
		margin: 40px 0 16px;
	}

	.value-props {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 4px;
	}

	.value-card {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 16px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
	}

	.value-card.featured {
		border-color: color-mix(in oklab, var(--accent) 45%, var(--line));
		background: color-mix(in oklab, var(--accent) 5%, var(--bg-2));
	}

	.value-icon {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--accent) 16%, transparent);
		color: var(--accent);
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.value-icon svg {
		width: 19px;
		height: 19px;
	}

	.value-title {
		font-size: 15px;
		font-weight: 600;
		margin: 0;
	}

	.value-sub {
		font-size: 13px;
		line-height: 1.55;
		margin: 4px 0 0;
	}

	.cta-stack {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-top: 8px;
	}

	.source-link {
		display: inline-flex;
		align-self: center;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
		padding: 9px 16px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg-2);
		color: var(--ink);
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		transition: background 0.14s ease, border-color 0.14s ease;
	}

	.source-link:hover {
		background: color-mix(in oklab, var(--ink) 6%, var(--bg-2));
		border-color: var(--line-2);
	}

	.source-link svg {
		width: 14px;
		height: 14px;
	}

	.primary-cta,
	.secondary-cta {
		margin: 0;
		padding: 12px 18px;
		font-size: 14px;
	}

	.primary-cta {
		box-shadow: 0 4px 10px -4px color-mix(in oklab, var(--accent) 30%, transparent);
		transition: transform 0.14s ease, box-shadow 0.14s ease;
	}

	.primary-cta:hover {
		box-shadow: 0 6px 14px -4px color-mix(in oklab, var(--accent) 38%, transparent);
	}

	.primary-cta:active {
		transform: scale(0.98);
		box-shadow: 0 2px 6px -2px color-mix(in oklab, var(--accent) 28%, transparent);
		transition-duration: 0.08s;
	}

	.secondary-cta {
		transition: background 0.14s ease, border-color 0.14s ease;
	}

	.secondary-cta:hover {
		background: color-mix(in oklab, var(--ink) 6%, var(--bg-2));
		border-color: var(--line);
	}

	.demo-cta {
		border-color: color-mix(in oklab, var(--accent) 35%, var(--line));
		color: var(--accent);
		transition: background 0.14s ease, border-color 0.14s ease;
	}

	.demo-cta:hover {
		background: color-mix(in oklab, var(--accent) 10%, transparent);
		border-color: color-mix(in oklab, var(--accent) 55%, var(--line));
	}

	.demo-cta:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.how-section {
		margin-bottom: 8px;
	}

	.how-list {
		list-style: none;
		margin: 0;
		padding: 4px 16px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
	}

	.how-list li {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 16px 0;
	}

	.how-list li + li {
		border-top: 1px solid var(--line);
	}

	.how-step {
		width: 30px;
		height: 30px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--accent) 16%, transparent);
		color: var(--accent);
		display: grid;
		place-items: center;
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 700;
		flex-shrink: 0;
	}

	.how-title {
		font-size: 15px;
		font-weight: 600;
		margin: 3px 0 0;
	}

	.how-body {
		font-size: 13px;
		line-height: 1.55;
		margin: 5px 0 0;
	}

	.faq-section {
		margin-bottom: 16px;
	}

	.faq-item {
		border-top: 1px solid var(--line);
		padding: 12px 0;
	}

	.faq-item:last-of-type {
		border-bottom: 1px solid var(--line);
	}

	.faq-item summary {
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 15px;
		font-weight: 600;
	}

	.faq-item summary::-webkit-details-marker {
		display: none;
	}

	.faq-item summary h3 {
		display: inline;
		font-size: 15px;
		font-weight: 600;
		margin: 0;
	}

	.faq-item summary::before {
		content: '+';
		font-family: var(--font-mono);
		color: var(--accent);
		font-size: 16px;
		flex-shrink: 0;
		width: 18px;
		text-align: center;
	}

	.faq-item[open] summary::before {
		content: '−';
	}

	.faq-item p {
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink-2);
		margin: 8px 0 0;
		padding-left: 26px;
	}

	.faq-item code {
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		padding: 1px 6px;
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 12px;
	}

	.token-form {
		margin-top: 14px;
	}

	.input-wrap {
		position: relative;
	}

	.token-input {
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		padding-right: 48px;
		text-transform: uppercase;
	}

	.qr-btn {
		position: absolute;
		right: 6px;
		top: 6px;
		border: 0;
	}

	.hint {
		font-size: 11px;
		font-family: var(--font-mono);
		margin-top: 8px;
		letter-spacing: 0.02em;
	}

	.error {
		margin-top: 10px;
		font-size: 12px;
		color: var(--owe);
		font-family: var(--font-mono);
		line-height: 1.5;
	}

	.continue-btn {
		margin-top: 14px;
	}

	.version-footer {
		margin-top: 28px;
		padding: 8px 0 4px;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-3);
	}
</style>
