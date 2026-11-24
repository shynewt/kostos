<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { formatAmount, formatSigned } from '$lib/money';
	import type { PersonTotals } from '$lib/stats';
	import type { Member } from '$lib/types';

	type Props = {
		rows: PersonTotals[];
		membersById: Map<string, Member>;
		currentMemberId: string | null;
		symbol: string;
		currency: string;
	};

	let { rows, membersById, currentMemberId, symbol, currency }: Props = $props();

	const maxGap = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.difference))));

	function standing(difference: number): string {
		if (difference > 0) return 'ahead';
		if (difference < 0) return 'behind';
		return 'even';
	}
</script>

<ul class="card person-card">
	{#each rows as row, i (row.memberId)}
		{@const member = membersById.get(row.memberId)}
		{@const widthPct = (Math.abs(row.difference) / maxGap) * 50}
		{#if i > 0}<li class="person-divider" aria-hidden="true"><hr class="hairline" /></li>{/if}
		<li class="person-row">
			<Avatar {member} size="sm" />
			<div class="person-body">
				<div class="person-top">
					<span class="person-name">
						{member?.name ?? 'Former member'}{#if row.memberId === currentMemberId}<span class="dim">{' (you)'}</span>{/if}
					</span>
					<span
						class="num person-gap"
						class:ahead={row.difference > 0}
						class:behind={row.difference < 0}
					>
						{formatSigned(row.difference, symbol, currency)}
					</span>
				</div>
				<div class="person-meta">
					<span class="dim">Share {formatAmount(row.cost, symbol, currency)} · Paid {formatAmount(row.paid, symbol, currency)}</span>
					<span class="dim person-standing">{standing(row.difference)}</span>
				</div>
				<div class="gap-track" aria-hidden="true">
					<span
						class="gap-fill"
						class:ahead={row.difference > 0}
						class:behind={row.difference < 0}
						style="width: {widthPct}%; {row.difference < 0 ? `right: 50%` : `left: 50%`};"
					></span>
				</div>
			</div>
		</li>
	{/each}
</ul>

<style>
	.person-card {
		list-style: none;
		margin: 0;
		padding: 4px;
	}

	.person-divider .hairline {
		margin-left: 56px;
	}

	.person-row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
	}

	.person-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.person-top,
	.person-meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}

	.person-name {
		font-size: 14px;
		font-weight: 600;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.person-gap {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 600;
	}

	.person-gap.ahead {
		color: var(--owed);
	}

	.person-gap.behind {
		color: var(--owe);
	}

	.person-meta {
		font-size: 12px;
	}

	.person-standing {
		flex-shrink: 0;
	}

	.gap-track {
		position: relative;
		height: 4px;
		margin-top: 6px;
		border-radius: 999px;
		background: var(--line);
	}

	.gap-track::after {
		content: '';
		position: absolute;
		left: 50%;
		top: -3px;
		bottom: -3px;
		width: 1px;
		background: var(--line-2);
	}

	.gap-fill {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 999px;
	}

	.gap-fill.ahead {
		background: var(--owed);
	}

	.gap-fill.behind {
		background: var(--owe);
	}
</style>
