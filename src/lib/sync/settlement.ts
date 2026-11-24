import { addExpense, readExpenses, updateExpense, type RoomHandle } from './doc';
import type { Expense } from '$lib/types';

/** A failed save can still leave the settlement in the shared document, so a retry under the
 *  same id corrects it rather than adding a second one. */
export function saveSettlement(handle: RoomHandle, settlement: Expense): void {
	const exists = readExpenses(handle).some((expense) => expense.id === settlement.id);
	if (exists) updateExpense(handle, settlement);
	else addExpense(handle, settlement);
}
