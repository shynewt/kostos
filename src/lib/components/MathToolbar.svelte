<script lang="ts">
	import { onMount } from 'svelte';
	import { mathInputTarget } from '$lib/mathInputTarget';

	/* Floating row of math operators that sits flush against the top of the on-screen
	 * keyboard. Active only on coarse-pointer devices (phones/tablets), where the native
	 * `decimal` keyboard hides +, -, *, /, (, ). On desktop the component renders nothing. */

	const KEYS = ['(', ')', '+', '−', '×', '÷'] as const;
	const INSERT: Record<(typeof KEYS)[number], string> = {
		'(': '(',
		')': ')',
		'+': '+',
		'−': '-',
		'×': '*',
		'÷': '/'
	};

	let isCoarse = $state(false);
	let target = $state<HTMLInputElement | null>(null);
	let keyboardOffset = $state(0);

	const unsubscribe = mathInputTarget.subscribe((node) => {
		target = node;
	});

	onMount(() => {
		isCoarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
		const vv = window.visualViewport;
		if (!vv) return () => unsubscribe();

		function recompute() {
			const offset = window.innerHeight - vv!.height - vv!.offsetTop;
			keyboardOffset = Math.max(0, Math.round(offset));
		}

		recompute();
		vv.addEventListener('resize', recompute);
		vv.addEventListener('scroll', recompute);
		return () => {
			vv.removeEventListener('resize', recompute);
			vv.removeEventListener('scroll', recompute);
			unsubscribe();
		};
	});

	function insertChar(ch: string) {
		if (!target) return;
		const start = target.selectionStart ?? target.value.length;
		const end = target.selectionEnd ?? target.value.length;
		target.value = target.value.slice(0, start) + ch + target.value.slice(end);
		const caret = start + ch.length;
		target.selectionStart = target.selectionEnd = caret;
		target.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function backspace() {
		if (!target) return;
		const start = target.selectionStart ?? 0;
		const end = target.selectionEnd ?? 0;
		if (start !== end) {
			target.value = target.value.slice(0, start) + target.value.slice(end);
			target.selectionStart = target.selectionEnd = start;
		} else if (start > 0) {
			target.value = target.value.slice(0, start - 1) + target.value.slice(start);
			target.selectionStart = target.selectionEnd = start - 1;
		} else {
			return;
		}
		target.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function handlePointerDown(event: PointerEvent, action: () => void) {
		// Prevent the input from losing focus when a key is tapped.
		event.preventDefault();
		action();
	}

	const visible = $derived(isCoarse && target !== null);
	let toolbarHeight = $state(0);

	// lets pinned footers (the expense form's Save bar) sit above the toolbar instead of under it
	$effect(() => {
		const space = visible ? toolbarHeight + keyboardOffset : 0;
		document.documentElement.style.setProperty('--math-toolbar-space', `${space}px`);
		return () => document.documentElement.style.removeProperty('--math-toolbar-space');
	});
</script>

{#if visible}
	<div
		class="math-toolbar"
		bind:offsetHeight={toolbarHeight}
		style="bottom: {keyboardOffset}px"
		role="toolbar"
		aria-label="Math operators"
	>
		{#each KEYS as key (key)}
			<button
				type="button"
				class="math-key"
				aria-label={`Insert ${INSERT[key]}`}
				onpointerdown={(e) => handlePointerDown(e, () => insertChar(INSERT[key]))}
			>
				{key}
			</button>
		{/each}
		<button
			type="button"
			class="math-key math-key-back"
			aria-label="Backspace"
			onpointerdown={(e) => handlePointerDown(e, backspace)}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
				<path d="M18 9l-5 6M13 9l5 6" />
			</svg>
		</button>
	</div>
{/if}

<style>
	.math-toolbar {
		position: fixed;
		left: 0;
		right: 0;
		display: flex;
		gap: 6px;
		padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
		background: var(--bg-2);
		border-top: 1px solid var(--line);
		z-index: 1000;
		box-shadow: 0 -2px 10px color-mix(in oklab, black 18%, transparent);
		touch-action: manipulation;
	}

	.math-key {
		flex: 1;
		min-height: 38px;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 18px;
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.math-key:active {
		background: color-mix(in oklab, var(--accent) 20%, var(--bg));
		border-color: var(--accent);
	}

	.math-key-back {
		flex: 1.2;
	}

	.math-key-back svg {
		width: 20px;
		height: 20px;
	}
</style>
