<script lang="ts" module>
	// sheets can nest (a trip picker inside expense details); only the top one answers Escape
	const openSheetIds: string[] = [];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';

	type Props = {
		title: string;
		onclose: () => void;
		/** blocks closing, e.g. while a save is in flight */
		locked?: boolean;
		icon?: Snippet;
		children: Snippet;
	};

	let { title, onclose, locked = false, icon, children }: Props = $props();

	const sheetId = $props.id();
	const titleId = `${sheetId}-title`;

	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const motionMs = reducedMotion ? 0 : 220;

	// a short fast flick closes it too, not only a long drag
	const CLOSE_DISTANCE_PX = 110;
	const CLOSE_SPEED_PX_PER_MS = 0.5;

	let isClosing = $state(false);
	let dragOffset = $state(0);
	let isDragging = $state(false);
	let dragStartY = 0;
	let lastMoveY = 0;
	let lastMoveTime = 0;
	let dragSpeed = 0;

	function close() {
		if (!locked && !isClosing) onclose();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && openSheetIds.at(-1) === sheetId) close();
	}

	function focusOnOpen(node: HTMLElement) {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		openSheetIds.push(sheetId);
		if (!node.contains(document.activeElement)) node.focus({ preventScroll: true });
		return {
			destroy() {
				openSheetIds.splice(openSheetIds.indexOf(sheetId), 1);
				if (opener?.isConnected) opener.focus({ preventScroll: true });
			}
		};
	}

	// starts from wherever a drag left the sheet, so a dragged sheet keeps going down instead of jumping back up
	function slideFromBottom(node: HTMLElement) {
		const startOffset = dragOffset;
		const travel = node.offsetHeight + 24;
		return {
			duration: motionMs,
			easing: cubicOut,
			css: (progress: number) => `transform: translateY(${startOffset + (1 - progress) * (travel - startOffset)}px)`
		};
	}

	function onHandlePointerDown(event: PointerEvent) {
		if (event.button !== 0 || locked) return;
		// a mouse drag would otherwise select text on the page behind the sheet
		event.preventDefault();
		if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
		isDragging = true;
		dragStartY = lastMoveY = event.clientY;
		lastMoveTime = event.timeStamp;
		dragSpeed = 0;
	}

	function onHandlePointerMove(event: PointerEvent) {
		if (!isDragging) return;
		const elapsed = event.timeStamp - lastMoveTime;
		if (elapsed > 0) dragSpeed = (event.clientY - lastMoveY) / elapsed;
		lastMoveY = event.clientY;
		lastMoveTime = event.timeStamp;
		dragOffset = Math.max(0, event.clientY - dragStartY);
	}

	function onHandlePointerUp() {
		if (!isDragging) return;
		isDragging = false;
		const isFlick = dragSpeed > CLOSE_SPEED_PX_PER_MS && dragOffset > 20;
		if (dragOffset > CLOSE_DISTANCE_PX || isFlick) close();
		else dragOffset = 0;
	}

	function onHandlePointerCancel() {
		isDragging = false;
		dragOffset = 0;
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
	class="sheet-backdrop"
	role="presentation"
	onclick={close}
	transition:fade={{ duration: reducedMotion ? 0 : 180 }}
></div>
<div
	class="sheet"
	class:is-dragging={isDragging}
	role="dialog"
	aria-modal="true"
	aria-labelledby={titleId}
	tabindex="-1"
	style:transform={dragOffset ? `translateY(${dragOffset}px)` : null}
	use:focusOnOpen
	transition:slideFromBottom
	onoutrostart={() => (isClosing = true)}
>
	<div
		class="sheet-handle"
		role="presentation"
		onpointerdown={onHandlePointerDown}
		onpointermove={onHandlePointerMove}
		onpointerup={onHandlePointerUp}
		onpointercancel={onHandlePointerCancel}
	>
		<div class="grabber" aria-hidden="true"></div>
		{#if icon}<div class="sheet-icon">{@render icon()}</div>{/if}
		<h2 class="sheet-title" id={titleId}>{title}</h2>
	</div>
	{@render children()}
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		background: color-mix(in oklab, black 55%, transparent);
		z-index: 1100;
		cursor: pointer;
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		margin-inline: auto;
		width: 100%;
		max-width: 480px;
		max-height: 92dvh;
		overflow-y: auto;
		background: var(--bg-2);
		border-top-left-radius: 20px;
		border-top-right-radius: 20px;
		border: 1px solid var(--line);
		border-bottom: 0;
		padding: 0 20px calc(20px + max(env(safe-area-inset-bottom, 0px), var(--math-toolbar-space, 0px)));
		z-index: 1101;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		outline: none;
		box-shadow: 0 -10px 30px color-mix(in oklab, black 35%, transparent);
		transition: transform 0.2s ease-out;
	}

	.sheet.is-dragging {
		transition: none;
	}

	/* the whole top strip is the drag target, not just the thin grabber line */
	.sheet-handle {
		margin: 0 -20px;
		padding: 6px 20px 0;
		touch-action: none;
		cursor: grab;
		user-select: none;
	}

	.is-dragging .sheet-handle {
		cursor: grabbing;
	}

	.grabber {
		width: 36px;
		height: 4px;
		border-radius: 999px;
		background: var(--line-2);
		margin: 6px auto 14px;
	}

	.sheet-icon {
		display: flex;
		justify-content: center;
		margin-bottom: 10px;
	}

	.sheet-title {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.01em;
		text-align: center;
	}
</style>
