import type {
	Category,
	DefaultSplit,
	Expense,
	Member,
	PaymentMethodItem,
	Project,
	ProjectColor,
	SplitMode,
	Trip
} from '$lib/types';
import { currencyDecimals } from '$lib/currencies';

/* Serialized project state for backup and restore.
 *
 * Members, categories, payment methods, and trips keep their original IDs because expenses
 * reference them. The project's id is omitted: import always allocates a fresh roomId,
 * since the old one no longer maps to a live room.
 *
 * v1 had no trips; v1 archives are accepted and silently upgraded by initialising an
 * empty trips array.
 */
export type ProjectArchive = {
	schemaVersion: 2;
	app: 'kostos';
	exportedAt: number;
	project: {
		name: string;
		description?: string;
		emoji: string;
		color: ProjectColor;
		currency: string;
		currencySymbol: string;
		defaultSplit: DefaultSplit;
		autoFetchRates?: boolean;
		paymentMethodsEnabled?: boolean;
		categories: Category[];
		paymentMethods: PaymentMethodItem[];
		trips: Trip[];
		createdAt: number;
	};
	members: Member[];
	expenses: Expense[];
};

export const ARCHIVE_SCHEMA_VERSION = 2;
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const;

export function serializeProject(
	project: Project,
	members: Member[],
	expenses: Expense[]
): ProjectArchive {
	return {
		schemaVersion: ARCHIVE_SCHEMA_VERSION,
		app: 'kostos',
		exportedAt: Date.now(),
		project: {
			name: project.name,
			description: project.description,
			emoji: project.emoji,
			color: project.color,
			currency: project.currency,
			currencySymbol: project.currencySymbol,
			defaultSplit: project.defaultSplit,
			autoFetchRates: project.autoFetchRates,
			paymentMethodsEnabled: project.paymentMethodsEnabled,
			categories: project.categories,
			paymentMethods: project.paymentMethods,
			trips: project.trips ?? [],
			createdAt: project.createdAt
		},
		members,
		expenses
	};
}

export type ArchiveParseResult =
	| { ok: true; archive: ProjectArchive }
	| { ok: false; error: string };

export function parseProjectArchive(input: unknown): ArchiveParseResult {
	let raw: unknown = input;
	if (typeof input === 'string') {
		try {
			raw = JSON.parse(input);
		} catch {
			return { ok: false, error: 'File is not valid JSON.' };
		}
	}
	if (!isObject(raw)) return { ok: false, error: 'File is not a Kostos backup.' };
	if (raw.app !== 'kostos') return { ok: false, error: 'File is not a Kostos backup.' };
	if (typeof raw.schemaVersion !== 'number' || !(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(raw.schemaVersion)) {
		return {
			ok: false,
			error: `Unsupported backup version (got ${raw.schemaVersion}, supports ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}).`
		};
	}

	const project = raw.project;
	if (!isObject(project) || typeof project.name !== 'string') {
		return { ok: false, error: 'Backup is missing project metadata.' };
	}

	const members = raw.members;
	if (!Array.isArray(members) || !members.every(isValidMember)) {
		return { ok: false, error: 'Backup has malformed members.' };
	}

	const expenses = raw.expenses;
	if (!Array.isArray(expenses) || !expenses.every(isValidExpense)) {
		return { ok: false, error: 'Backup has malformed expenses.' };
	}

	const upgraded = upgradeToCurrent(raw as RawArchive);
	return { ok: true, archive: upgraded };
}

type RawArchive = ProjectArchive | (Omit<ProjectArchive, 'schemaVersion' | 'project'> & {
	schemaVersion: 1;
	project: Omit<ProjectArchive['project'], 'trips'>;
});

function upgradeToCurrent(raw: RawArchive): ProjectArchive {
	if (raw.schemaVersion === ARCHIVE_SCHEMA_VERSION) return raw;
	// v1 → v2: trips didn't exist, expenses had no tripId. Seed with empties; the rest
	// of the payload is structurally identical.
	return {
		...raw,
		schemaVersion: ARCHIVE_SCHEMA_VERSION,
		project: {
			...raw.project,
			trips: []
		}
	};
}

/* ---------------- CSV ---------------- */

const CSV_HEADERS = [
	'date',
	'description',
	'amount',
	'currency',
	'category',
	'payment_method',
	'trip',
	'is_settlement',
	'notes',
	'split_mode',
	'payers',
	'splits',
	'created_at'
] as const;

export function toCSV(project: Project, members: Member[], expenses: Expense[]): string {
	const memberName = nameLookup(members);
	const categoryName = nameLookup(project.categories);
	const methodName = nameLookup(project.paymentMethods);
	const tripName = nameLookup(project.trips ?? []);

	const rows = [CSV_HEADERS.join(',')];
	const sorted = [...expenses].sort((a, b) => a.date - b.date);
	for (const e of sorted) {
		rows.push(
			[
				toISODate(e.date),
				csvEscape(e.description ?? ''),
				formatAmount(e.amount, e.currency),
				csvEscape(e.currency),
				csvEscape(e.categoryId ? categoryName(e.categoryId) : ''),
				csvEscape(e.paymentMethodId ? methodName(e.paymentMethodId) : ''),
				csvEscape(e.tripId ? tripName(e.tripId) : ''),
				e.isSettlement ? 'true' : 'false',
				csvEscape(e.notes ?? ''),
				e.splitMode,
				csvEscape(formatPayers(e, memberName)),
				csvEscape(formatSplits(e, memberName)),
				toISODate(e.createdAt)
			].join(',')
		);
	}
	return rows.join('\n') + '\n';
}

function nameLookup<T extends { id: string; name: string }>(items: T[]): (id: string) => string {
	const map = new Map(items.map((i) => [i.id, i.name]));
	return (id) => map.get(id) ?? id;
}

function formatPayers(e: Expense, name: (id: string) => string): string {
	return e.payments.map((p) => `${name(p.memberId)}:${formatAmount(p.amount, e.currency)}`).join('|');
}

function formatSplits(e: Expense, name: (id: string) => string): string {
	if (e.splitMode === 'even') return e.splits.map((s) => name(s.memberId)).join('|');
	if (e.splitMode === 'shares') {
		return e.splits.map((s) => `${name(s.memberId)}:${s.shares ?? 0}`).join('|');
	}
	return e.splits
		.map((s) => `${name(s.memberId)}:${formatAmount(s.amount ?? 0, e.currency)}`)
		.join('|');
}

function formatAmount(minor: number, currency: string): string {
	const decimals = currencyDecimals(currency);
	const sign = minor < 0 ? '-' : '';
	const abs = Math.abs(minor);
	const whole = Math.floor(abs / 10 ** decimals);
	if (decimals === 0) return `${sign}${whole}`;
	const frac = (abs % 10 ** decimals).toString().padStart(decimals, '0');
	return `${sign}${whole}.${frac}`;
}

function toISODate(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

function csvEscape(raw: string): string {
	if (raw === '') return '';
	// spreadsheets run cells starting with these as formulas; a leading quote keeps it text
	const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
	if (/[",\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/* ---------------- validation helpers ---------------- */

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidMember(value: unknown): value is Member {
	return (
		isObject(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		typeof value.createdAt === 'number'
	);
}

function isValidExpense(value: unknown): value is Expense {
	if (!isObject(value)) return false;
	if (typeof value.id !== 'string') return false;
	if (typeof value.amount !== 'number') return false;
	if (typeof value.currency !== 'string') return false;
	if (typeof value.date !== 'number') return false;
	if (typeof value.createdAt !== 'number') return false;
	if (typeof value.createdBy !== 'string') return false;
	if (!isValidSplitMode(value.splitMode)) return false;
	if (!Array.isArray(value.payments) || !value.payments.every(isValidPayment)) return false;
	if (!Array.isArray(value.splits) || !value.splits.every(isValidSplit)) return false;
	return true;
}

function isValidSplitMode(value: unknown): value is SplitMode {
	return value === 'even' || value === 'shares' || value === 'amount';
}

function isValidPayment(value: unknown): boolean {
	return isObject(value) && typeof value.memberId === 'string' && typeof value.amount === 'number';
}

function isValidSplit(value: unknown): boolean {
	if (!isObject(value)) return false;
	if (typeof value.memberId !== 'string') return false;
	if (value.shares !== undefined && typeof value.shares !== 'number') return false;
	if (value.amount !== undefined && typeof value.amount !== 'number') return false;
	return true;
}
