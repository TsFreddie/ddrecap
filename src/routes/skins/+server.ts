import { skins } from '$lib/server/fetches/skins';

export const GET = async ({ url }) => {
	const name = url.searchParams.get('name');
	const tryDDStatsFirst = url.searchParams.get('ddstats') === 'true';

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
	let found = false;

	if (tryDDStatsFirst) {
		try {
			const data = await (
				await fetch(`https://ddstats.tw/player/json?player=${encodeURIComponent(name)}`, {
					signal: AbortSignal.timeout(5000)
				})
			).json();

			if (data) {
				skin = JSON.stringify({
					n: data.profile.skin_name,
					c: data.profile.skin_color_body,
					f: data.profile.skin_color_feet
				});
				found = true;
			}
		} catch {}
	}

	if (!found) {
		try {
			skin = JSON.stringify(
				await (
					await fetch(`https://teeworlds.cn/api/playerskin?name=${encodeURIComponent(name)}`)
				).json()
			);
		} catch {}
	}

	return new Response(skin, {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'public, max-age=600'
		}
	});
};
