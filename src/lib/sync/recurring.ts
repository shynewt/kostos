import * as Y from 'yjs';
import { getCurrentMember } from '$lib/storage';
import { dayOf, duePeriods, firstPeriodAfter, periodDay } from '$lib/recurring';
import type { ArchivedRule, Expense, RecurringRule, RecurringTemplate, RepeatFrequency } from '$lib/types';
import { addExpense, generateId, isRecurringCopyId, type RoomHandle } from './doc';

/* Repeating expenses.
 *
 * Rules live in their own top-level map, so clients that predate them never see or touch
 * them; the copies they make are ordinary expenses every client can read. Each rule keeps
 * the periods already handled in a nested map: a copy deleted later stays handled and never
 * returns. A copy's id is `<rule id>-<period>`, so phones that create the same period while
 * offline write the same expense, and versionHeads in doc.ts reads them as one.
 */

const FREQUENCIES: RepeatFrequency[] = ['weekly', 'monthly', 'yearly'];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function rulesMap(handle: RoomHandle): Y.Map<Y.Map<unknown>> {
	return handle.doc.getMap<Y.Map<unknown>>('recurring');
}

function isValidDay(value: unknown): value is string {
	return typeof value === 'string' && DAY_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/** Malformed rules, say from a buggy peer, are left out rather than breaking the group. */
function ruleFromMap(entry: Y.Map<unknown>): RecurringRule | null {
	const frequency = entry.get('frequency') as RepeatFrequency;
	const startDay = entry.get('startDay');
	const endDay = entry.get('endDay');
	const firstPeriod = entry.get('firstPeriod');
	const template = entry.get('template') as RecurringTemplate | undefined;
	if (!FREQUENCIES.includes(frequency) || !isValidDay(startDay)) return null;
	if (endDay !== undefined && !isValidDay(endDay)) return null;
	if (typeof firstPeriod !== 'number' || !Number.isInteger(firstPeriod) || firstPeriod < 0) return null;
	if (!template || !Array.isArray(template.payments) || !Array.isArray(template.splits)) return null;
	return {
		id: entry.get('id') as string,
		frequency,
		startDay,
		firstPeriod,
		endDay,
		template,
		createdAt: entry.get('createdAt') as number,
		createdBy: (entry.get('createdBy') as string | null) ?? null
	};
}

export function readRules(handle: RoomHandle): RecurringRule[] {
	const rules: RecurringRule[] = [];
	for (const entry of rulesMap(handle).values()) {
		const rule = ruleFromMap(entry);
		if (rule) rules.push(rule);
	}
	return rules.sort((a, b) => a.createdAt - b.createdAt);
}

export function readRule(handle: RoomHandle, id: string): RecurringRule | null {
	const entry = rulesMap(handle).get(id);
	return entry ? ruleFromMap(entry) : null;
}

export function isRuleActive(rule: RecurringRule | null | undefined): rule is RecurringRule {
	return !!rule && rule.endDay === undefined;
}

function handledPeriods(entry: Y.Map<unknown>): Y.Map<boolean> {
	return entry.get('periods') as Y.Map<boolean>;
}

export function templateOf(expense: Expense): RecurringTemplate {
	const template: Partial<Expense> = JSON.parse(JSON.stringify(expense));
	delete template.id;
	delete template.date;
	delete template.createdAt;
	delete template.recurrenceId;
	return template as RecurringTemplate;
}

function writeRule(handle: RoomHandle, rule: RecurringRule, handled: number[] = []): void {
	const entry = new Y.Map<unknown>();
	entry.set('id', rule.id);
	entry.set('frequency', rule.frequency);
	entry.set('startDay', rule.startDay);
	entry.set('firstPeriod', rule.firstPeriod);
	if (rule.endDay !== undefined) entry.set('endDay', rule.endDay);
	entry.set('template', JSON.parse(JSON.stringify(rule.template)));
	entry.set('createdAt', rule.createdAt);
	entry.set('createdBy', rule.createdBy);
	const periods = new Y.Map<boolean>();
	for (const period of handled) periods.set(String(period), true);
	entry.set('periods', periods);
	rulesMap(handle).set(rule.id, entry);
}

function startRule(handle: RoomHandle, expense: Expense, frequency: RepeatFrequency, firstPeriod: number): string {
	const id = generateId();
	writeRule(handle, {
		id,
		frequency,
		startDay: dayOf(expense.date),
		firstPeriod,
		template: templateOf(expense),
		createdAt: Date.now(),
		createdBy: getCurrentMember(handle.roomId)
	});
	return id;
}

export function stopRule(handle: RoomHandle, id: string, today: string): void {
	rulesMap(handle).get(id)?.set('endDay', today);
}

/** Applies the Repeat choice made while saving `expense` and returns the expense to store.
 *  Call inside the same transaction as the add or update. Changes only reach copies made
 *  from now on; copies already in the list stay as they are. */
export function saveRepeat(
	handle: RoomHandle,
	expense: Expense,
	repeat: RepeatFrequency | null,
	today: string
): Expense {
	const rule = expense.recurrenceId ? readRule(handle, expense.recurrenceId) : null;
	const active = isRuleActive(rule);
	if (active && repeat === rule.frequency) {
		rulesMap(handle).get(rule.id)?.set('template', templateOf(expense));
		return expense;
	}
	if (active) stopRule(handle, rule.id, today);
	if (repeat === null) return expense;
	// period 0 is this expense itself, so a rule never starts before period 1. An expense that
	// already belonged to a rule has copies around it; starting after today keeps the new rule
	// from repeating periods the old one covered
	const firstPeriod = expense.recurrenceId
		? Math.max(1, firstPeriodAfter(dayOf(expense.date), repeat, today))
		: 1;
	return { ...expense, recurrenceId: startRule(handle, expense, repeat, firstPeriod) };
}

export function copyId(ruleId: string, period: number): string {
	return `${ruleId}-${period}`;
}

function copyFor(rule: RecurringRule, period: number): Expense {
	const date = Date.parse(periodDay(rule.startDay, rule.frequency, period));
	return { ...structuredClone(rule.template), id: copyId(rule.id, period), date, createdAt: date, recurrenceId: rule.id };
}

/** Phones that made the same copy apart leave one entry each; keep the first so clients that
 *  don't know about repeating expenses stop counting it twice. */
function dropDuplicateCopies(handle: RoomHandle): void {
	const seen = new Set<string>();
	for (let i = 0; i < handle.expenses.length; i++) {
		const id = handle.expenses.get(i).get('id') as string;
		if (!isRecurringCopyId(id)) continue;
		if (seen.has(id)) {
			handle.expenses.delete(i, 1);
			i -= 1;
		} else {
			seen.add(id);
		}
	}
}

function hasDuplicateCopies(handle: RoomHandle): boolean {
	const seen = new Set<string>();
	for (const entry of handle.expenses) {
		const id = entry.get('id') as string;
		if (!isRecurringCopyId(id)) continue;
		if (seen.has(id)) return true;
		seen.add(id);
	}
	return false;
}

/** Creates every copy whose day has come and that no phone has handled yet. Safe to run on
 *  every open, on any number of phones at once. Returns how many copies it added. */
export function generateDueCopies(handle: RoomHandle, today: string): number {
	const pending: { rule: RecurringRule; periods: Y.Map<boolean>; period: number }[] = [];
	for (const entry of rulesMap(handle).values()) {
		const rule = ruleFromMap(entry);
		const periods = handledPeriods(entry);
		if (!rule || !periods) continue;
		for (const period of duePeriods(rule, today)) {
			if (!periods.has(String(period))) pending.push({ rule, periods, period });
		}
	}
	const duplicates = hasDuplicateCopies(handle);
	if (pending.length === 0 && !duplicates) return 0;
	handle.doc.transact(() => {
		if (duplicates) dropDuplicateCopies(handle);
		for (const { rule, periods, period } of pending) {
			periods.set(String(period), true);
			addExpense(handle, copyFor(rule, period), { silent: true });
		}
	});
	return pending.length;
}

export function archiveRules(handle: RoomHandle): ArchivedRule[] {
	const archived: ArchivedRule[] = [];
	for (const entry of rulesMap(handle).values()) {
		const rule = ruleFromMap(entry);
		if (!rule) continue;
		const handled = [...(handledPeriods(entry)?.keys() ?? [])].map(Number).sort((a, b) => a - b);
		archived.push({ ...rule, handledPeriods: handled });
	}
	return archived;
}

export function restoreRules(handle: RoomHandle, rules: ArchivedRule[]): void {
	handle.doc.transact(() => {
		for (const { handledPeriods: handled, ...rule } of rules) writeRule(handle, rule, handled);
	});
}
