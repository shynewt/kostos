<script lang="ts">
	type Props = {
		src: string;
		/** The image's real pixel size, so the page reserves its space before it loads. */
		width: number;
		height: number;
		alt: string;
		caption: string;
	};

	let { src, width, height, alt, caption }: Props = $props();
</script>

<figure class="figure">
	<img {src} {width} {height} {alt} loading="lazy" decoding="async" />
	<figcaption>{caption}</figcaption>
</figure>

<style>
	.figure { margin: 1.75rem auto; width: min(100%, 20rem); }
	img { display: block; width: 100%; height: auto; border: 1px solid var(--line-2); border-radius: 1.25rem; background: var(--bg-2); }
	figcaption { margin-top: 0.6rem; color: var(--ink-3); font-size: 0.85rem; line-height: 1.45; text-align: center; text-wrap: balance; }
</style>
