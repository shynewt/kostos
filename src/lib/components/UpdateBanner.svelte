<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	/* Service-worker update prompt (vite-pwa "prompt for update" recipe).
	 *
	 * The plugin runs in `prompt` mode: a new SW installs and stays waiting until the user
	 * accepts. onNeedRefresh fires, we show this bar, and updateSW(true) sends SKIP_WAITING
	 * and reloads once the new SW takes control. No clientsClaim, so the live page is never
	 * handed to the new SW mid-session.
	 *
	 * We also poll every 30 minutes so a long-lived session picks up new releases.
	 */

	let needRefresh = $state(false);
	let updating = $state(false);
	let triggerUpdate: (() => Promise<void>) | null = null;
	let fallbackReload: ReturnType<typeof setTimeout> | null = null;

	const POLL_INTERVAL_MS = 30 * 60 * 1000;

	onMount(async () => {
		if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
		// Skip in dev: no built SW, and virtual:pwa-register would try to fetch /dev-sw.js (404).
		if (!import.meta.env.PROD) return;

		const { registerSW } = await import('virtual:pwa-register');
		const updateSW = registerSW({
			immediate: true,
			onNeedRefresh() {
				needRefresh = true;
			},
			onRegistered(reg) {
				if (!reg) return;
				setInterval(() => {
					reg.update().catch(() => undefined);
				}, POLL_INTERVAL_MS);
			}
		});

		triggerUpdate = async () => {
			updating = true;
			try {
				await updateSW(true);
			} catch {
				// swallowed: the fallback reload below recovers the stuck state
			}
			// updateSW(true) only posts SKIP_WAITING; the real reload is wired to workbox's
			// `controlling` event. Some browsers never fire it after skip-waiting, leaving the
			// bar stuck on "Updating…". Force a reload if the handoff hasn't taken over in time;
			// if it already did, the page is gone before this runs.
			fallbackReload = setTimeout(() => window.location.reload(), 4000);
		};
	});

	onDestroy(() => {
		if (fallbackReload) clearTimeout(fallbackReload);
	});

	async function onUpdate() {
		if (!triggerUpdate) return;
		await triggerUpdate();
	}

	function dismiss() {
		needRefresh = false;
	}
</script>

{#if needRefresh}
	<div class="update-bar" role="status" aria-live="polite">
		<span class="update-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 4v10M7 10l5 5 5-5" />
				<path d="M5 20h14" />
			</svg>
		</span>
		<span class="update-text">A new version of Kostos is ready.</span>
		<button type="button" class="dismiss-btn" onclick={dismiss}>Later</button>
		<button type="button" class="update-btn" onclick={onUpdate} disabled={updating}>
			{updating ? 'Updating…' : 'Update'}
		</button>
	</div>
{/if}

<style>
	.update-bar {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: calc(16px + env(safe-area-inset-bottom, 0px));
		margin-inline: auto;
		max-width: 520px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 12px 12px 16px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 14px;
		box-shadow: 0 10px 30px -10px color-mix(in oklab, black 55%, transparent);
		z-index: 1200;
		animation: rise 0.22s ease-out;
	}

	.update-icon {
		display: inline-flex;
		color: var(--accent);
		flex-shrink: 0;
	}

	.update-icon svg {
		width: 20px;
		height: 20px;
	}

	.update-text {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--ink);
	}

	.dismiss-btn {
		flex-shrink: 0;
		border: 0;
		background: transparent;
		color: var(--ink-2);
		padding: 9px 10px;
		font: inherit;
		font-size: 13px;
		border-radius: 999px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.update-btn {
		flex-shrink: 0;
		background: var(--accent);
		color: var(--accent-ink);
		border: 0;
		border-radius: 999px;
		padding: 9px 18px;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.update-btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	@keyframes rise {
		from { opacity: 0; transform: translateY(12px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
