<script lang="ts">
	import { APP_HOST, NEW_ORIGIN, RETIREMENT_DATE } from '$lib/migration';
</script>

<div class="migration" role="status">
	<p class="headline">Kostos is moving to {APP_HOST}</p>
	<p class="body">
		Open each of your groups here once. It moves by itself, history included, then tap Open on {APP_HOST}. This site keeps
		working until {RETIREMENT_DATE}. <a class="open" href={NEW_ORIGIN}>Go to {APP_HOST}</a>
	</p>
	<details>
		<summary>Installed the app?</summary>
		<p class="body">
			Install it again from {APP_HOST} after opening your groups there. On iPhone the installed app has its own storage: remove
			the old icon, add {APP_HOST} to the Home Screen from Safari, then in each group here tap Copy invite link and paste it under
			Join a group inside the new app.
		</p>
	</details>
</div>

<style>
	.migration {
		flex: none; width: calc(100% - 24px); max-width: 456px; margin: 8px auto; padding: 10px 12px; box-sizing: border-box;
		border-radius: var(--radius-sm); background: color-mix(in oklab, var(--warn) 11%, transparent); color: var(--ink);
		font-size: 13px; line-height: 1.4;
	}
	p { margin: 0; }
	.headline { margin-bottom: 2px; font-weight: 600; }
	summary { margin-top: 4px; cursor: pointer; font-weight: 600; }
	details .body { margin-top: 4px; }
	.open { color: var(--ink); font-weight: 600; text-decoration: underline; }
</style>
