<script lang="ts">
	import type { Settlement } from '$lib/balance';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatAmount } from '$lib/money';
	import type { Member } from '$lib/types';

	type Props = {
		members: Member[];
		plan: Settlement[];
		currentMemberId: string | null;
		symbol: string;
		currency: string;
	};

	let { members, plan, currentMemberId, symbol, currency }: Props = $props();

	const NODE_R = 20;
	const ROW_GAP = 62;
	const PAD_TOP = 10;
	const PAD_BOTTOM = 8;
	const LABEL_H = 16;
	const VIEW_W = 300;
	const LEFT_X = 66;
	const RIGHT_X = VIEW_W - 66;
	// lines leaving the same avatar start this far apart, so none runs along another. Lines
	// arriving at one avatar still meet at a single point and share one arrowhead.
	const PORT_GAP = 5;
	// room for the arrowhead's tip, so it stops at the avatar instead of poking into it
	const ARROW_CLEARANCE = 2;

	const membersById = $derived(new Map(members.map((m) => [m.id, m])));

	// A settlement plan is bipartite: every transfer is debtor -> creditor and a member sits
	// on exactly one side. So we lay payers down the left, receivers down the right, and the
	// arrows never converge on a single hub the way the old circular layout did.
	const layout = $derived.by(() => {
		const payTotals = new Map<string, number>();
		const recvTotals = new Map<string, number>();
		let maxAmount = 1;
		for (const t of plan) {
			payTotals.set(t.from, (payTotals.get(t.from) ?? 0) + t.amount);
			recvTotals.set(t.to, (recvTotals.get(t.to) ?? 0) + t.amount);
			if (t.amount > maxAmount) maxAmount = t.amount;
		}
		const debtors = [...payTotals.keys()].sort((a, b) => payTotals.get(b)! - payTotals.get(a)!);
		const creditors = [...recvTotals.keys()].sort(
			(a, b) => recvTotals.get(b)! - recvTotals.get(a)!
		);

		const rows = Math.max(debtors.length, creditors.length);
		const centerY = PAD_TOP + NODE_R + ((rows - 1) * ROW_GAP) / 2;
		const height = PAD_TOP + NODE_R + (rows - 1) * ROW_GAP + NODE_R + LABEL_H + PAD_BOTTOM;

		function place(ids: string[], x: number) {
			const first = centerY - ((ids.length - 1) * ROW_GAP) / 2;
			return new Map(ids.map((id, i) => [id, { id, x, y: first + i * ROW_GAP }]));
		}
		const leftPos = place(debtors, LEFT_X);
		const rightPos = place(creditors, RIGHT_X);

		const nodes = [
			...[...leftPos.values()].map((p) => ({ ...p, side: 'left' as const })),
			...[...rightPos.values()].map((p) => ({ ...p, side: 'right' as const }))
		];

		// a payer's lines get stacked starting points, ordered by where each one ends so they fan
		// out without crossing. The line pointing most nearly straight across keeps the centre,
		// so a level line stays level and only the others step aside.
		const startOffsets = new Map<Settlement, number>();
		for (const id of debtors) {
			const ownY = leftPos.get(id)!.y;
			const endY = (t: Settlement) => rightPos.get(t.to)?.y ?? ownY;
			const ordered = plan.filter((t) => t.from === id).toSorted((a, b) => endY(a) - endY(b));
			const drift = (t: Settlement) => Math.abs(endY(t) - ownY);
			const anchor = ordered.indexOf(ordered.reduce((best, t) => (drift(t) < drift(best) ? t : best)));
			ordered.forEach((t, i) => startOffsets.set(t, (i - anchor) * PORT_GAP));
		}
		// a port moved up or down still sits on the avatar's edge, not inside it
		const rimX = (dy: number) => Math.sqrt(NODE_R ** 2 - Math.min(dy * dy, (NODE_R - 4) ** 2));

		const edges = plan
			.map((t) => {
				const a = leftPos.get(t.from);
				const b = rightPos.get(t.to);
				if (!a || !b) return null;
				const mine = t.from === currentMemberId || t.to === currentMemberId;
				const base = 1 + (t.amount / maxAmount) * 1.4;
				const startDy = startOffsets.get(t) ?? 0;
				return {
					key: `${t.from}>${t.to}`,
					x1: a.x + rimX(startDy),
					y1: a.y + startDy,
					x2: b.x - NODE_R - ARROW_CLEARANCE,
					y2: b.y,
					width: mine ? base : base * 0.7,
					amount: t.amount,
					tone: mine ? 'mine' : 'other'
				};
			})
			.filter((e) => e !== null)
			// yours are drawn last, so a grey line never crosses over a green one
			.sort((a, b) => Number(a.tone === 'mine') - Number(b.tone === 'mine'));

		return { nodes, edges, height };
	});

	function nodeName(id: string): string {
		if (id === currentMemberId) return 'YOU';
		return (membersById.get(id)?.name ?? '—').toUpperCase();
	}

	function arrowMarker(tone: string): string {
		return tone === 'mine' ? 'url(#kostos-arrow-mine)' : 'url(#kostos-arrow-other)';
	}
</script>

<svg
	viewBox="0 0 {VIEW_W} {layout.height}"
	class="net-svg"
	style="aspect-ratio: {VIEW_W} / {layout.height};"
	preserveAspectRatio="xMidYMid meet"
>
	<defs>
		<!-- userSpaceOnUse keeps arrowheads a fixed size instead of scaling with stroke width -->
		<marker id="kostos-arrow-mine" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
			<path d="M0 0 L8 4 L0 8 z" fill="var(--accent)" />
		</marker>
		<marker id="kostos-arrow-other" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
			<path d="M0 0 L8 4 L0 8 z" fill="var(--ink-3)" />
		</marker>
	</defs>

	{#each layout.edges as e (e.key)}
		{@const midX = (e.x1 + e.x2) / 2}
		<path
			class="edge-path edge-{e.tone}"
			d="M{e.x1} {e.y1} C {midX} {e.y1} {midX} {e.y2} {e.x2} {e.y2}"
			fill="none"
			style="stroke-width: {e.width};"
			marker-end={arrowMarker(e.tone)}
		/>
	{/each}

	<!-- every amount goes on after every line, so no line runs across a label -->
	{#each layout.edges as e (e.key)}
		<g class="edge-{e.tone}" transform="translate({(e.x1 + e.x2) / 2} {(e.y1 + e.y2) / 2})">
			<rect x="-24" y="-9" width="48" height="18" rx="4" class="edge-label-bg" />
			<text x="0" y="3.5" text-anchor="middle" class="edge-label">
				{formatAmount(e.amount, symbol, currency)}
			</text>
		</g>
	{/each}

	{#each layout.nodes as p (p.id)}
		<foreignObject x={p.x - 22} y={p.y - 22} width="44" height="44">
			<div class="node-fo" xmlns="http://www.w3.org/1999/xhtml">
				<Avatar member={membersById.get(p.id)} size="md" active={p.id === currentMemberId} />
			</div>
		</foreignObject>
		<text x={p.x} y={p.y + NODE_R + 14} text-anchor="middle" class="node-label">{nodeName(p.id)}</text>
	{/each}
</svg>

<style>
	.net-svg {
		width: 100%;
		max-width: 460px;
		display: block;
		margin: 0 auto;
	}

	.edge-path {
		fill: none;
	}

	.edge-path.edge-mine {
		stroke: var(--accent);
	}

	.edge-path.edge-other {
		stroke: var(--ink-3);
	}

	.edge-label-bg {
		fill: var(--bg);
		stroke: none;
	}

	.edge-label {
		font-size: 10.5px;
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.edge-mine .edge-label {
		fill: var(--accent);
	}

	.edge-other .edge-label {
		fill: var(--ink-2);
	}

	.node-fo {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
	}

	.node-label {
		fill: var(--ink-2);
		font-size: 8.5px;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
	}
</style>
