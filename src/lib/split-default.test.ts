import { describe, expect, it } from 'vitest';
import { MAX_SPLIT_WEIGHT, defaultSplitSeed, splitWeight } from './split-default';
import type { Expense, Member } from './types';

const member = (id: string, splitWeight?: number): Member => ({ id, name: id, createdAt: 0, splitWeight });

function expense(over: Partial<Expense> = {}): Expense {
	return {
		id: 'e',
		payments: [{ memberId: 'a', amount: 1000 }],
		amount: 1000,
		currency: 'EUR',
		date: 0,
		splitMode: 'even',
		splits: [{ memberId: 'a' }, { memberId: 'b' }],
		createdAt: 1,
		createdBy: 'a',
		...over
	};
}

describe('splitWeight', () => {
	it('treats a missing weight as 1', () => {
		expect(splitWeight(member('a'))).toBe(1);
	});

	it('keeps whole numbers and rounds fractions', () => {
		expect(splitWeight(member('a', 3))).toBe(3);
		expect(splitWeight(member('a', 2.6))).toBe(3);
	});

	it('clamps to the allowed range and survives garbage', () => {
		expect(splitWeight(member('a', 0))).toBe(1);
		expect(splitWeight(member('a', -4))).toBe(1);
		expect(splitWeight(member('a', Number.NaN))).toBe(1);
		expect(splitWeight(member('a', 10_000))).toBe(MAX_SPLIT_WEIGHT);
	});
});

describe('defaultSplitSeed', () => {
	const members = [member('a', 1), member('b', 2)];

	it('leaves the form alone when the group splits evenly', () => {
		expect(defaultSplitSeed('even', members, [expense()], 'a')).toBeNull();
		expect(defaultSplitSeed(undefined, members, [expense()], 'a')).toBeNull();
	});

	describe('fixed ratio', () => {
		it('seeds shares from each member weight', () => {
			expect(defaultSplitSeed('ratio', members, [], 'a')).toEqual({
				splitMode: 'shares',
				splits: [
					{ memberId: 'a', shares: 1 },
					{ memberId: 'b', shares: 2 }
				]
			});
		});

		it('stays even when every weight is the same', () => {
			expect(defaultSplitSeed('ratio', [member('a'), member('b', 1)], [], 'a')).toBeNull();
			expect(defaultSplitSeed('ratio', [member('a', 3), member('b', 3)], [], 'a')).toBeNull();
		});

		it('gives members without a weight a share of 1', () => {
			const seed = defaultSplitSeed('ratio', [member('a'), member('b', 2), member('c')], [], null);
			expect(seed?.splits).toEqual([
				{ memberId: 'a', shares: 1 },
				{ memberId: 'b', shares: 2 },
				{ memberId: 'c', shares: 1 }
			]);
		});

		it('does not depend on who is creating the expense', () => {
			expect(defaultSplitSeed('ratio', members, [], 'b')).toEqual(defaultSplitSeed('ratio', members, [], 'a'));
		});
	});

	describe('match my last expense', () => {
		it('copies the latest expense the current member created', () => {
			const older = expense({ id: 'old', createdAt: 1, splitMode: 'even', splits: [{ memberId: 'a' }] });
			const latest = expense({
				id: 'new',
				createdAt: 5,
				splitMode: 'shares',
				splits: [
					{ memberId: 'a', shares: 1 },
					{ memberId: 'b', shares: 3 }
				]
			});
			expect(defaultSplitSeed('last', members, [latest, older], 'a')).toEqual({
				splitMode: 'shares',
				splits: latest.splits
			});
		});

		it('is chosen by creation time, not list order or expense date', () => {
			const early = expense({ id: 'early', createdAt: 1, date: 900, splits: [{ memberId: 'a' }] });
			const late = expense({ id: 'late', createdAt: 9, date: 100, splits: [{ memberId: 'b' }] });
			expect(defaultSplitSeed('last', members, [late, early], 'a')?.splits).toEqual([{ memberId: 'b' }]);
			expect(defaultSplitSeed('last', members, [early, late], 'a')?.splits).toEqual([{ memberId: 'b' }]);
		});

		it('keeps each creator separate', () => {
			const byA = expense({ id: 'x', createdBy: 'a', createdAt: 2, splits: [{ memberId: 'a' }] });
			const byB = expense({
				id: 'y',
				createdBy: 'b',
				createdAt: 3,
				splitMode: 'shares',
				splits: [
					{ memberId: 'a', shares: 1 },
					{ memberId: 'b', shares: 2 }
				]
			});
			expect(defaultSplitSeed('last', members, [byA, byB], 'a')?.splitMode).toBe('even');
			expect(defaultSplitSeed('last', members, [byA, byB], 'b')?.splitMode).toBe('shares');
		});

		it('ignores settlements', () => {
			const real = expense({ id: 'real', createdAt: 1, splits: [{ memberId: 'a' }, { memberId: 'b' }] });
			const settle = expense({ id: 's', createdAt: 9, isSettlement: true, splits: [{ memberId: 'b' }] });
			expect(defaultSplitSeed('last', members, [real, settle], 'a')?.splits).toEqual(real.splits);
		});

		it('falls back to even with no history, no current member, or an exact-amount split', () => {
			expect(defaultSplitSeed('last', members, [], 'a')).toBeNull();
			expect(defaultSplitSeed('last', members, [expense()], null)).toBeNull();
			const exact = expense({
				splitMode: 'amount',
				splits: [
					{ memberId: 'a', amount: 400 },
					{ memberId: 'b', amount: 600 }
				]
			});
			expect(defaultSplitSeed('last', members, [exact], 'a')).toBeNull();
		});

		it('drops members who were removed since, and gives up if none are left', () => {
			const withGone = expense({
				splitMode: 'shares',
				splits: [
					{ memberId: 'a', shares: 2 },
					{ memberId: 'gone', shares: 1 }
				]
			});
			expect(defaultSplitSeed('last', members, [withGone], 'a')?.splits).toEqual([{ memberId: 'a', shares: 2 }]);

			const onlyGone = expense({ splits: [{ memberId: 'gone' }] });
			expect(defaultSplitSeed('last', members, [onlyGone], 'a')).toBeNull();
		});

		it('does not mutate the expense it copies', () => {
			const source = expense({ splits: [{ memberId: 'a' }, { memberId: 'gone' }] });
			const before = structuredClone(source);
			defaultSplitSeed('last', members, [source], 'a');
			expect(source).toEqual(before);
		});
	});
});
