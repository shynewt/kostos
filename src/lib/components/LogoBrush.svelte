<script lang="ts">
	let { size = 96 }: { size?: number } = $props();
</script>

<!-- the tally drawn with a marker: strokes taper from thin to thick; for large sizes only, LogoMark covers small ones -->
<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
	<path d="M5.2 4.9a1.1 1.1 0 0 1 2.2 0l-.1 14.2a1.5 1.5 0 0 1-3 0z" />
	<path d="M9.1 4.4a1.1 1.1 0 0 1 2.2 0l.2 15.1a1.5 1.5 0 0 1-3 0z" />
	<path d="M12.9 5.1a1.1 1.1 0 0 1 2.2 0l.7 14.2a1.5 1.5 0 0 1-3 0z" />
	<path d="M17 4.6a1.1 1.1 0 0 1 2.2 0l0 14.8a1.5 1.5 0 0 1-3 0z" />
	<path d="M2.6 15.4C8.5 13.1 14.6 10.2 20.6 7.2a.9.9 0 0 1 .8 1.6C15.4 11.9 9.2 14.9 3.4 17.2a1 1 0 0 1-.8-1.8z" />
</svg>
