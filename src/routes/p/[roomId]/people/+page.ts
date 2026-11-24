import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// members moved to the Group tab; old links and installed apps still open /people
export const load: PageLoad = ({ params }) => {
	redirect(308, `/p/${params.roomId}/settings`);
};
