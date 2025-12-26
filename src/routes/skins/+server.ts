import { skins } from '$lib/server/fetches/skins';

export const GET = async ({ url }) => {
	const skinData = await skins.fetch();

	if (!skinData) {
		throw new Error('Internal Cache Error');
	}

	return new Response(JSON.stringify(skinData.map), {
		headers: {
			'Content-Type': 'application/json',
			'cache-control': 'public, max-age=1209600'
		}
	});
};
