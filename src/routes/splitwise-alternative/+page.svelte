<script lang="ts">
	import ComparisonTable from '$lib/components/landing/ComparisonTable.svelte';
	import { COMPARED_ON, type Faq } from '$lib/components/landing/content';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import ArticleLayout from '$lib/components/site/ArticleLayout.svelte';
	import { faqSchema } from '$lib/components/site/faq';
	import Figure from '$lib/components/site/Figure.svelte';
	import JsonLd from '$lib/components/site/JsonLd.svelte';

	const FAQS: Faq[] = [
		{ question: 'Is Kostos really free?', answer: 'Yes. Kostos is free and open source, with no paid tier, no ads and no daily limit on new expenses.' },
		{ question: 'Can I import my Splitwise groups?', answer: 'Yes. Export the group from Splitwise as a spreadsheet and pick the CSV file when you create a Kostos group. Your browser reads the file; nothing is uploaded except the new, encrypted group. Expenses keep their date, description, cost and currency, payments become settlements, and each member ends up with the same balance as in Splitwise. Splitwise’s file only says how each balance moved, so Kostos takes the people owed money as the payers and splits the cost among the rest by exact amounts. An expense someone paid only for themselves changes no balance and is left out.' },
		{ question: 'Does Kostos work offline like Splitwise?', answer: 'Yes. Expenses you add offline are saved on your phone and sync as soon as you’re back online.' }
	];
</script>

<ShareMeta
	title="Free Splitwise alternative with no account · Kostos"
	description="Kostos is a free Splitwise alternative with no account, no ads and no daily expense limit. Open source and end-to-end encrypted. See how the two compare."
	image="/og-image.png"
	imageAlt="Kostos, the free and private group expense splitter"
	path="/splitwise-alternative"
/>
<svelte:head><title>Free Splitwise alternative with no account · Kostos</title></svelte:head>
<JsonLd data={faqSchema(FAQS)} />

<ArticleLayout>
	<p class="updated dateline">Compared on {COMPARED_ON}</p>
	<h1>A free Splitwise alternative, with no account</h1>
	<p class="lede">
		Kostos does what most people open Splitwise for: a shared list of expenses, fair splits, and a short list of who pays whom
		at the end. Nobody signs up, nothing sits behind a paid plan, and your expenses are encrypted on your phone before
		they sync.
	</p>

	<h2>Kostos vs Splitwise at a glance</h2>
	<ComparisonTable versus={['Splitwise']} />

	<h2>What changes when you switch</h2>
	<h3>Nobody needs an account</h3>
	<p>
		Splitwise asks everyone to sign up, and the friends you add get an invite by email or text. In Kostos the group is a link.
		Whoever opens it picks their name and starts adding expenses, which helps most with the friend who only came for one
		weekend.
	</p>
	<Figure
		src="/landing/join.webp"
		width={780}
		height={998}
		alt="Joining Weekend in Lisbon: Alice, Bob and Charlie are listed under Who are you?"
		caption="Joining a group: open the link, pick your name."
	/>

	<h3>No daily limit and no ads</h3>
	<p>
		Splitwise’s free version caps how many expenses you can add each day and shows ads, and Splitwise Pro removes both.
		Kostos has no paid version, so every feature on this page is free.
	</p>

	<h3>Currency conversion is included</h3>
	<p>
		On Splitwise, converting between currencies is a Pro feature. Kostos fills in the day’s rate for 153 currencies and lets
		you type what your bank actually charged, which is what matters on a trip abroad (see
		<a href="/split-trip-expenses">how to split trip expenses</a>).
	</p>
	<Figure
		src="/landing/currency.webp"
		width={780}
		height={738}
		alt="A $45 expense where the bank charged €42.10, 1.7% more than the market rate of 0.92"
		caption="A $45 expense, with the €42.10 the bank actually charged."
	/>

	<h3>Encrypted before it leaves your phone</h3>
	<p>
		Kostos encrypts every change on your device with the group’s key, so the sync server only stores data it can’t read.
		Splitwise makes no claim of end-to-end encryption.
	</p>

	<h3>Open source</h3>
	<p>The code is on GitHub. You can read it, or run your own sync server if you’d rather not depend on ours.</p>

	<h2>Where Splitwise does more</h2>
	<p>
		Splitwise has native apps in the App Store and Google Play, while Kostos installs from the browser. Splitwise Pro can also
		scan receipts, which Kostos can’t.
	</p>

	<h2>How to switch from Splitwise</h2>
	<ol>
		<li>In Splitwise on the web, open the group, click the gear icon and export it as a spreadsheet. You get a CSV file.</li>
		<li>On Kostos, start a <a href="/new">new group</a> and tap “Import a CSV” under the button, or go straight to the <a href="/import/splitwise">Splitwise import</a>.</li>
		<li>Pick the file, check the members and balances it shows, and choose which member you are. If the group used more than one currency, enter a rate for each extra one.</li>
		<li>Share the invite link in your group chat. Everyone opens it and picks their name.</li>
	</ol>

	<h2>Questions</h2>
	{#each FAQS as item (item.question)}
		<h3>{item.question}</h3>
		<p>{item.answer}</p>
	{/each}
	<p>Also weighing up Tricount? See the <a href="/tricount-alternative">Tricount comparison</a>.</p>
</ArticleLayout>
