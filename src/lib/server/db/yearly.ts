import { openKv } from '@deno/kv';

const kv = await openKv();

export const getYearlyData = async (name: string, year: number, offset: number) => {
	return (await kv.get<Uint8Array>([name, year, offset])).value;
};

export const setYearlyData = async (
	name: string,
	year: number,
	offset: number,
	data: Uint8Array
) => {
	await kv.set([name, year, offset], data);
};
