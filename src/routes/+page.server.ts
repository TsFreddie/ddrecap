import { decodeAsciiURIComponent } from '$lib/link';
import { decodeBase64Url } from '$lib/base64url';
import { decode } from 'msgpackr';
import { CURRENT_YEAR } from '$lib/consts';

export const load = async ({ fetch, url, parent }) => {
	let year = parseInt(url.searchParams.get('year') || CURRENT_YEAR.toString());
	let name = decodeAsciiURIComponent(url.searchParams.get('name') || '');
	let tz = url.searchParams.get('tz') || 'utc+0';

	let code = url.searchParams.get('code');

	if (code) {
		const decoded = decodeBase64Url(code, { buffer: true });
		const { n, y, t } = decode(decoded) as { n: string; y: number; t: string };
		name = n || name;
		year = y || year;
		tz = t || tz;
	}

	if (!name) {
		return { year, ...(await parent()) };
	}

	let player;
	let skin;

	try {
		const playerData = await (
			await fetch(`https://ddstats.tw/profile/json?player=${encodeURIComponent(name)}`)
		).json();
		if (!playerData || !playerData.name) {
			const error = `404 - Player ${name} not found`;
			return { year, error, tz, ...(await parent()) };
		}
		player = {
			name: playerData.name,
			points: playerData.points
		};
		skin = {
			n: playerData.skin_name,
			b: playerData.skin_color_body,
			f: playerData.skin_color_feet
		};
	} catch (e) {
		console.error(e);
		const error = `404 - Player ${name} not found`;
		return { year, error, tz, ...(await parent()) };
	}

	return { year, name, skin, player, tz, ...(await parent()) };
};
