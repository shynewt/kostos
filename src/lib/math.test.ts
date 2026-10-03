import { describe, expect, it } from 'vitest';
import {
	evalExpression,
	evalToCents,
	isAllowedMathChar,
	dropsPrecision,
	stripDisallowedMathChars,
	toMinorUnits
} from './math';

describe('evalExpression', () => {
	it('returns a plain number unchanged', () => {
		expect(evalExpression('42')).toBe(42);
		expect(evalExpression('3.14')).toBe(3.14);
	});

	it('evaluates simple expressions', () => {
		expect(evalExpression('50/20-2')).toBeCloseTo(0.5);
		expect(evalExpression('(100+5)/3')).toBeCloseTo(35);
		expect(evalExpression('2.5*4')).toBe(10);
	});

	it('handles whitespace', () => {
		expect(evalExpression('  120 + 5 ')).toBe(125);
	});

	it('accepts comma as decimal separator', () => {
		expect(evalExpression('3,5+1,5')).toBe(5);
	});

	it('returns null on empty input', () => {
		expect(evalExpression('')).toBeNull();
		expect(evalExpression('   ')).toBeNull();
	});

	it('rejects identifier access', () => {
		expect(evalExpression('window')).toBeNull();
		expect(evalExpression('process.exit(0)')).toBeNull();
		expect(evalExpression('alert(1)')).toBeNull();
	});

	it('rejects string injection attempts', () => {
		expect(evalExpression('"foo"')).toBeNull();
		expect(evalExpression("'a'+1")).toBeNull();
	});

	it('rejects pure operator soup', () => {
		expect(evalExpression('+++')).toBeNull();
		expect(evalExpression('---')).toBeNull();
	});

	it('returns null when the expression throws or yields non-finite', () => {
		expect(evalExpression('1/0')).toBeNull();
		expect(evalExpression('5(')).toBeNull();
	});

	it('accepts a leading minus', () => {
		expect(evalExpression('-50/2')).toBe(-25);
	});
});

describe('toMinorUnits', () => {
	it('converts a clean decimal', () => {
		expect(toMinorUnits(15.5)).toBe(1550);
	});

	it('rounds away from zero on .5 boundaries', () => {
		expect(toMinorUnits(0.005)).toBe(1);
		expect(toMinorUnits(-0.005)).toBe(-1);
	});

	it('does not lose pennies on noisy floats', () => {
		expect(toMinorUnits(0.1 + 0.2)).toBe(30);
	});

	it('treats zero-decimal currencies as whole units', () => {
		// ¥2000 is 2000 minor units, not 200000
		expect(toMinorUnits(2000, 0)).toBe(2000);
		expect(evalToCents('2000', 0)).toBe(2000);
		expect(evalToCents('1000+1000', 0)).toBe(2000);
	});
});

describe('isAllowedMathChar', () => {
	it('accepts digits, operators, parens, comma, dot, whitespace', () => {
		for (const c of '0123456789+-*/(),. \t') expect(isAllowedMathChar(c)).toBe(true);
	});

	it('rejects letters and stray symbols', () => {
		for (const c of 'aZ€$£%&#@^_!?') expect(isAllowedMathChar(c)).toBe(false);
	});

	it('rejects empty and multi-character strings', () => {
		expect(isAllowedMathChar('')).toBe(false);
		expect(isAllowedMathChar('12')).toBe(false);
	});
});

describe('stripDisallowedMathChars', () => {
	it('keeps allowed characters intact', () => {
		expect(stripDisallowedMathChars('(120 + 5) / 3')).toBe('(120 + 5) / 3');
	});

	it('strips currency prefixes and labels', () => {
		expect(stripDisallowedMathChars('€84.20')).toBe('84.20');
		expect(stripDisallowedMathChars('$1,200.50')).toBe('1,200.50');
		expect(stripDisallowedMathChars('USD 42')).toBe(' 42');
	});

	it('returns empty for fully-invalid input', () => {
		expect(stripDisallowedMathChars('abc')).toBe('');
	});
});

describe('evalToCents', () => {
	it('round-trips a typical receipt math', () => {
		expect(evalToCents('(120+5)/3')).toBe(4167);
	});

	it('returns null for invalid input', () => {
		expect(evalToCents('foo')).toBeNull();
	});
});

describe('dropsPrecision', () => {
	it('flags values finer than the stored scale', () => {
		expect(dropsPrecision(1.234, 2)).toBe(true);
		expect(dropsPrecision(10 / 3, 2)).toBe(true);
		expect(dropsPrecision(12.5, 0)).toBe(true);
	});

	it('ignores exact values and float noise', () => {
		expect(dropsPrecision(1.23, 2)).toBe(false);
		expect(dropsPrecision(0.1 + 0.2, 2)).toBe(false);
		expect(dropsPrecision(2000, 0)).toBe(false);
	});
});
