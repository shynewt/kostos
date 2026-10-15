<script lang="ts">
	type Props = {
		manageHref: string;
		onDismiss: () => void;
	};

	let { manageHref, onDismiss }: Props = $props();
</script>

<aside class="card intro-card">
	<button type="button" class="dismiss" onclick={onDismiss} aria-label="Hide trips intro">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
			<path d="M6 6l12 12M18 6L6 18" />
		</svg>
	</button>
	<div class="intro-emoji">🗺️</div>
	<div class="intro-body">
		<div class="intro-title">Got an event coming up?</div>
		<p class="intro-text">
			Group expenses by holiday, party, or any other event.
		</p>
		<a class="btn btn-primary intro-cta" href={manageHref}>Create your first trip</a>
	</div>
</aside>

<style>
	.intro-card {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 16px 16px 18px;
		margin: 4px 0 14px;
		background: color-mix(in oklab, var(--accent) 9%, var(--bg-2));
		border: 1px dashed color-mix(in oklab, var(--accent) 45%, var(--line));
	}

	.dismiss {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 26px;
		height: 26px;
		border-radius: 999px;
		background: transparent;
		border: 0;
		color: var(--ink-3);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.dismiss:hover {
		color: var(--ink);
	}

	.dismiss svg {
		width: 14px;
		height: 14px;
	}

	.intro-emoji {
		font-size: 26px;
		line-height: 1;
		padding-top: 2px;
	}

	.intro-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.intro-title {
		font-size: 14px;
		font-weight: 600;
	}

	.intro-text {
		font-size: 12px;
		color: var(--ink-2);
		line-height: 1.45;
		margin: 0;
	}

	.intro-cta {
		align-self: flex-start;
		padding: 8px 14px;
		font-size: 13px;
		margin-top: 2px;
		text-decoration: none;
	}
</style>
