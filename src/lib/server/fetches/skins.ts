import { FetchCache } from '../fetch-cache';

export type SkinInfo = {
	skins: {
		name: string;
		type: string;
		hd: {
			uhd: false;
		};
		creator: string;
		license: string;
		bodypart: string;
		gameversion: string;
		date: string;
		skinpack: string;
		imgtype: string;
		url: string;
	}[];
	map: { [key: string]: string };
};

export const skins = new FetchCache<SkinInfo>(
	'https://ddnet.org/skins/skin/skins.json',
	async (response) => {
		const result = (await response.json()) as SkinInfo;
		const map: { [key: string]: string } = {};
		result.skins = result.skins.map((skin) => {
			skin.url =
				skin.type == 'normal'
					? `https://teeworlds.cn/api/skins/${encodeURIComponent(skin.name)}.${skin.imgtype}`
					: `https://teeworlds.cn/api/skins/${encodeURIComponent(skin.type)}/${encodeURIComponent(skin.name)}.${skin.imgtype}`;
			map[skin.name] = skin.url;
			return skin;
		});
		result.map = map;
		return result;
	}
);
