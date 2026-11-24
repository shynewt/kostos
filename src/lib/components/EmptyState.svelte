<script lang="ts">
	import type { Snippet } from 'svelte';
	import EmptyCard from './EmptyCard.svelte';
	import LogoBrush from './LogoBrush.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- "nothing here yet" screens; errors and dead ends use a plain EmptyCard -->
<EmptyCard>
	<span class="mark"><LogoBrush size={40} /></span>
	{@render children()}
</EmptyCard>

<style>
	.mark { display: block; width: fit-content; margin: 0 auto 12px; color: color-mix(in oklab, var(--accent) 55%, var(--ink-3)); opacity: 0.8; }
</style>
