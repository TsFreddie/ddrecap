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
		skin = JSON.stringify(
			await (
				await fetch(`https://teeworlds.cn/api/playerskin?name=${encodeURIComponent(name)}`)
			).json()
		);
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
