/* Income (a refund, a deposit coming back) is stored as an expense with a negative amount.
 *
 * Balances are linear in the amounts, so negating an expense's total, payments and
 * amount-mode splits turns "Alice paid 100, everyone owes a share" into "Alice holds 100,
 * everyone is owed a share" with no other change. It needs no extra field, which matters
 * because a device on an older version only reads the fields it knows about. */

import type { Expense } from './types';

export type EntryKind = 'expense' | 'income';

export function isIncome(expense: Expense): boolean {
	return expense.amount < 0 && !expense.isSettlement;
}

export function entryKind(expense: Expense): EntryKind {
	return isIncome(expense) ? 'income' : 'expense';
}

const negate = (cents: number) => (cents === 0 ? 0 : -cents);

/** The same entry with every money amount negated. Screens work in positive numbers, so an
 *  income is flipped once when it's opened for editing and once more when it's saved. */
export function negateExpense(expense: Expense): Expense {
	return {
		...expense,
		amount: negate(expense.amount),
		chargedAmount: expense.chargedAmount === undefined ? undefined : negate(expense.chargedAmount),
		payments: expense.payments.map((payment) => ({ ...payment, amount: negate(payment.amount) })),
		splits: expense.splits.map((split) =>
			split.amount === undefined ? split : { ...split, amount: negate(split.amount) }
		)
	};
}
