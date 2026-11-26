// See https://svelte.dev/docs/kit/types#app.d.ts
/// <reference types="vite-plugin-pwa/client" />

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** the add form, opened as a sheet over the current screen */
			addingExpense?: boolean;
		}
		// interface Platform {}
	}
}

export {};
