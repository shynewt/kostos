<script lang="ts">
	import { SITE_URL } from '$lib/site';

	type Props = {
		title: string;
		description: string;
		/** Site-relative path of a 1200 by 630 image in `static/`. */
		image: string;
		imageAlt: string;
		path: string;
		/** App screens a search result can't use, such as the join page. */
		noindex?: boolean;
	};

	let { title, description, image, imageAlt, path, noindex = false }: Props = $props();
	const url = $derived(`${SITE_URL}${path}`);
	const imageUrl = $derived(`${SITE_URL}${image}`);
</script>

<svelte:head>
	<meta name="description" content={description} />
	{#if noindex}
		<meta name="robots" content="noindex" />
	{:else}
		<link rel="canonical" href={url} />
	{/if}
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Kostos" />
	<meta property="og:url" content={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={imageUrl} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={imageAlt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={imageUrl} />
	<meta name="twitter:image:alt" content={imageAlt} />
</svelte:head>
