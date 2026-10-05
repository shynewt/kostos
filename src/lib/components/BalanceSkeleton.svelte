<script lang="ts">
	let { mode = 'balances' }: { mode?: 'balances' | 'stats' } = $props();
</script>

<div class="loading" aria-label="Checking expenses and balances" aria-busy="true">
	{#if mode === 'balances'}
		<div class="graph" aria-hidden="true">
			<span class="ghost avatar a1"></span>
			<span class="ghost avatar a2"></span>
			<span class="link l1"></span>
			<span class="link l2"></span>
			<span class="ghost avatar you"></span>
		</div>
	{:else}
		<div class="ring-wrap" aria-hidden="true"><span class="ring"></span></div>
	{/if}

	<div class="figure">
		<div class="eyebrow">{mode === 'stats' ? 'Checking totals' : 'Checking balances'}</div>
		<div class="amount" aria-hidden="true"><span class="symbol">€</span><span class="ghost number"></span></div>
	</div>

	<div class="rows" aria-hidden="true">
		<div class="head ghost"></div>
		{#each [1, 2] as row (row)}
			<div class="row-card">
				<span class="ghost avatar small"></span>
				<span class="lines"><span class="ghost bar wide"></span><span class="ghost bar"></span></span>
				<span class="ghost bar amt"></span>
			</div>
		{/each}
	</div>
</div>

<style>
	.loading { padding-top: 4px; }
	.ghost { background: color-mix(in oklab, var(--ink) 9%, transparent); animation: breathe 1.8s ease-in-out infinite; }

	.graph { position: relative; height: 148px; margin: 4px 4px 0; }
	.avatar { position: absolute; border-radius: 50%; width: 46px; height: 46px; }
	.a1 { left: 8%; top: 10px; }
	.a2 { left: 8%; top: 82px; animation-delay: 150ms; }
	.you { right: 9%; top: 46px; width: 50px; height: 50px; background: transparent; box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--accent) 45%, transparent); animation-delay: 300ms; }
	.link { position: absolute; left: 26%; right: 26%; height: 0; border-top: 2px dashed color-mix(in oklab, var(--ink) 14%, transparent); }
	.l1 { top: 33px; transform: rotate(8deg); transform-origin: left; }
	.l2 { top: 105px; transform: rotate(-12deg); transform-origin: left; }

	.ring-wrap { display: grid; place-items: center; height: 148px; }
	.ring { width: 112px; height: 112px; border-radius: 50%; border: 16px solid color-mix(in oklab, var(--ink) 9%, transparent); animation: breathe 1.8s ease-in-out infinite; }

	.figure { text-align: center; padding: 14px 0 30px; }
	.eyebrow { margin-bottom: 8px; }
	.amount { display: flex; align-items: flex-start; justify-content: center; gap: 6px; height: 64px; font-family: var(--font-display); }
	.number { display: block; width: 164px; height: 52px; margin-top: 6px; border-radius: 14px; }
	.symbol { font-size: 32px; line-height: 1; color: var(--ink-3); opacity: 0.6; }

	.head { height: 11px; width: 92px; border-radius: 6px; margin-bottom: 12px; }
	.row-card { display: flex; align-items: center; gap: 14px; padding: 14px; margin-bottom: 10px; border-radius: var(--radius); background: color-mix(in oklab, var(--ink) 4%, transparent); }
	.small { position: static; width: 38px; height: 38px; flex-shrink: 0; }
	.lines { flex: 1; display: grid; gap: 8px; }
	.bar { height: 10px; width: 45%; border-radius: 6px; }
	.bar.wide { width: 72%; }
	.bar.amt { width: 52px; height: 14px; }

	@keyframes breathe { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .ghost, .ring { animation: none; opacity: 0.8; } }
</style>
