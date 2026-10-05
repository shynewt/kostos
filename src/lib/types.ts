export type DefaultSplit = 'even' | 'shares' | 'amount';

export type ActivityKind =
	| 'expense.add'
	| 'expense.edit'
	| 'expense.resolve'
	| 'expense.remove'
	| 'settle.add'
	| 'member.add'
	| 'member.remove'
	| 'member.rename';

/** A single audit-log change, holding raw values; formatting is the renderer's job
 *  so events stay locale-agnostic. `paidBy`/`split` carry no from/to when only the
 *  amounts or the split detail moved (the members/mode stayed the same). */
export type ActivityChange =
	| { kind: 'amount'; from: number; to: number; fromCurrency: string; toCurrency: string }
	| { kind: 'text'; from: string; to: string }
	| { kind: 'date'; from: number; to: number }
	| { kind: 'paidBy'; from?: string[]; to?: string[] }
	| { kind: 'split'; from?: SplitMode; to?: SplitMode };

/** One entry in a room's append-only activity log. `by` is the actor's member id
 *  (the member claimed on the device that made the change), null if none was set. */
export type ActivityEvent = {
	id: string;
	at: number;
	by: string | null;
	kind: ActivityKind;
	/** Subject expense for expense.* and settle.add. */
	expenseId?: string;
	/** Subject member for member.* events, or the recipient for settle.add. */
	memberId?: string;
	/** Snapshot of the expense description or member name at the time. */
	label?: string;
	amount?: number;
	currency?: string;
	/** one event describes one change; a multi-field edit logs several events */
	change?: ActivityChange;
};

export type ProjectColor = 'lime' | 'cyan' | 'violet' | 'amber' | 'coral' | 'blue';

export type Category = {
	id: string;
	name: string;
	emoji: string;
};

export type PaymentMethodItem = {
	id: string;
	name: string;
	emoji: string;
};

export type Project = {
	id: string;
	name: string;
	description?: string;
	emoji: string;
	color: ProjectColor;
	currency: string;
	currencySymbol: string;
	defaultSplit: DefaultSplit;
	/** When set (default true), the expense form fetches a live FX rate for foreign-currency
	 *  expenses. Turn off to keep every rate manual and avoid the outbound network call. */
	autoFetchRates?: boolean;
	/** Show the payment method field on expenses. Default true; some groups never track it. */
	paymentMethodsEnabled?: boolean;
	categories: Category[];
	paymentMethods: PaymentMethodItem[];
	trips: Trip[];
	createdAt: number;
};

export type Trip = {
	id: string;
	name: string;
	emoji: string;
	/** Unix ms; inclusive. */
	startDate: number;
	/** Unix ms; inclusive. Undefined = still going / open-ended. */
	endDate?: number;
	/** Slice 3 closes trips by setting this. Closed trips disappear from the active picker. */
	closedAt?: number;
	createdAt: number;
};

export const DEFAULT_CATEGORIES: Category[] = [
	{ id: 'cat-groceries', name: 'Groceries', emoji: '🛒' },
	{ id: 'cat-restaurants', name: 'Restaurants', emoji: '🍽️' },
	{ id: 'cat-transport', name: 'Transport', emoji: '🚗' },
	{ id: 'cat-lodging', name: 'Lodging', emoji: '🛏️' },
	{ id: 'cat-activities', name: 'Activities', emoji: '🎉' },
	{ id: 'cat-other', name: 'Other', emoji: '📝' }
];

export const DEFAULT_PAYMENT_METHODS: PaymentMethodItem[] = [
	{ id: 'pm-cash', name: 'Cash', emoji: '💵' },
	{ id: 'pm-card', name: 'Card', emoji: '💳' },
	{ id: 'pm-bank', name: 'Bank transfer', emoji: '🏦' },
	{ id: 'pm-other', name: 'Other', emoji: '📝' }
];

export type Member = {
	id: string;
	name: string;
	/** Avatar tint key into MEMBER_COLOR_VALUES. Assigned at creation; falls back to a
	 *  deterministic colour derived from the id for members made before this existed. */
	color?: string;
	/** Optional emoji avatar. When set it replaces the name-initial glyph. */
	emoji?: string;
	createdAt: number;
};

export type SplitMode = 'even' | 'shares' | 'amount';

export type ExpenseSplit = {
	memberId: string;
	shares?: number;
	amount?: number;
};

/** One contribution to an expense. Cents. The sum across an expense's payments must
 *  equal Expense.amount. A single-payer expense is just a one-row payments array. */
export type Payment = {
	memberId: string;
	amount: number;
};

/** Expense amounts are stored in minor units (cents) to avoid float drift.
 *  Settlements (`isSettlement: true`) are regular expenses structurally — a single payer,
 *  a single split member, even split — and feed the same `computeBalances` math. The flag
 *  exists so the UI can tag them visually and offer separate listing/filtering. */
export type Expense = {
	id: string;
	payments: Payment[];
	amount: number;
	currency: string;
	/** Base-currency units per 1 unit of `currency`, frozen at creation. Absent when the
	 *  expense is already in the project's base currency. */
	exchangeRate?: number;
	/** Unix ms the rate was captured, for display ("rate from 2026-06-01"). */
	rateFetchedAt?: number;
	/** What the expense actually cost in the base currency, minor units: the amount the bank
	 *  charged, or the amount at the market rate if the user didn't change it. Balances use
	 *  it over `exchangeRate`, which is still written (derived from it) for older clients. */
	chargedAmount?: number;
	/** Base-currency units per 1 unit of `currency` on the market when the expense was
	 *  entered. Reference only: compared with `chargedAmount` to show exchange fees. */
	marketRate?: number;
	description?: string;
	categoryId?: string;
	paymentMethodId?: string;
	tripId?: string;
	date: number;
	splitMode: SplitMode;
	splits: ExpenseSplit[];
	notes?: string;
	isSettlement?: boolean;
	createdAt: number;
	createdBy: string;
};
