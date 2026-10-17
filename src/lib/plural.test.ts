import { describe, expect, it } from 'vitest';
import { plural } from './plural';

describe('plural', () => {
	it('uses the singular only for exactly one', () => {
		expect(plural(0, 'expense', 'expenses')).toBe('0 expenses');
		expect(plural(1, 'expense', 'expenses')).toBe('1 expense');
		expect(plural(2, 'expense', 'expenses')).toBe('2 expenses');
	});
});
