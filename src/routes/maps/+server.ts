import { maps } from '$lib/server/fetches/maps';

export const GET = async () => {
	const mapData = await maps.fetch();
	return new Response(JSON.stringify(mapData), {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'public, max-age=21600'
		}
	});
};
