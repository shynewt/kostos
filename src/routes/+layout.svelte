<script lang="ts">
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/inter/700.css';
	import '@fontsource/jetbrains-mono/400.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '@fontsource/jetbrains-mono/600.css';
	import '@fontsource/instrument-serif/400.css';

	import '$lib/styles/tokens.css';
	import '$lib/styles/app.css';

	import MathToolbar from '$lib/components/MathToolbar.svelte';
	import MigrationBanner from '$lib/components/MigrationBanner.svelte';
	import UpdateBanner from '$lib/components/UpdateBanner.svelte';

	const isProd = !import.meta.env.DEV;

	let { children } = $props();
</script>

<svelte:head>
	{#if isProd}
		<link rel="manifest" href="/manifest.webmanifest" />
	{/if}
</svelte:head>

<MigrationBanner />
{@render children()}
<MathToolbar />
<UpdateBanner />
