import type { Faq } from '$lib/components/landing/content';

/** FAQPage structured data; search engines want it to match the visible questions and answers exactly. */
export function faqSchema(faqs: Faq[]): Record<string, unknown> {
	return {
		'@type': 'FAQPage',
		mainEntity: faqs.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } }))
	};
}
