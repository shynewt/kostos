const HOLD_MS = 450;
const MOVE_TOLERANCE_PX = 10;

/** Calls `onHold` once a press has stayed in place for a moment, and swallows the click its
 *  release would fire. Presses inside `[data-no-hold]` or a text field are left alone. */
export function longPress(node: HTMLElement, onHold: () => void) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let startX = 0;
	let startY = 0;
	let wasHeld = false;

	function cancel() {
		clearTimeout(timer);
		timer = undefined;
	}

	function onPointerDown(event: PointerEvent) {
		wasHeld = false;
		if (event.button !== 0) return;
		if (event.target instanceof Element && event.target.closest('input, [data-no-hold]')) return;
		startX = event.clientX;
		startY = event.clientY;
		timer = setTimeout(() => {
			timer = undefined;
			wasHeld = true;
			navigator.vibrate?.(10);
			onHold();
		}, HOLD_MS);
	}

	function onPointerMove(event: PointerEvent) {
		if (timer === undefined) return;
		if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE_PX) cancel();
	}

	function onClick(event: MouseEvent) {
		if (!wasHeld) return;
		wasHeld = false;
		event.preventDefault();
		event.stopPropagation();
	}

	// Android opens its own menu on a long press
	function onContextMenu(event: MouseEvent) {
		if (timer !== undefined || wasHeld) event.preventDefault();
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', cancel);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('pointerleave', cancel);
	node.addEventListener('click', onClick, true);
	node.addEventListener('contextmenu', onContextMenu);

	return {
		update(nextOnHold: () => void) {
			onHold = nextOnHold;
		},
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', cancel);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('pointerleave', cancel);
			node.removeEventListener('click', onClick, true);
			node.removeEventListener('contextmenu', onContextMenu);
		}
	};
}
