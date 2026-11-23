<script lang="ts">
	import { getContext } from 'svelte';
	import type { RoomState } from '$lib/sync/useRoom.svelte';
	type Tab = 'home' | 'expenses' | 'stats' | 'people';

	type Props = {
		roomId: string;
		active: Tab;
	};

	let { roomId, active }: Props = $props();
	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const locked = $derived(context?.room.locked ?? false);
</script>

<nav class="tabbar">
	<a href="/p/{roomId}" class="tab" class:active={active === 'home'}>
		<div class="tab-icon">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 11.5L12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8.5z" /></svg>
		</div>
		<span>HOME</span>
	</a>
	<a href="/p/{roomId}/expenses" class="tab" class:active={active === 'expenses'}>
		<div class="tab-icon">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
		</div>
		<span>EXPENSES</span>
	</a>
	<a class="fab" class:fab-locked={locked} href="/p/{roomId}/add" aria-label={locked ? 'Adding happens on the new site now' : 'Add expense'}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
	</a>
	<a href="/p/{roomId}/stats" class="tab" class:active={active === 'stats'}>
		<div class="tab-icon">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h16M7 20V10M12 20V4M17 20v-7" /></svg>
		</div>
		<span>STATS</span>
	</a>
	<a href="/p/{roomId}/people" class="tab" class:active={active === 'people'}>
		<div class="tab-icon">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="9" r="3.2" /><circle cx="16.5" cy="10" r="2.4" /><path d="M3.5 19c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5M14 19c.4-2.2 2-3.4 4-3.4s3.5 1.2 4 3.4" /></svg>
		</div>
		<span>PEOPLE</span>
	</a>
</nav>

<style>
	.fab-locked { background: var(--line-2); color: var(--ink-3); box-shadow: none; }
</style>
