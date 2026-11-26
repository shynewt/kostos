<script lang="ts">
	import { pushState } from '$app/navigation';

	type Tab = 'home' | 'expenses' | 'stats' | 'group';

	type Props = {
		roomId: string;
		active: Tab;
	};

	let { roomId, active }: Props = $props();

	// opens the form over this screen; a new tab or a reload gets the full /add page instead
	function openAddSheet(event: MouseEvent) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		pushState(`/p/${roomId}/add`, { addingExpense: true });
	}
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
	<a class="fab" href="/p/{roomId}/add" aria-label="Add expense" onclick={openAddSheet}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
	</a>
	<a href="/p/{roomId}/stats" class="tab" class:active={active === 'stats'}>
		<div class="tab-icon">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h16M7 20V10M12 20V4M17 20v-7" /></svg>
		</div>
		<span>STATS</span>
	</a>
	<a href="/p/{roomId}/settings" class="tab" class:active={active === 'group'}>
		<div class="tab-icon">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="2.6" /><path d="M19 12a7 7 0 0 0-.16-1.5l2.05-1.58-2-3.46-2.43.83a7 7 0 0 0-2.59-1.5L13.5 2h-3l-.37 2.79a7 7 0 0 0-2.59 1.5l-2.43-.83-2 3.46L5.16 10.5A7 7 0 0 0 5 12a7 7 0 0 0 .16 1.5l-2.05 1.58 2 3.46 2.43-.83a7 7 0 0 0 2.59 1.5L10.5 22h3l.37-2.79a7 7 0 0 0 2.59-1.5l2.43.83 2-3.46-2.05-1.58A7 7 0 0 0 19 12z" /></svg>
		</div>
		<span>GROUP</span>
	</a>
</nav>
