import type { PageLoad } from './$types';
import { decodeAsciiURIComponent } from '$lib/link';
import { decode } from 'msgpackr';
import { browser } from '$app/environment';

const ssr = false;

export const load = (async ({ url, data, parent }) => {
	let ua = null;
	if (browser) {
		ua = navigator.userAgent;
	}

	return { ua, ...data, ...(await parent()) };
}) satisfies PageLoad;
