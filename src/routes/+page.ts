import { browser } from '$app/environment';
import { getPlayerSkinDDStats } from '$lib/helpers.js';

export const load = async ({ fetch, data, parent }) => {
	let ua = null;
	if (browser) {
		ua = navigator.userAgent;
	}

	let skin;
	if (data.player) {
		skin = await getPlayerSkinDDStats(data.player.name, fetch);
	}

	return { ua, skin, ...data, ...(await parent()) };
};
