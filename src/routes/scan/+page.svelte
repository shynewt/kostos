<script lang="ts">
	import { goto } from '$app/navigation';
	import { parseToken } from '$lib/token';
	import { onMount } from 'svelte';

	type ScanStatus = 'starting' | 'scanning' | 'no-camera' | 'denied' | 'unsupported' | 'matched';

	let video = $state<HTMLVideoElement | null>(null);
	let status = $state<ScanStatus>('starting');
	let detail = $state<string | null>(null);
	let scanner: { stop: () => void; destroy: () => void } | null = null;

	function navigateForResult(raw: string): boolean {
		const value = raw.trim();
		if (!value) return false;

		const parsed = parseToken(value);
		if (parsed) {
			status = 'matched';
			goto(`/join?room=${encodeURIComponent(parsed.roomId)}#${parsed.secret}`);
			return true;
		}
		return false;
	}

	onMount(() => {
		let cancelled = false;
		(async () => {
			if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
				status = 'unsupported';
				return;
			}

			const { default: QrScanner } = await import('qr-scanner');
			if (cancelled || !video) return;

			const hasCamera = await QrScanner.hasCamera();
			if (!hasCamera) {
				status = 'no-camera';
				return;
			}

			const instance = new QrScanner(
				video,
				(result) => {
					const text = typeof result === 'string' ? result : result.data;
					const matched = navigateForResult(text);
					if (matched) {
						instance.stop();
					} else {
						detail = 'That QR code is not a Kostos invite. Try another.';
					}
				},
				{
					returnDetailedScanResult: true,
					highlightScanRegion: true,
					highlightCodeOutline: true,
					preferredCamera: 'environment',
					maxScansPerSecond: 6
				}
			);
			scanner = instance;

			try {
				await instance.start();
				if (!cancelled) status = 'scanning';
			} catch (err) {
				if (cancelled) return;
				const message = err instanceof Error ? err.message : String(err);
				status = /denied|permission/i.test(message) ? 'denied' : 'no-camera';
				detail = message;
			}
		})();

		return () => {
			cancelled = true;
			scanner?.stop();
			scanner?.destroy();
			scanner = null;
		};
	});
</script>

<svelte:head>
	<title>Scan QR · Kostos</title>
</svelte:head>

<div class="screen" data-page="scan">
	<header class="app-bar">
		<div class="row gap-8" style="flex: 1;">
			<a class="icon-btn" href="/" aria-label="Cancel">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</a>
		</div>
		<div class="app-bar-title">Scan QR</div>
		<div class="row gap-6" style="flex: 1;"></div>
	</header>

	<div class="scroll scan-scroll">
		<div class="viewport">
			<video bind:this={video} class="video" muted playsinline></video>
			{#if status !== 'scanning' && status !== 'matched'}
				<div class="overlay">
					{#if status === 'starting'}
						<p class="overlay-text">Starting camera…</p>
					{:else if status === 'denied'}
						<p class="overlay-text">Camera access was blocked. Enable it in your browser settings and reload.</p>
					{:else if status === 'no-camera'}
						<p class="overlay-text">No camera available on this device.</p>
					{:else if status === 'unsupported'}
						<p class="overlay-text">This browser cannot use the camera. Paste the invite token instead.</p>
					{/if}
				</div>
			{/if}
		</div>

		<p class="dim hint mono">POINT AT A KOSTOS INVITE QR</p>

		{#if detail}
			<p class="detail" role="alert">{detail}</p>
		{/if}

		<a class="btn btn-block fallback-btn" href="/">Paste a token instead</a>
	</div>
</div>

<style>
	.scan-scroll {
		padding-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.viewport {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 1;
		max-width: 380px;
		margin: 0 auto;
		background: #000;
		border-radius: 18px;
		overflow: hidden;
		box-shadow: 0 0 0 1px var(--line-2);
	}

	.video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(0, 0, 0, 0.78);
		color: var(--ink-on-dark, #fff);
		text-align: center;
	}

	.overlay-text {
		font-size: 13px;
		line-height: 1.5;
		max-width: 280px;
		margin: 0;
	}

	.hint {
		text-align: center;
		font-size: 11px;
		letter-spacing: 0.06em;
		margin: 0;
	}

	.detail {
		text-align: center;
		font-size: 12px;
		color: var(--ink-2);
		margin: 0;
	}

	.fallback-btn {
		margin-top: 4px;
	}
</style>
