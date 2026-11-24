import { describe, expect, it } from 'vitest';
import { formatAmount, formatSigned, formatWholeAmount, toInputValue } from './money';

describe('formatAmount', () => {
	it('renders positive amounts with the currency symbol', () => {
		expect(formatAmount(8420, '€')).toBe('€84.20');
	});

	it('renders zero without a sign', () => {
		expect(formatAmount(0, '$')).toBe('$0.00');
	});

	it('uses a unicode minus on negatives', () => {
		expect(formatAmount(-1599, '£')).toBe('−£15.99');
	});

	it('thousands separator on large totals', () => {
		expect(formatAmount(123456789, '€')).toBe('€1,234,567.89');
	});

	it('renders JPY (zero-decimal) as whole units without a dot', () => {
		expect(formatAmount(990430, '¥', 'JPY')).toBe('¥990,430');
		expect(formatAmount(7861, '¥', 'JPY')).toBe('¥7,861');
		expect(formatAmount(-1350, '¥', 'JPY')).toBe('−¥1,350');
	});

	it('renders KRW (zero-decimal) as whole units', () => {
		expect(formatAmount(50000, '₩', 'KRW')).toBe('₩50,000');
	});
});

describe('formatSigned', () => {
	it('shows a plus on positive balances', () => {
		expect(formatSigned(1000, '€')).toBe('+€10.00');
	});

	it('strips the sign at zero', () => {
		expect(formatSigned(0, '€')).toBe('€0.00');
	});

	it('shows a unicode minus on negative balances', () => {
		expect(formatSigned(-500, '€')).toBe('−€5.00');
	});
});

describe('toInputValue', () => {
	it('renders an input-friendly decimal', () => {
		expect(toInputValue(1550)).toBe('15.50');
		expect(toInputValue(0)).toBe('0.00');
	});

	it('renders zero-decimal currencies as whole numbers', () => {
		expect(toInputValue(1350, 'JPY')).toBe('1350');
		expect(toInputValue(50000, 'KRW')).toBe('50000');
	});
});

describe('formatWholeAmount', () => {
	it('rounds to whole units with a thousands separator', () => {
		expect(formatWholeAmount(4449, '€', 'EUR')).toBe('€44');
		expect(formatWholeAmount(4450, '€', 'EUR')).toBe('€45');
		expect(formatWholeAmount(123456789, '€', 'EUR')).toBe('€1,234,568');
	});

	it('leaves zero-decimal currencies as they are', () => {
		expect(formatWholeAmount(1500, '¥', 'JPY')).toBe('¥1,500');
	});
});
