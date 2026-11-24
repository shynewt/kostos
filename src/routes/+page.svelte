<script lang="ts">
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import LogoMark from '$lib/components/LogoMark.svelte';
	import MarketingLanding from '$lib/components/landing/MarketingLanding.svelte';
	import IosInstallHint from '$lib/components/IosInstallHint.svelte';
	import { FAQS } from '$lib/components/landing/content';
	import { syncLine } from '$lib/sync/describe';
	import { version } from '$app/environment';
	import { goto } from '$app/navigation';
	import { enterDemo } from '$lib/demo';
	import { PROJECT_COLOR_VALUES, tileBackground } from '$lib/colors';
	import { formatAmount } from '$lib/money';
	import { listProjects, type ProjectRef } from '$lib/storage';
	import { invitePath, inviteError, parseInvite, SECRET_LENGTH } from '$lib/invite';

	let projects = $state<ProjectRef[]>([]);
	let inviteInputOpen = $state(false);
	let inviteText = $state('');
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
		const secret = parseInvite(inviteText);
		if (!secret) {
			error = inviteError(inviteText);
			return;
		}
		error = null;
		goto(invitePath(secret));
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

<ShareMeta
	title="Kostos · Group expense splitter, no accounts"
	description="Kostos is a free group expense splitter. Share an invite link, split bills, sync live across devices. No accounts, end-to-end encrypted, works offline."
	image="/og-image.png"
	imageAlt="Kostos, the free and private group expense splitter"
	path="/"
/>

<svelte:head>
	<title>Kostos · Group expense splitter, no accounts needed</title>
	{#if !hasProjects}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html `<script type="application/ld+json">${JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'SoftwareApplication',
			name: 'Kostos',
			description:
				'Free open-source group expense splitter. Share an invite link, split bills with friends, sync live across devices. No accounts, end-to-end encrypted, works offline.',
			applicationCategory: 'FinanceApplication',
			operatingSystem: 'Web, iOS, Android',
			offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
		})}</script>`}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html `<script type="application/ld+json">${JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: FAQS.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } }))
		})}</script>`}
	{/if}
</svelte:head>

<div class="screen" class:marketing-screen={!hasProjects} data-page="landing">
	{#if hasProjects}
		<a class="icon-btn settings-link" href="/settings" aria-label="Settings" title="Settings">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
				<circle cx="12" cy="12" r="2.6" />
				<path d="M19 12a7 7 0 0 0-.16-1.5l2.05-1.58-2-3.46-2.43.83a7 7 0 0 0-2.59-1.5L13.5 2h-3l-.37 2.79a7 7 0 0 0-2.59 1.5l-2.43-.83-2 3.46L5.16 10.5A7 7 0 0 0 5 12a7 7 0 0 0 .16 1.5l-2.05 1.58 2 3.46 2.43-.83a7 7 0 0 0 2.59 1.5L10.5 22h3l.37-2.79a7 7 0 0 0 2.59-1.5l2.43.83 2-3.46-2.05-1.58A7 7 0 0 0 19 12z" />
			</svg>
		</a>
	{/if}
	<div class="scroll landing-scroll" class:marketing-scroll={!hasProjects}>

		{#snippet inviteForm()}
			<form class="card invite-form" onsubmit={onJoinSubmit}>
				<div class="eyebrow" style="margin-bottom: 8px;">Paste an invite link or group key</div>
				<div class="input-wrap">
					<input
						class="input invite-input"
						placeholder="Invite link or group key"
						bind:value={inviteText}
						autocomplete="off"
						autocapitalize="off"
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
				<div class="dim hint">Paste the link, or just the {SECRET_LENGTH} characters after the #</div>
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
			<header class="col brand">
				<div class="brand-mark" role="img" aria-label="Kostos logo">
					<LogoMark size={52} strokeWidth={2.7} />
				</div>
				<h1 class="wordmark brand-name">kostos</h1>
			</header>
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
								<span class="dim project-meta">
									{syncLine(p)}{#if p.lastActiveAt}<span class="meta-sep">·</span>{relativeDay(p.lastActiveAt)}{/if}
								</span>
							</span>
							{#if p.net !== undefined && p.netSymbol}
								<span class="col project-balance">
									{#if p.net === 0}
										<span class="dim pb-label">settled up</span>
									{:else}
										<span
											class="num pb-amount"
											class:tone-owed={p.net > 0}
											class:tone-owe={p.net < 0}
										>
											{formatAmount(Math.abs(p.net), p.netSymbol, p.netCurrency)}
										</span>
										<span class="dim pb-label">{p.net > 0 ? 'owed to you' : 'you owe'}</span>
									{/if}
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
					aria-expanded={inviteInputOpen}
					onclick={() => (inviteInputOpen = !inviteInputOpen)}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
					<span>Join with invite link</span>
				</button>
			</div>

			{#if inviteInputOpen}
				{@render inviteForm()}
			{/if}
		{:else}
			<MarketingLanding bind:inviteOpen={inviteInputOpen} {inviteForm} {demoLoading} onTryDemo={tryDemo} />
		{/if}
		{#if hasProjects}<footer class="version-footer">Kostos v{version}</footer>{/if}
	</div>
</div>

<IosInstallHint />

<style>
	.marketing-screen { max-width: none; }
	.landing-scroll.marketing-scroll { padding: 0; }
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



	.brand-name {
		margin: 22px 0 0;
		font-size: 38px;
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
		font-size: 12px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-sep {
		margin: 0 6px;
		opacity: 0.5;
	}

	.project-balance {
		align-items: flex-end;
		gap: 2px;
		flex-shrink: 0;
		text-align: right;
	}

	.pb-amount {
		font-size: 14px;
		font-weight: 600;
	}

	.pb-label {
		font-size: 12px;
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



	.invite-form {
		margin-top: 14px;
	}

	.input-wrap {
		position: relative;
	}

	.invite-input {
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		padding-right: 48px;
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
		text-transform: uppercase;
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
