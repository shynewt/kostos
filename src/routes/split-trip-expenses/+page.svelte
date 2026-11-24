<script lang="ts">
	import type { Faq } from '$lib/components/landing/content';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import ArticleLayout from '$lib/components/site/ArticleLayout.svelte';
	import { faqSchema } from '$lib/components/site/faq';
	import JsonLd from '$lib/components/site/JsonLd.svelte';
	import { SITE_URL } from '$lib/site';

	const TITLE = 'How to split expenses on a group trip';
	const PUBLISHED = '2026-11-23';

	const FAQS: Faq[] = [
		{
			question: 'What’s the fairest way to split trip expenses?',
			answer: 'Split shared costs evenly by default, use shares when people take up different amounts (someone who stayed fewer nights, for example), and leave people out of activities they skipped. Keep personal purchases out of the group.'
		},
		{
			question: 'Do we all need the same app?',
			answer: 'With Kostos, everyone opens the same invite link in their browser. Nobody installs anything or signs up, though you can add it to your home screen.'
		},
		{
			question: 'When should we settle up?',
			answer: 'Once, at the end of the trip, using the fewest payments. Settling within a week of getting home keeps it from dragging on.'
		}
	];

	const article = {
		'@type': 'Article',
		headline: TITLE,
		datePublished: PUBLISHED,
		dateModified: PUBLISHED,
		author: { '@type': 'Organization', name: 'Kostos', url: SITE_URL },
		image: `${SITE_URL}/og-image.png`,
		mainEntityOfPage: `${SITE_URL}/split-trip-expenses`
	};
</script>

<ShareMeta
	title="{TITLE} · Kostos"
	description="A simple way to split expenses on a group trip: one shared list, fair splits, any currency and the fewest payments at the end. Step by step, free, no sign-up."
	image="/og-image.png"
	imageAlt="Kostos, the free and private group expense splitter"
	path="/split-trip-expenses"
/>
<svelte:head><title>{TITLE} · Kostos</title></svelte:head>
<JsonLd data={article} />
<JsonLd data={faqSchema(FAQS)} />

<ArticleLayout>
	<p class="updated">Guide</p>
	<h1>{TITLE}</h1>
	<p class="lede">
		Make one shared list before you leave, have everyone add what they pay as it happens, and settle up once at the end with
		the fewest payments. Here’s how to do it with Kostos, plus the habits that stop trip money from turning into an argument.
	</p>

	<h2>Step by step</h2>
	<ol>
		<li><a href="/new">Create a group</a> before you go. Give it a name and an emoji, pick your home currency and add everyone who’s coming.</li>
		<li>Share the invite link in the trip’s group chat. Each person opens it and picks their own name; nobody signs up.</li>
		<li>Add each expense when it happens, with who paid. It takes a few seconds and works offline, so a taxi from the airport goes in before you have signal.</li>
		<li>Split it fairly: evenly for most things, by shares when someone stayed fewer nights, or by exact amounts when someone ordered the expensive dish.</li>
		<li>Pay in the local currency. Pick the currency on the expense and Kostos fills in the day’s rate, then counts it in your home currency.</li>
		<li>Settle up at the end. Kostos lists the fewest payments that square everyone up; tap each one once it’s paid.</li>
	</ol>

	<h2>Habits that keep it fair</h2>
	<ul>
		<li>Agree before you leave what counts as shared. Group dinners and the rental car usually do; souvenirs don’t.</li>
		<li>Add expenses on the spot. Most trip arguments start with a receipt nobody remembers.</li>
		<li>If the same group travels again, tag each trip so you can see what each one cost.</li>
		<li>Settle within a week of getting home, while everyone still remembers the details.</li>
	</ul>

	<h2>Common situations</h2>
	<h3>Someone skipped an activity</h3>
	<p>Untick them in the split for that expense, and the cost is shared only by the people who went.</p>
	<h3>Two people paid for one bill</h3>
	<p>Add a second payer and enter what each person put in. The balances work out who owes whom.</p>
	<h3>The bank charged more than the menu price</h3>
	<p>For an expense in a foreign currency, enter what your bank actually charged in your home currency. Kostos keeps that figure, so card fees are shared too.</p>
	<h3>A couple is one member in the group</h3>
	<p>Give that member a default share of 2, so every new expense counts them as two people. You can still change any single expense.</p>

	<h2>Questions</h2>
	{#each FAQS as item (item.question)}
		<h3>{item.question}</h3>
		<p>{item.answer}</p>
	{/each}
	<p>Choosing an app? Compare Kostos with <a href="/splitwise-alternative">Splitwise</a> and <a href="/tricount-alternative">Tricount</a>.</p>
</ArticleLayout>
