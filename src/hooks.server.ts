import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';

export function handleError({ error }) {
	if (error instanceof Error) {
		if (error.constructor.name === 'SvelteKitError' && (error as any).status == 404) {
			return;
		}
	}

	// log other errors
	console.error(error);
}

export const handle: Handle = ({ event, resolve }) => {
	return paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});
};
