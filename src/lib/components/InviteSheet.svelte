<script lang="ts" module>
	import { invitePath } from '$lib/invite';
	import { isLegacySecret } from '$lib/legacy';
	import { findProject } from '$lib/storage';

	/** Null when this device has no secret for the group, or only an old one that can't invite. */
	export function groupInviteUrl(roomId: string): string | null {
		const stored = findProject(roomId);
		if (!stored || isLegacySecret(stored.secret)) return null;
		return `${location.origin}${invitePath(stored.secret)}`;
	}
</script>

<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import QrCode from './QrCode.svelte';

	/** a null url means there's nothing to share: the demo only lives on this phone */
	type Props = { url: string | null; groupName: string; onclose: () => void };
	let { url, groupName, onclose }: Props = $props();

	let copied = $state(false);
	let urlInput = $state<HTMLInputElement>();
	const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

	async function copyLink() {
		if (url === null) return;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			urlInput?.select();
		}
	}

	async function shareLink() {
		if (url === null) return;
		try {
			await navigator.share({ title: `Join ${groupName} on Kostos`, url });
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			await copyLink();
		}
	}
</script>

<BottomSheet title="Invite people" {onclose}>
	{#if url === null}
		<p class="demo-note">
			The demo only lives on this phone, so it has no invite link. Create your own group to invite people.
		</p>
		<div class="actions">
			<button class="btn" type="button" onclick={onclose}>Close</button>
			<a class="btn btn-primary" href="/new">Create a group</a>
		</div>
	{:else}
		<div class="qr-wrap">
			<QrCode value={url} size={200} />
			<p class="dim mono qr-caption">SCAN TO JOIN</p>
		</div>
		<input
			bind:this={urlInput}
			id="share-url-display"
			class="share-url-display"
			aria-label="Invite link"
			value={url}
			readonly
		/>
		<div class="actions">
			<button class="btn" class:btn-primary={!canShare} type="button" onclick={copyLink}>
				{#if copied}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
					<span>Copied</span>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 4H6a2 2 0 0 0-2 2v10" /></svg>
					<span>Copy link</span>
				{/if}
			</button>
			{#if canShare}
				<button class="btn btn-primary" type="button" onclick={shareLink}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 4v12M8 8l4-4 4 4M5 14v5h14v-5" /></svg>
					<span>Share</span>
				</button>
			{/if}
		</div>
		<p class="dim share-hint">
			Anyone with this link can join the group. The key sits after the # in the link, so the server never receives it.
		</p>
	{/if}
</BottomSheet>

<style>
	.demo-note {
		margin: 12px 0 4px;
		color: var(--ink-2);
		font-size: 15px;
		line-height: 1.5;
		text-align: center;
		text-wrap: balance;
	}

	.qr-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		margin: 16px auto 4px;
	}

	.qr-caption {
		font-size: 10px;
		letter-spacing: 0.08em;
		margin: 0;
	}

	.share-url-display {
		margin-top: 12px;
		width: 100%;
		background: transparent;
		border: 1px dashed var(--line-2);
		border-radius: var(--radius-sm);
		padding: 10px 12px;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-2);
		outline: none;
		text-align: center;
	}

	.actions {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}

	.actions .btn {
		flex: 1;
		padding: 13px;
		font-size: 14px;
	}

	.share-hint {
		font-size: 12px;
		line-height: 1.5;
		margin: 12px 0 0;
		text-align: center;
	}
</style>
