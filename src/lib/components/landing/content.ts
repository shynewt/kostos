/* Landing copy. The FAQ feeds both the page and its FAQPage structured data, which search engines
 * expect to match the visible text word for word. */

export type Highlight = { emoji: string; label: string };
export type Showcase = { title: string; body: string; image: string; width: number; height: number; alt: string };
export type Faq = { question: string; answer: string };

export const HIGHLIGHTS: Highlight[] = [
	{ emoji: '🔒', label: 'End-to-end encrypted' },
	{ emoji: '🙅', label: 'No sign-up' },
	{ emoji: '🆓', label: 'Free, no ads' },
	{ emoji: '📴', label: 'Works offline' },
	{ emoji: '💱', label: '153 currencies' },
	{ emoji: '⚖️', label: 'Split any way' },
	{ emoji: '🤝', label: 'Fewest transfers' },
	{ emoji: '🧑‍💻', label: 'Open source' }
];

/** Screens from the demo group; `npm run landing-screenshots` retakes them at these sizes. */
export const SHOWCASE: Showcase[] = [
	{
		title: 'Split it any way',
		body: 'Evenly, by shares or by exact amounts. If two people paid, record what each one put in.',
		image: '/landing/split.webp', width: 780, height: 660,
		alt: 'Splitting €84 by shares: Alice 2, Bob 1, Carol 3 and Dan 1, so €24, €12, €36 and €12'
	},
	{
		title: 'Quick to add',
		body: 'Type a sum like (120+48)/2 straight into the amount. Kostos guesses the category from the description.',
		image: '/landing/category.webp', width: 780, height: 860,
		alt: 'A new expense typed as (120+48)/2, worked out to €84, called Seafood dinner, with Restaurants guessed as the category'
	},
	{
		title: 'Everyone sees their share',
		body: 'Each expense shows who paid, who owes what and how it changes your balance.',
		image: '/landing/expense.webp', width: 780, height: 940,
		alt: 'A €42 lunch split evenly between you and Bob, €21 each, raising your balance by €21'
	},
	{
		title: 'See where the money went',
		body: 'Spending by week or month, by category and by person, for the whole group or one trip.',
		image: '/landing/stats.webp', width: 780, height: 1400,
		alt: 'Group stats: €1,729.45 spent in total, a weekly spending chart and a breakdown by category'
	}
];

export const MORE_FEATURES: Highlight[] = [
	{ emoji: '💱', label: '153 currencies, daily rates' },
	{ emoji: '🤝', label: 'Fewest transfers to settle up' },
	{ emoji: '🧳', label: 'Trips with their own dates' },
	{ emoji: '📴', label: 'Works offline' },
	{ emoji: '📷', label: 'Invite by link or QR code' },
	{ emoji: '🗂️', label: 'Several groups on one phone' },
	{ emoji: '📄', label: 'Export to CSV' },
	{ emoji: '💾', label: 'Back up and restore' },
	{ emoji: '🌗', label: 'Light and dark themes' },
	{ emoji: '🖥️', label: 'Host it yourself' }
];

export const FAQS: Faq[] = [
	{ question: 'Is Kostos really free?', answer: 'Yes. Kostos is free and open source, with no paid tier and no ads.' },
	{
		question: 'Do I need an account?',
		answer: 'No. Each group has a random key inside its invite link. Anyone you send the link to can join; there is no email, password or sign-up.'
	},
	{
		question: 'How is my data protected?',
		answer: 'Every change is encrypted on your device before it reaches the sync server. The server stores data it can’t read, and the group key never leaves the devices in the group.'
	},
	{
		question: 'Does Kostos work offline?',
		answer: 'Yes. Expenses you add offline are saved on your device straight away and sync the next time you’re online.'
	},
	{
		question: 'How do I install it on my phone?',
		answer: 'On Android, accept your browser’s offer to install Kostos, or choose Install app from its menu. On iPhone, open kostos.app in Safari, tap Share, then Add to Home Screen.'
	},
	{
		question: 'Can several people use the same group?',
		answer: 'Yes. Everyone with the invite link can join from their own phone, and from more than one device. Changes sync live.'
	}
];

export type Verdict = 'yes' | 'no' | 'partial' | 'unknown';
export type Cell = { verdict: Verdict; note?: string };
export type ComparisonRow = { feature: string; cells: Cell[] };

export const COMPARED_APPS = ['Kostos', 'Splitwise', 'Tricount', 'Settle Up', 'Spliit'];
/** When the competitor facts below were last checked against each app's own pages. */
export const COMPARED_ON = '23 November 2026';

const yes: Cell = { verdict: 'yes' };
const no: Cell = { verdict: 'no' };
const unknown: Cell = { verdict: 'unknown' };

export const COMPARISON: ComparisonRow[] = [
	{ feature: 'End-to-end encrypted', cells: [yes, no, no, no, no] },
	{ feature: 'No account needed', cells: [yes, no, { verdict: 'partial', note: 'Optional' }, unknown, yes] },
	{ feature: 'Everything free', cells: [yes, { verdict: 'no', note: 'Daily limit' }, yes, { verdict: 'no', note: 'Paid extras' }, yes] },
	{ feature: 'No ads', cells: [yes, no, yes, no, yes] },
	{ feature: 'Currency conversion', cells: [yes, { verdict: 'partial', note: 'Pro only' }, yes, yes, yes] },
	{ feature: 'Works offline', cells: [yes, yes, yes, yes, unknown] },
	{ feature: 'No app store needed', cells: [yes, yes, unknown, yes, yes] },
	{ feature: 'Open source', cells: [yes, no, no, no, yes] },
	{ feature: 'Host it yourself', cells: [yes, no, no, no, yes] }
];

export const COMPARISON_SOURCES: { label: string; href: string }[] = [
	{ label: 'Splitwise', href: 'https://www.splitwise.com/pro' },
	{ label: 'Tricount', href: 'https://help.tricount.com/articles/tricount-faqs' },
	{ label: 'Settle Up', href: 'https://apps.apple.com/us/app/settle-up-group-expenses/id737534985' },
	{ label: 'Spliit', href: 'https://github.com/spliit-app/spliit' }
];
