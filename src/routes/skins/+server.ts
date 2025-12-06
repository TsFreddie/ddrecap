import { error } from '@sveltejs/kit';
import { skins } from '$lib/server/fetches/skins';

export const GET = async ({ url }) => {
	const name = url.searchParams.get('name');

	if (!name) {
		const skinData = await skins.fetch();
		return new Response(JSON.stringify(skinData.map), {
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}

	let skin = '{}';

	try {
		skin = await (
			await fetch(`https://teeworlds.cn/ddnet/playerskin?name=${encodeURIComponent(name)}`)
		).text();
	} catch (e) {
		console.error(e);
	}

	return new Response(skin, {
		headers: {
			'Content-Type': 'application/json'
		}
	});
};
