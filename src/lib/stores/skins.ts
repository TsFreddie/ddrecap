import { browser } from '$app/environment';

let skins: { [key: string]: string } | null = null;

export const getSkinData = async () => {
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
	return skins;
};

export const getSkinUrl = async (name: string): Promise<string | null> => {
	const skins = await getSkinData();
	if (!skins) return null;
	return new URL(skins[name], 'https://teeworlds.cn').href;
};
