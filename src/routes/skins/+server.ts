import { skins } from '$lib/server/fetches/skins';

export const GET = async ({ url }) => {
	const name = url.searchParams.get('name');

	if (!name) {
		const skinData = await skins.fetch();
		return new Response(JSON.stringify(skinData.map), {
			headers: {
				'Content-Type': 'application/json',
				'cache-control': 'public, max-age=1209600'
			}
		});
	}

	try {
		const data = await (
			await fetch(`https://ddstats.tw/player/json?player=${encodeURIComponent(name)}`, {
				signal: AbortSignal.timeout(5000)
			})
		).json();

		if (data) {
			return new Response(
				JSON.stringify({
					n: data.profile.skin_name,
					c: data.profile.skin_color_body,
					f: data.profile.skin_color_feet
				}),
				{
					headers: {
						'content-type': 'application/json',
						'cache-control': 'public, max-age=600'
					}
				}
			);
		}
	} catch {}

	return new Response('{}', {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'public, max-age=600'
		}
	});
};
