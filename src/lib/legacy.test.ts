import { describe, expect, it } from 'vitest';
import { isLegacySecret } from './legacy';

describe('isLegacySecret', () => {
	it('flags every stored secret that is not a current one', () => {
		for (const length of [0, 1, 21, 23, 42, 43, 44, 64]) {
			expect(isLegacySecret('A'.repeat(length))).toBe(true);
		}
		expect(isLegacySecret(`${'A'.repeat(21)}!`)).toBe(true);
	});

	it('leaves current secrets alone', () => {
		expect(isLegacySecret('AAECAwQFBgcICQoLDA0ODw')).toBe(false);
	});
});
