<script lang="ts">
	let { message }: { message: string } = $props();
	let element = $state<HTMLElement | null>(null);

	// the button that failed can sit below the fold on a short phone, so bring the reason to the user
	$effect(() => element?.scrollIntoView({ block: 'center' }));
</script>

<p class="form-error" role="alert" bind:this={element}>{message}</p>

<style>
	.form-error {
		margin: 14px 0 0;
		padding: 10px 12px;
		border-radius: 12px;
		background: color-mix(in oklab, #ef4444 16%, transparent);
		color: var(--ink);
		font-size: 13px;
		line-height: 1.5;
	}
</style>
