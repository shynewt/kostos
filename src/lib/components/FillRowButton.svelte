<script lang="ts">
	type Props = {
		onfill: () => void;
		label?: string;
	};
	let { onfill, label = 'Fill with remaining' }: Props = $props();
</script>

<button type="button" class="fill-row-btn" onclick={onfill} aria-label={label} title={label}>
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M12 5v14M5 12l7 7 7-7" />
	</svg>
</button>

<style>
	.fill-row-btn {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		background: transparent;
		border: 0;
		border-radius: 6px;
		color: var(--ink-3);
		cursor: pointer;
		transition: background 0.12s ease, color 0.12s ease;
	}

	@media (hover: hover) {
		.fill-row-btn:hover {
			background: color-mix(in oklab, var(--accent) 20%, transparent);
			color: var(--accent);
		}
	}

	.fill-row-btn svg {
		width: 14px;
		height: 14px;
	}
</style>
