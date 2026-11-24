/* Explains one member's balance as the sum of its parts, using the exact same per-expense
 * cents as computeBalances, so the parts always add up to the balance shown. */

import { expenseShares } from './balance';
import { expenseInBase } from './currency-convert';
import type { Expense } from './types';

export type BalanceBreakdown = {
	/** what the member paid towards real expenses, base minor units */
	paid: number;
	/** the member's share of real expenses */
	share: number;
	/** settlements the member paid to others */
	settlementsPaid: number;
	/** settlements others paid to the member */
	settlementsReceived: number;
	/** paid − share + settlementsPaid − settlementsReceived; equals computeBalances' net */
	net: number;
	/** real expenses the member paid for or has a share in */
	expenseCount: number;
};

export function balanceBreakdown(
	memberId: string,
	expenses: Expense[],
	baseCurrency?: string
): BalanceBreakdown {
	let paid = 0;
	let share = 0;
	let settlementsPaid = 0;
	let settlementsReceived = 0;
	let expenseCount = 0;

	for (const raw of expenses) {
		const expense = baseCurrency ? expenseInBase(raw, baseCurrency) : raw;
		let paidHere = 0;
		for (const payment of expense.payments) {
			if (payment.memberId === memberId) paidHere += payment.amount;
		}
		const shares = expenseShares(expense);
		const shareHere = shares.get(memberId) ?? 0;

		if (expense.isSettlement) {
			settlementsPaid += paidHere;
			settlementsReceived += shareHere;
			continue;
		}
		paid += paidHere;
		share += shareHere;
		const involved = shares.has(memberId) || expense.payments.some((p) => p.memberId === memberId);
		if (involved) expenseCount++;
	}

	return {
		paid,
		share,
		settlementsPaid,
		settlementsReceived,
		net: paid - share + settlementsPaid - settlementsReceived,
		expenseCount
	};
}
