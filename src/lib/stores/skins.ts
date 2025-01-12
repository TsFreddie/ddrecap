import { browser } from '$app/environment';

let skins: { [key: string]: string } | null = null;

export const getSkinUrl = async (name: string): Promise<string | null> => {
	if (!browser) {
		return null;
	}
	if (!skins) {
		try {
			skins = await (await fetch('/skins')).json();
		} catch (e) {
			console.error(e);
			skins = {};
		}
	}
	if (!skins) return null;
	return skins[name];
};
