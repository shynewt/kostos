import { parseMoney } from './expense-draft';

export type SettleAmount = { cents: number; error: string | null };

/** Parse what was typed in the settle sheet. A settlement can cover part of a transfer
 *  but never more than it, since that would flip who owes whom. */
export function parseSettleAmount(raw: string, maxCents: number, decimals: number): SettleAmount {
	const parsed = parseMoney(raw, decimals);
	if (parsed.empty) return { cents: 0, error: 'Enter an amount.' };
	if (parsed.invalid) return { cents: 0, error: 'That amount doesn’t look right.' };
	if (parsed.cents <= 0) return { cents: parsed.cents, error: 'Enter an amount above zero.' };
	if (parsed.cents > maxCents) return { cents: parsed.cents, error: 'That’s more than is owed.' };
	return { cents: parsed.cents, error: null };
}
