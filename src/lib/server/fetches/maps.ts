import { FetchCache } from '$lib/server/fetch-cache';

export type MapList = {
	name: string;
	website: string;
	thumbnail: string;
	web_preview: string;
	type: string;
	points: number;
	difficulty: number;
	mapper: string;
	release: string;
	width: number;
	height: number;
	tiles: string[];
}[];

export const maps = new FetchCache<MapList>(
	'https://ddnet.org/releases/maps.json',
	async (response) => {
		return await response.json();
	}
);
