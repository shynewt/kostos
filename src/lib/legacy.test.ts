import { describe, expect, it } from 'vitest';
import { isLegacySecret } from './legacy';

const legacy = Buffer.alloc(32, 7).toString('base64url');
const current = Buffer.alloc(16, 7).toString('base64url');

describe('isLegacySecret', () => {
	it('recognises the 43 character secrets earlier versions generated', () => {
		expect(legacy).toHaveLength(43);
		expect(isLegacySecret(legacy)).toBe(true);
	});

	it('does not mistake a current secret, another length or stray characters', () => {
		expect(current).toHaveLength(22);
		expect(isLegacySecret(current)).toBe(false);
		expect(isLegacySecret(legacy.slice(1))).toBe(false);
		expect(isLegacySecret(`${legacy}x`)).toBe(false);
		expect(isLegacySecret(`${legacy.slice(1)}!`)).toBe(false);
		expect(isLegacySecret('')).toBe(false);
	});
});
