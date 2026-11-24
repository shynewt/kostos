<script lang="ts">
	import ComparisonTable from '$lib/components/landing/ComparisonTable.svelte';
	import { COMPARED_ON, type Faq } from '$lib/components/landing/content';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import ArticleLayout from '$lib/components/site/ArticleLayout.svelte';
	import { faqSchema } from '$lib/components/site/faq';
	import JsonLd from '$lib/components/site/JsonLd.svelte';

	const FAQS: Faq[] = [
		{ question: 'Isn’t Tricount free too?', answer: 'Yes. Tricount is free and has no ads, so the differences are elsewhere: Kostos is open source, end-to-end encrypted, never asks you to log in and has no tracking.' },
		{ question: 'Can I import my Tricount groups?', answer: 'Not yet. Start a Kostos group with the same people and add each open balance as one expense, then carry on from there.' },
		{ question: 'Who runs Kostos?', answer: 'Kostos is an independent open source project. Its code is public on GitHub, and you can run your own sync server.' }
	];
</script>

<ShareMeta
	title="Open source Tricount alternative · Kostos"
	description="Kostos is a free, open source Tricount alternative. No login, no ads, no tracking, and end-to-end encrypted. See how Kostos and Tricount compare."
	image="/og-image.png"
	imageAlt="Kostos, the free and private group expense splitter"
	path="/tricount-alternative"
/>
<svelte:head><title>Open source Tricount alternative · Kostos</title></svelte:head>
<JsonLd data={faqSchema(FAQS)} />

<ArticleLayout>
	<p class="updated">Compared on {COMPARED_ON}</p>
	<h1>An open source Tricount alternative</h1>
	<p class="lede">
		Tricount and Kostos are both free and show no ads. Kostos differs in what happens to your data: it’s open source, encrypts
		your expenses on your phone, never asks you to log in, and isn’t owned by a bank.
	</p>

	<h2>Kostos vs Tricount at a glance</h2>
	<ComparisonTable versus={['Tricount']} />

	<h2>What’s different with Kostos</h2>
	<h3>Encrypted before it leaves your phone</h3>
	<p>
		Kostos encrypts every change on your device with the group’s key, and the sync server only stores data it can’t read.
		Tricount makes no claim of end-to-end encryption.
	</p>
	<h3>No login, on any device</h3>
	<p>
		Tricount’s login is optional, and it’s what keeps your groups in sync across devices. In Kostos the invite link does that
		job: open it on a second phone or a laptop and the group is there.
	</p>
	<h3>Independent, with no tracking</h3>
	<p>
		Tricount belongs to bunq, a bank, since 2022, and its App Store listing says it uses identifiers to track you. Kostos has no
		analytics, no ads and no trackers.
	</p>
	<h3>Open source</h3>
	<p>Anyone can read the code on GitHub, and you can run your own sync server if you’d rather not use ours.</p>

	<h2>Where Tricount does more</h2>
	<ul>
		<li>Tricount has apps in the App Store and Google Play. Kostos installs from the browser instead.</li>
		<li>If you bank with bunq, Tricount is part of the same family of apps.</li>
	</ul>

	<h2>How to switch from Tricount</h2>
	<ol>
		<li><a href="/new">Create a Kostos group</a> with the same people, and pick the same currency.</li>
		<li>Add each balance that’s still open in Tricount as a single expense, so everyone starts where they left off.</li>
		<li>Share the invite link in your group chat. Everyone opens it and picks their name.</li>
	</ol>

	<h2>Questions</h2>
	{#each FAQS as item (item.question)}
		<h3>{item.question}</h3>
		<p>{item.answer}</p>
	{/each}
	<p>Coming from Splitwise instead? See the <a href="/splitwise-alternative">Splitwise alternative</a> page.</p>
</ArticleLayout>
