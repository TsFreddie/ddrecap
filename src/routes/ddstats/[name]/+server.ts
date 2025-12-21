import { CURRENT_YEAR } from '$lib/consts.js';

export const GET = async ({ params, fetch }) => {
	const name = params.name;
	const profile = await (
		await fetch(`https://ddstats.tw/player/json?player=${encodeURIComponent(name)}`, {
			signal: AbortSignal.timeout(5000)
		})
	).json();

	if (profile.error) {
		return new Response(JSON.stringify({ error: profile.error }), {
			status: 404,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=1209600' // two weeks
			}
		});
	}

	const playtime = new Array(12).fill(0);

	for (const data of profile.playtime_per_month) {
		if (!data.year_month.startsWith(CURRENT_YEAR)) continue;
		const month = parseInt(data.year_month.split('-')[1]) - 1;
		playtime[month] = data.seconds_played;
	}

	return new Response(JSON.stringify({ playtime }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=1209600' // two weeks
		}
	});
};
