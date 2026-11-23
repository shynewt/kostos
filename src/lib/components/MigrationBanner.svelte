<script lang="ts">
	import { APP_HOST, NEW_ORIGIN, RETIREMENT_LABEL, retirementNotice, type RetirementNotice } from '$lib/migration';

	// the landing page is prerendered, so the countdown is worked out on the visitor's device, never at build time
	let notice = $state<RetirementNotice | null>(null);
	$effect(() => { notice = retirementNotice(new Date()); });
	const urgent = $derived(notice?.urgent ?? false);
	const closes = $derived.by(() => {
		if (!notice) return `on ${RETIREMENT_LABEL}`;
		if (notice.daysLeft === 0) return 'today';
		return `in ${notice.daysLeft} ${notice.daysLeft === 1 ? 'day' : 'days'}, on ${RETIREMENT_LABEL}`;
	});
</script>

<button type="button" class="migration" class:urgent popovertarget="migration-details">
	<span class="dot" aria-hidden="true"></span>
	<span class="text">
		{#if urgent}
			<strong>This site closes {closes}.</strong> Move your groups to {APP_HOST}.
		{:else}
			Kostos is moving to <strong>{APP_HOST}</strong>
		{/if}
	</span>
	<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
</button>

<div id="migration-details" class="details" popover>
	<p class="title">Kostos is moving to {APP_HOST}</p>
	<p>Your groups come along by themselves, with their full history. Open each group here, then tap <strong>Open on {APP_HOST}</strong>.</p>
	<p>{APP_HOST} is Kostos’s own home, and groups there get private invite links that only their members can use.</p>
	<p class:warning={urgent}>This site closes {closes}.</p>
	<p class="aside">Installed the app? Install it again from {APP_HOST}.</p>
	<div class="actions">
		<a class="btn btn-primary" href={NEW_ORIGIN}>Go to {APP_HOST}</a>
		<button type="button" class="btn" popovertarget="migration-details" popovertargetaction="hide">Close</button>
	</div>
</div>

<style>
	.migration {
		--tone: var(--accent);
		flex: none; display: flex; align-items: center; gap: 10px;
		width: calc(100% - 24px); max-width: 456px; margin: 8px auto 0; padding: 9px 12px 9px 14px; box-sizing: border-box;
		border: 1px solid color-mix(in oklab, var(--tone) 45%, transparent); border-radius: 999px;
		background: color-mix(in oklab, var(--tone) 12%, var(--bg-2));
		color: var(--ink); font: inherit; font-size: 13px; line-height: 1.35; text-align: left; cursor: pointer;
	}
	.migration.urgent { --tone: var(--warn); border-radius: var(--radius); }
	.migration:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }
	.dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--tone); box-shadow: 0 0 0 4px color-mix(in oklab, var(--tone) 22%, transparent); }
	.text { flex: 1; min-width: 0; }
	.text strong { font-weight: 600; }
	.chevron { flex: none; width: 16px; height: 16px; fill: none; stroke: var(--ink-2); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

	.details {
		width: min(380px, calc(100vw - 32px)); padding: 18px; box-sizing: border-box;
		border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg-2); color: var(--ink-2);
		font-size: 14px; line-height: 1.45;
	}
	.details::backdrop { background: color-mix(in oklab, black 45%, transparent); }
	.details p { margin: 0 0 10px; }
	.details strong { color: var(--ink); font-weight: 600; }
	.title { color: var(--ink); font-weight: 600; font-size: 16px; }
	.warning { color: var(--ink); font-weight: 600; }
	.aside { color: var(--ink-3); font-size: 13px; }
	.actions { display: flex; gap: 8px; margin-top: 14px; }
	.actions .btn { flex: 1; }
</style>
