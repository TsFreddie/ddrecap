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
	'https://teeworlds.cn/api/skins',
	async (response) => {
		const result = (await response.json()) as SkinInfo;
		return result;
	}
);
