export function handleError({ error }) {
	if (error instanceof Error) {
		if (error.constructor.name === 'SvelteKitError' && (error as any).status == 404) {
			return;
		}
	}

	// log other errors
	console.error(error);
}
