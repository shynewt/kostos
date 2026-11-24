export type ToastAction = { label: string; run: () => void | Promise<void> };
export type ToastMessage = { id: number; text: string; action?: ToastAction };

const DEFAULT_DURATION_MS = 6000;

// one toast at a time: a newer message replaces the current one, as a snackbar does
let current = $state<ToastMessage | null>(null);
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

export function currentToast(): ToastMessage | null {
	return current;
}

export function showToast(text: string, action?: ToastAction, durationMs = DEFAULT_DURATION_MS): void {
	if (timer) clearTimeout(timer);
	const id = nextId++;
	current = { id, text, action };
	timer = setTimeout(() => dismissToast(id), durationMs);
}

export function dismissToast(id?: number): void {
	if (id !== undefined && current?.id !== id) return;
	if (timer) clearTimeout(timer);
	timer = null;
	current = null;
}
