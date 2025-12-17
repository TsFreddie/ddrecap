import { browser } from '$app/environment';
import { getPlayerSkin } from '$lib/helpers.js';

export const ssr = false;

export const load = async ({ data, parent }) => {
	let ua = null;
	if (browser) {
		ua = navigator.userAgent;
	}

	let skin;
	if (data.player) {
		skin = await getPlayerSkin(data.player.name);
	}

	return { ua, skin, ...data, ...(await parent()) };
};
