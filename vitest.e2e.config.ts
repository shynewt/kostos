import { defineConfig } from 'vitest/config';

// browser scenarios against the production build; run `npm run build` first
export default defineConfig({
	test: {
		include: ['e2e/**/*.e2e.ts'],
		testTimeout: 60_000,
		hookTimeout: 60_000,
		fileParallelism: false
	}
});
