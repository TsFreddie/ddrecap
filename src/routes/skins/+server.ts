import { skins } from '$lib/server/fetches/skins';

export const GET = async ({ url }) => {
	const name = url.searchParams.get('name');

	if (!name) {
		const skinData = await skins.fetch();
		return new Response(JSON.stringify(skinData.map), {
			headers: {
				'Content-Type': 'application/json',
				'cache-control': 'public, max-age=21600'
			}
		});
	}

	let skin = '{}';

	try {
		const playerData = await (
			await fetch(`https://ddstats.tw/profile/json?player=${encodeURIComponent(name)}`)
		).json();
		skin = JSON.stringify({
			n: playerData.skin_name,
			b: playerData.skin_color_body,
			f: playerData.skin_color_feet
		});
	} catch (e) {
		console.error(e);
	}

	return new Response(skin, {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'public, max-age=600'
		}
	});
};
