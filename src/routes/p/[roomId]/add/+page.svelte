<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AddExpenseSheet from '$lib/components/AddExpenseSheet.svelte';

	// reached by reload or a link; the + button opens the same sheet over the current screen
	const roomId = $derived(page.params.roomId ?? '');
</script>

<AddExpenseSheet onLeave={() => goto(`/p/${roomId}`, { replaceState: true })} />
