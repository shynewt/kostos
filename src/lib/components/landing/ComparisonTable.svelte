<script lang="ts">
	import { COMPARED_APPS, COMPARED_ON, COMPARISON, COMPARISON_SOURCES, type Verdict } from './content';

	type Props = {
		/** Apps to show besides Kostos; all of them when left out. */
		versus?: string[];
	};

	let { versus }: Props = $props();

	const SPOKEN: Record<Verdict, string> = { yes: 'Yes', no: 'No', partial: 'Partly', unknown: 'Not confirmed' };
	const columns = $derived(COMPARED_APPS.map((app, index) => ({ app, index })).filter(({ app, index }) => index === 0 || !versus || versus.includes(app)));
	const sources = $derived(COMPARISON_SOURCES.filter((source) => !versus || versus.includes(source.label)));
	const captionId = $derived(`comparison-caption-${columns.map(({ index }) => index).join('')}`);
	const scrolls = $derived(columns.length > 3);
</script>

{#if scrolls}<p class="swipe-hint" aria-hidden="true">Swipe the table to see more apps →</p>{/if}
<!-- it scrolls sideways on narrow screens, and a scroll box must take focus so keyboard users can scroll it (WCAG 2.1.1); svelte's rule can't see that it scrolls -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-wrapper" class:fits={!scrolls} tabindex="0" role="region" aria-labelledby={captionId}>
	<table>
		<caption id={captionId}>Kostos compared with {columns.slice(1).map(({ app }) => app).join(', ')}</caption>
		<thead>
			<tr>
				<td class="corner"></td>
				{#each columns as { app, index } (app)}
					<th scope="col" class:ours={index === 0}>{app}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each COMPARISON as row (row.feature)}
				<tr>
					<th scope="row">{row.feature}</th>
					{#each columns as { index } (index)}
						{@const cell = row.cells[index]}
						<td class:ours={index === 0}>
							<span class="verdict {cell.verdict}" role="img" aria-label={SPOKEN[cell.verdict]}></span>
							{#if cell.note}<span class="note">{cell.note}</span>{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="sources">
	Sources, checked {COMPARED_ON}:
	{#each sources as source, index (source.href)}<a href={source.href} target="_blank" rel="noopener nofollow">{source.label}</a>{index < sources.length - 1 ? ' · ' : '.'}{/each}
	“Not confirmed” means the app doesn’t say.
</p>

<style>
	.table-wrapper { overflow-x: auto; border: 1px solid var(--line); border-radius: 1.25rem; background: var(--bg-2); }
	.table-wrapper:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	/* the feature names and the Kostos column stay put while the other apps scroll past */
	table { --feature-col: 10rem; --ours-col: 5.5rem; width: 100%; min-width: 36rem; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; }
	caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	th, td { padding: 0.85rem 0.6rem; text-align: center; vertical-align: middle; }
	tbody tr + tr > * { border-top: 1px solid var(--line); }
	thead th { font-weight: 600; color: var(--ink-2); white-space: nowrap; }
	tbody th, .corner {
		position: sticky; inset-inline-start: 0; z-index: 2; width: var(--feature-col); min-width: var(--feature-col); max-width: var(--feature-col);
		text-align: start; font-weight: 500; color: var(--ink); background: var(--bg-2);
	}
	.ours {
		position: sticky; inset-inline-start: var(--feature-col); z-index: 1; width: var(--ours-col); min-width: var(--ours-col);
		background: color-mix(in oklab, var(--accent) 10%, var(--bg-2));
		box-shadow: 0.5rem 0 0.75rem -0.5rem color-mix(in oklab, black 45%, transparent);
	}
	thead th.ours { color: var(--accent); }
	.verdict { display: inline-block; width: 1.4rem; height: 1.4rem; vertical-align: middle; border-radius: 50%; mask: var(--icon) center / 70% no-repeat; }
	.yes { --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12l5 5 9-10'/%3E%3C/svg%3E"); background: var(--accent); }
	.no { --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E"); background: var(--ink-3); }
	.partial { --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 12h12'/%3E%3C/svg%3E"); background: var(--warn); }
	.unknown { --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M8 12h8'/%3E%3C/svg%3E"); background: var(--line-2); }
	.note { display: block; margin-top: 0.2rem; color: var(--ink-3); font-size: 0.72rem; white-space: nowrap; }
	.swipe-hint { display: none; margin: 0 0 0.6rem; color: var(--ink-3); font-size: 0.8rem; }
	@media (max-width: 40rem) {
		.swipe-hint { display: block; }
		table { --feature-col: 7.5rem; --ours-col: 4.5rem; min-width: 30rem; font-size: 0.82rem; }
		th, td { padding: 0.7rem 0.45rem; }
	}
	/* nothing scrolls when only one other app is shown, so nothing needs pinning */
	.fits table { min-width: 0; }
	.fits .ours { position: static; box-shadow: none; }
	.sources { margin-top: 0.9rem; color: var(--ink-3); font-size: 0.8rem; line-height: 1.5; }
	.sources a { color: var(--ink-2); text-decoration: none; }
	.sources a:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 0.2em; }
</style>
