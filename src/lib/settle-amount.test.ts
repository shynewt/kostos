import { describe, expect, it } from 'vitest';
import { parseSettleAmount } from './settle-amount';

describe('parseSettleAmount', () => {
	it('accepts the full amount', () => {
		expect(parseSettleAmount('45.20', 4520, 2)).toEqual({ cents: 4520, error: null });
	});

	it('accepts a partial amount, with a comma or as a sum', () => {
		expect(parseSettleAmount('20', 4520, 2)).toEqual({ cents: 2000, error: null });
		expect(parseSettleAmount('12,50', 4520, 2)).toEqual({ cents: 1250, error: null });
		expect(parseSettleAmount('10+5', 4520, 2)).toEqual({ cents: 1500, error: null });
	});

	it('works in whole units for zero-decimal currencies', () => {
		expect(parseSettleAmount('2000', 3000, 0)).toEqual({ cents: 2000, error: null });
	});

	it('rejects empty, malformed, zero and negative input', () => {
		expect(parseSettleAmount('', 4520, 2).error).toBe('Enter an amount.');
		expect(parseSettleAmount('  ', 4520, 2).error).toBe('Enter an amount.');
		expect(parseSettleAmount('12..', 4520, 2).error).toBe('That amount doesn’t look right.');
		expect(parseSettleAmount('0', 4520, 2).error).toBe('Enter an amount above zero.');
		expect(parseSettleAmount('0.001', 4520, 2).error).toBe('Enter an amount above zero.');
		expect(parseSettleAmount('5-10', 4520, 2).error).toBe('That amount doesn’t look right.');
	});

	it('rejects more than the transfer', () => {
		expect(parseSettleAmount('45.21', 4520, 2)).toEqual({ cents: 4521, error: 'That’s more than is owed.' });
	});
});
