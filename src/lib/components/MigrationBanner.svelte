<script lang="ts">
	import { APP_HOST, NEW_ORIGIN, RETIREMENT_DATE } from '$lib/migration';
</script>

<div class="migration" role="status">
	<p class="headline">Kostos is moving to {APP_HOST}</p>
	<p class="body">
		This site keeps working, and keeps exporting, until {RETIREMENT_DATE}. One person per group moves it: ask your group who,
		and do not export yourself if someone already did. Installed the app? Reinstall it from {APP_HOST} once your group has moved
		(on iPhone: remove the old icon, open {APP_HOST} in Safari, then Share and Add to Home Screen).
	</p>
	<a class="open" href={NEW_ORIGIN}>Open the new site</a>
</div>

<style>
	.migration {
		margin: 8px 12px; padding: 10px 12px; border-radius: var(--radius-sm);
		background: color-mix(in oklab, var(--warn) 11%, transparent); color: var(--ink); font-size: 13px; line-height: 1.4;
	}
	.headline { margin: 0 0 4px; font-weight: 600; }
	.body { margin: 0 0 8px; }
	.open { color: var(--ink); font-weight: 600; text-decoration: underline; }
</style>
