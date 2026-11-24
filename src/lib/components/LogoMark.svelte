<script lang="ts">
	type Props = {
		size?: number;
		/** Heavier at small sizes, so the strokes never look thin. */
		strokeWidth?: number;
	};

	let { size = 24, strokeWidth = 2.9 }: Props = $props();
</script>

<!-- the Kostos tally: four hand-drawn strokes crossed by a slash; static/icon.svg draws the same paths -->
<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" aria-hidden="true">
	<path d="M6.15 4.7 5.9 19.3M10.1 4.5 10 19.4M14 4.8l.12 14.5M18.1 4.6l-.2 14.7" />
	<path d="M3.1 16.05C9 13.8 14.9 11.1 20.9 8.15" />
</svg>
