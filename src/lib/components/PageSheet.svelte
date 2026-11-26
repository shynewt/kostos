<script lang="ts">
	import type { Snippet } from 'svelte';

	/* A whole page shown as a sheet over the app, like a compose screen on iOS: it slides up,
	 * and dragging its header down asks to close it. */

	type Props = {
		children: Snippet;
		/** a drag past the threshold; the page decides whether to close() */
		onRequestClose: () => void;
		/** after the slide-out, to navigate away */
		onClosed: () => void;
	};

	let { children, onRequestClose, onClosed }: Props = $props();

	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const MOTION_MS = reducedMotion ? 0 : 260;
	const CLOSE_DISTANCE_PX = 110;
	const CLOSE_SPEED_PX_PER_MS = 0.5;
	const FLICK_MIN_PX = 20;

	let dragY = $state(0);
	let isDragging = $state(false);
	let isClosing = $state(false);
	let dragStart: { y: number; time: number; pointerId: number } | null = null;

	export function close() {
		if (isClosing) return;
		isClosing = true;
		setTimeout(onClosed, MOTION_MS);
	}

	function isDragHandle(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return false;
		if (target.closest('button, a, input, textarea, select, [role="radio"]')) return false;
		return target.closest('.page-sheet-grabber, .app-bar') !== null;
	}

	function onPointerDown(event: PointerEvent) {
		if (isClosing || !isDragHandle(event.target)) return;
		event.preventDefault();
		dragStart = { y: event.clientY, time: event.timeStamp, pointerId: event.pointerId };
		isDragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (dragStart?.pointerId !== event.pointerId) return;
		dragY = Math.max(0, event.clientY - dragStart.y);
	}

	function onPointerEnd(event: PointerEvent) {
		if (dragStart?.pointerId !== event.pointerId) return;
		const speed = dragY / Math.max(1, event.timeStamp - dragStart.time);
		const isClose = dragY > CLOSE_DISTANCE_PX || (dragY > FLICK_MIN_PX && speed > CLOSE_SPEED_PX_PER_MS);
		dragStart = null;
		isDragging = false;
		if (isClose) onRequestClose();
		dragY = 0;
	}
</script>

<div class="page-sheet-backdrop" class:is-closing={isClosing} style:--motion="{MOTION_MS}ms" style:opacity={isClosing ? 0 : 1 - Math.min(dragY / 600, 0.6)}></div>
<div
	class="page-sheet"
	role="presentation"
	class:is-dragging={isDragging}
	class:is-closing={isClosing}
	style:--motion="{MOTION_MS}ms"
	style:transform={isClosing ? 'translateY(100%)' : dragY > 0 ? `translateY(${dragY}px)` : undefined}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerEnd}
	onpointercancel={onPointerEnd}
>
	<div class="page-sheet-grabber" aria-hidden="true"></div>
	{@render children()}
</div>

<style>
	.page-sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgb(0 0 0 / 0.55);
		transition: opacity var(--motion) ease;
	}

	.page-sheet {
		--sheet-top: calc(10px + env(safe-area-inset-top, 0px));
		position: fixed;
		top: var(--sheet-top);
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 1001;
		max-width: 480px;
		margin-inline: auto;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		border: 1px solid var(--line);
		border-bottom: 0;
		border-radius: 16px 16px 0 0;
		overflow: hidden;
		animation: page-sheet-in var(--motion) cubic-bezier(0.2, 0.8, 0.2, 1);
		transition: transform var(--motion) cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.page-sheet.is-dragging {
		transition: none;
	}

	.page-sheet.is-closing {
		transition-timing-function: ease-in;
	}

	@keyframes page-sheet-in {
		from {
			transform: translateY(100%);
		}
	}

	.page-sheet-grabber {
		flex: none;
		width: 36px;
		height: 4px;
		margin: 6px auto 0;
		border-radius: 999px;
		background: var(--line-2);
		cursor: grab;
	}

	.page-sheet :global(.screen) {
		flex: 1;
		min-height: 0;
		height: auto;
	}

	.page-sheet :global(.app-bar) {
		cursor: grab;
		touch-action: none;
	}
</style>
