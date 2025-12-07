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

	try {
		const playerData = await (
			await fetch(`https://ddnet.org/players/?json2=${encodeURIComponent(name)}`)
		).json();
		if (!playerData || !playerData.player) {
			const error = `404 - Player ${name} not found`;
			return { year, error, tz, ...(await parent()) };
		}
		player = {
			name: playerData.player,
			points: playerData.points
		};
	} catch (e) {
		console.error(e);
		const error = `404 - Player ${name} not found`;
		return { year, error, tz, ...(await parent()) };
	}

	let skin = null;

	try {
		skin = await (await fetch(`/skins?name=${encodeURIComponent(name)}`)).json();
	} catch (e) {
		console.error(e);
	}

	return { year, name, skin, player, tz, ...(await parent()) };
};
