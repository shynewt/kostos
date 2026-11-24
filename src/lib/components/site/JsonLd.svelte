<script lang="ts">
	let { data }: { data: Record<string, unknown> } = $props();
	// escaping < keeps any text inside the data from closing the script tag early
	const json = $derived(JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c'));
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${json}</script>`}
</svelte:head>
