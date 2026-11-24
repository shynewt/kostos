<script lang="ts">
	import type { Faq } from '$lib/components/landing/content';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import ArticleLayout from '$lib/components/site/ArticleLayout.svelte';
	import { faqSchema } from '$lib/components/site/faq';
	import Figure from '$lib/components/site/Figure.svelte';
	import JsonLd from '$lib/components/site/JsonLd.svelte';
	import { SITE_URL } from '$lib/site';

	const TITLE = 'How to split expenses on a group trip';
	const PUBLISHED = '2026-11-23';
	const MODIFIED = '2026-11-24';

	const FAQS: Faq[] = [
		{
			question: 'What’s the fairest way to split trip expenses?',
			answer: 'Split shared costs evenly by default, use shares when people used different amounts (someone who stayed fewer nights, for example), and leave people out of activities they skipped. Keep personal purchases out of the group.'
		},
		{
			question: 'Do we all need the same app?',
			answer: 'With Kostos, everyone opens the same invite link in their browser. Nobody installs anything or signs up, though you can add it to your home screen.'
		},
		{
			question: 'When should we settle up?',
			answer: 'Once, at the end, with the few payments Kostos suggests. If the same group travels again, tag each trip so you can still see what each one cost.'
		}
	];

	const article = {
		'@type': 'Article',
		headline: TITLE,
		datePublished: PUBLISHED,
		dateModified: MODIFIED,
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
		Keep one shared list for the whole trip, add each expense as it happens with who paid, and settle up once when you’re
		home. Done that way, nobody spends the last evening rebuilding the week from bank statements.
	</p>

	<h2>Before you leave</h2>
	<p>
		<a href="/new">Create a group</a>, pick your home currency and add everyone who’s coming. Then send the invite link to the
		trip’s group chat. Each person opens it, picks their name and they’re in, without signing up or installing anything.
	</p>
	<Figure
		src="/landing/join.webp"
		width={780}
		height={998}
		alt="Joining Weekend in Lisbon: Alice, Bob and Charlie are listed under Who are you?"
		caption="Everyone opens the same link and picks their name."
	/>
	<p>
		While you’re at it, agree on what counts as shared. Group dinners, the rental car and the apartment usually do. Souvenirs
		and someone’s extra cocktail usually don’t.
	</p>

	<h2>During the trip</h2>
	<p>
		Add each expense when it happens, while the receipt is still in your hand. It takes a few seconds and works without
		signal, so the taxi from the airport goes in before your phone finds a network and syncs once you’re online.
	</p>

	<h3>Split it the way it was used</h3>
	<p>
		Most things split evenly. When people used different amounts, switch to shares: if you stayed four nights of six, you
		can count as 2 against everyone else’s 3. On the night someone ordered the lobster, enter exact amounts instead.
	</p>
	<Figure
		src="/landing/split.webp"
		width={780}
		height={660}
		alt="Splitting €84 by shares: Alice 2, Bob 1, Carol 3 and Dan 1, so €24, €12, €36 and €12"
		caption="€84 split by shares of 2, 1, 3 and 1."
	/>
	<p>
		Someone skipped the boat trip? Untick them for that expense. Two people paid one bill? Add a second payer and enter what
		each one put in.
	</p>

	<h3>Paying in another currency</h3>
	<p>
		Pick the currency on the expense and Kostos fills in the day’s exchange rate. If your bank charged a different amount,
		type what it actually took from your account. Kostos keeps that figure and shows the difference, so card fees get shared
		like everything else.
	</p>
	<Figure
		src="/landing/currency.webp"
		width={780}
		height={738}
		alt="A $45 expense where the bank charged €42.10, 1.7% more than the market rate of 0.92"
		caption="$45 for museum tickets. The bank took €42.10, 1.7% over the market rate."
	/>

	<h2>When you get home</h2>
	<p>
		Open the group and Kostos lists the fewest payments that square everyone up. Pay them however you like, tap each one once
		it’s done, and every balance goes back to zero. It’s easiest within a week, while everyone still remembers the dinner in
		question.
	</p>
	<Figure
		src="/landing/home.webp"
		width={780}
		height={1560}
		alt="A group’s home screen: you’re owed €222.92, with Bob, Carol and Dan’s payments listed under Settle up"
		caption="Three payments settle the whole group."
	/>

	<h2>Questions</h2>
	{#each FAQS as item (item.question)}
		<h3>{item.question}</h3>
		<p>{item.answer}</p>
	{/each}
	<p>Still choosing an app? See how Kostos compares with <a href="/splitwise-alternative">Splitwise</a> and <a href="/tricount-alternative">Tricount</a>.</p>
</ArticleLayout>
