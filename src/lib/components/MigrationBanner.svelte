<script lang="ts">
	import { APP_HOST, NEW_ORIGIN, RETIREMENT_DATE } from '$lib/migration';
</script>

<div class="migration" role="status">
	<p class="headline">Kostos is moving to {APP_HOST}</p>
	<p class="body">
		This site keeps working, and keeps exporting, until {RETIREMENT_DATE}. One person per group moves it, so ask your group who
		before you export. <a class="open" href={NEW_ORIGIN}>Open the new site</a>
	</p>
	<details>
		<summary>Installed the app?</summary>
		<p class="body">
			Reinstall it from {APP_HOST} once your group has moved. On iPhone: remove the old icon, open {APP_HOST} in Safari, then
			Share and Add to Home Screen. The installed app has its own storage, so paste the new invite link under Join a group inside it.
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
