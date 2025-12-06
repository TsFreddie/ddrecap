import { browser } from '$app/environment';

const ssr = false;

export const load = async ({ url, data, parent }) => {
	let ua = null;
	if (browser) {
		ua = navigator.userAgent;
	}

	return { ua, ...data, ...(await parent()) };
};
