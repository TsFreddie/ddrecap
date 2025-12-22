import { fail, redirect } from '@sveltejs/kit';

export const actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const access = data.get('access') as string;
		const expectedPassword = process.env.DDRECAP_PASSWORD;

		if (!expectedPassword) {
			// If no password is set in env, redirect to home
			throw redirect(302, '/');
		}

		if (!access) {
			return fail(400, { missing: true });
		}

		if (access !== expectedPassword) {
			return fail(400, { incorrect: true });
		}

		// Set authentication cookie
		cookies.set('ddrecap_auth', access, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		throw redirect(302, '/');
	}
};