<script lang="ts">
	import { slide } from 'svelte/transition';
	import { diffVersions } from '$lib/sync/conflict-diff';
	import { resolveExpenseConflict } from '$lib/sync/doc';
	import type { RoomState } from '$lib/sync/useRoom.svelte';

	let { room, expenseId }: { room: RoomState; expenseId: string } = $props();
	const conflict = $derived(room.conflicts.find((c) => c.id === expenseId));
	const displayed = $derived(conflict?.versions.at(-1)?.id);
	const diffs = $derived(
		conflict
			? diffVersions(conflict.versions, {
					memberName: (id) => room.membersById.get(id)?.name ?? 'Unknown member',
					categoryById: room.categoryById,
					methodById: room.methodById,
					tripsById: room.tripsById,
					baseSymbol: room.currencySymbol,
					baseCurrency: room.currency
				})
			: []
	);

	let picked = $state<string | null>(null);
	const selected = $derived(picked && diffs.some((d) => d.id === picked) ? picked : (displayed ?? null));
	let saving = $state(false);
	let error = $state(false);
	const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	async function keep() {
		if (!selected || saving) return;
		saving = true;
		error = false;
		try {
			resolveExpenseConflict(room.handle, expenseId, selected);
			await room.handle.persistence?.flush();
		} catch { error = true; }
		finally { saving = false; }
	}
</script>

{#if conflict}
	<section class="conflict" aria-labelledby="conflict-title" transition:slide={{ duration: reduced ? 0 : 220 }}>
		<h2 id="conflict-title">Edited on two phones</h2>
		<p class="lead">Choose the version to keep. This expense counts once in your balances either way.</p>
		<div class="options" role="radiogroup" aria-labelledby="conflict-title">
			{#each diffs as version (version.id)}
				<label class="version option" class:selected={selected === version.id}>
					<input class="sr" type="radio" name="version" value={version.id} checked={selected === version.id} onchange={() => (picked = version.id)} />
					<span class="tick" aria-hidden="true"></span>
					<span class="info">
						<span class="by">
							{version.byline}
							{#if version.id === displayed}<span class="tag">Showing now</span>{/if}
						</span>
						{#if version.fields.length}
							<dl>
								{#each version.fields as field (field.label)}
									<dt>{field.label}</dt><dd>{field.value}</dd>
								{/each}
							</dl>
						{:else}
							<span class="same">Same details</span>
						{/if}
					</span>
				</label>
			{/each}
		</div>
		<button class="btn btn-primary keep" type="button" disabled={saving} onclick={keep}>{saving ? 'Saving…' : 'Keep this version'}</button>
		{#if error}<p class="problem" role="alert">Couldn’t save your choice on this phone. Keep the app open and try again.</p>{/if}
	</section>
{/if}

<style>
	.conflict { margin: 4px 0 20px; padding: 18px 16px 16px; border-radius: var(--radius-lg); background: var(--bg-2); }
	h2 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
	.lead { margin: 6px 0 14px; font-size: 13px; line-height: 1.5; color: var(--ink-2); max-width: 40ch; }
	.options { display: grid; gap: 8px; }
	.option {
		display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: var(--radius);
		background: color-mix(in oklab, var(--ink) 4%, transparent); cursor: pointer;
		box-shadow: inset 0 0 0 1.5px transparent; transition: background-color 160ms, box-shadow 160ms;
	}
	.option:hover { background: color-mix(in oklab, var(--ink) 7%, transparent); }
	.option.selected { background: color-mix(in oklab, var(--accent) 10%, transparent); box-shadow: inset 0 0 0 1.5px var(--accent); }
	.option:has(.sr:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
	.sr { position: absolute; opacity: 0; pointer-events: none; }
	.tick {
		flex-shrink: 0; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line-2);
		transition: box-shadow 160ms, background-color 160ms;
	}
	.selected .tick { background: radial-gradient(circle, var(--accent-ink) 0 26%, var(--accent) 30%); box-shadow: none; }
	.info { flex: 1; min-width: 0; display: grid; gap: 8px; }
	.by { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--ink-2); }
	.tag { font-size: 10px; padding: 2px 7px; border-radius: 999px; color: var(--ink-2); background: color-mix(in oklab, var(--ink) 9%, transparent); }
	dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 14px; margin: 0; font-size: 14px; line-height: 1.4; }
	dt { color: var(--ink-3); }
	dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
	.same { font-size: 13px; color: var(--ink-3); }
	.keep { width: 100%; margin-top: 14px; padding: 14px; font-size: 15px; }
	.keep:disabled { opacity: 0.6; cursor: wait; }
	.problem { margin: 10px 0 0; font-size: 12px; color: var(--owe); line-height: 1.5; }
	@media (prefers-reduced-motion: reduce) { .option, .tick { transition: none; } }
</style>
