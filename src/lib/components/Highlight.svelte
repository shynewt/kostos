<script lang="ts">
	import { matchRanges, searchTerms } from '$lib/expense-search';

	type Props = {
		text: string;
		query: string;
	};
	let { text, query }: Props = $props();

	const parts = $derived.by(() => {
		const ranges = text ? matchRanges(text, searchTerms(query)) : [];
		const out: { text: string; isMatch: boolean }[] = [];
		let cursor = 0;
		for (const [start, end] of ranges) {
			if (start > cursor) out.push({ text: text.slice(cursor, start), isMatch: false });
			out.push({ text: text.slice(start, end), isMatch: true });
			cursor = end;
		}
		if (cursor < text.length) out.push({ text: text.slice(cursor), isMatch: false });
		return out;
	});
</script>

{#each parts as part, i (i)}{#if part.isMatch}<mark class="hl">{part.text}</mark>{:else}{part.text}{/if}{/each}

<style>
	.hl {
		background: transparent;
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 2px;
	}
</style>
