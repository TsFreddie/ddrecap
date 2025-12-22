import { redirect } from '@sveltejs/kit';

export const load = async ({ url, cookies }) => {
	// Check if password protection is enabled
	const password = process.env.DDRECAP_PASSWORD;

	if (password) {
		// Skip password check for guard route and static assets
		if (url.pathname !== '/guard') {
			const authCookie = cookies.get('ddrecap_auth');

			// If no auth cookie or invalid password, redirect to guard
			if (!authCookie || authCookie !== password) {
				throw redirect(302, '/guard');
			}
		}
	}

	return {};
};
