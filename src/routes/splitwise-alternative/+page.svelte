<script lang="ts">
	import ComparisonTable from '$lib/components/landing/ComparisonTable.svelte';
	import { COMPARED_ON, type Faq } from '$lib/components/landing/content';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import ArticleLayout from '$lib/components/site/ArticleLayout.svelte';
	import { faqSchema } from '$lib/components/site/faq';
	import JsonLd from '$lib/components/site/JsonLd.svelte';

	const FAQS: Faq[] = [
		{ question: 'Is Kostos really free?', answer: 'Yes. Kostos is free and open source, with no paid tier, no ads and no daily limit on new expenses.' },
		{ question: 'Can I import my Splitwise groups?', answer: 'Not yet. Start a Kostos group with the same people and add each open balance as one expense, then carry on from there.' },
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
	<p class="updated">Compared on {COMPARED_ON}</p>
	<h1>A free Splitwise alternative, with no account</h1>
	<p class="lede">
		Kostos splits group expenses the way Splitwise does, but nobody has to sign up, there are no ads, and there’s no daily
		limit on new expenses. It’s open source, and your expenses are encrypted on your phone before they sync.
	</p>

	<h2>Kostos vs Splitwise at a glance</h2>
	<ComparisonTable versus={['Splitwise']} />

	<h2>What’s different with Kostos</h2>
	<h3>Nobody needs an account</h3>
	<p>
		Splitwise asks you to sign up, and the friends you add get an invite by email or text. In Kostos a group is a link: whoever
		opens it picks their name and starts adding expenses.
	</p>
	<h3>No daily limit and no ads</h3>
	<p>
		Splitwise’s free version limits how many expenses you can add per day and shows ads; removing both takes Splitwise Pro.
		Kostos has no paid version, so everything it does is free.
	</p>
	<h3>Currency conversion is included</h3>
	<p>
		Splitwise converts between currencies only on Pro. Kostos covers 153 currencies and fills in the day’s exchange rate for
		free, which matters most on a trip abroad (see <a href="/split-trip-expenses">how to split trip expenses</a>).
	</p>
	<h3>Encrypted before it leaves your phone</h3>
	<p>
		Kostos encrypts every change on your device with the group’s key. The sync server stores data it can’t read. Splitwise
		makes no claim of end-to-end encryption.
	</p>
	<h3>Open source</h3>
	<p>Anyone can read the code on GitHub, and you can run your own sync server if you’d rather not use ours.</p>

	<h2>Where Splitwise does more</h2>
	<ul>
		<li>Splitwise has apps in the App Store and Google Play. Kostos installs from the browser instead.</li>
		<li>Splitwise Pro scans receipts. Kostos doesn’t.</li>
	</ul>

	<h2>How to switch from Splitwise</h2>
	<ol>
		<li><a href="/new">Create a Kostos group</a> with the same people, and pick the same currency.</li>
		<li>Add each balance that’s still open in Splitwise as a single expense, so everyone starts where they left off.</li>
		<li>Share the invite link in your group chat. Everyone opens it and picks their name.</li>
	</ol>

	<h2>Questions</h2>
	{#each FAQS as item (item.question)}
		<h3>{item.question}</h3>
		<p>{item.answer}</p>
	{/each}
	<p>Also comparing other apps? See the <a href="/tricount-alternative">Tricount alternative</a> page.</p>
</ArticleLayout>
