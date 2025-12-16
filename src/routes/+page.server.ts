import { decodeAsciiURIComponent } from '$lib/link';
import { decodeBase64Url } from '$lib/base64url';
import { decode } from 'msgpackr';
import { CURRENT_YEAR } from '$lib/consts';
import { getDatabaseTime, getPoints } from '$lib/server/db.js';

export const load = async ({ url, parent }) => {
	let year = parseInt(url.searchParams.get('y') || CURRENT_YEAR.toString());
	let name = decodeAsciiURIComponent(url.searchParams.get('n') || '');
	let tz = url.searchParams.get('t') || 'utc+0';
	let databaseTime = getDatabaseTime();

	let code = url.searchParams.get('code');

	if (code) {
		const decoded = decodeBase64Url(code);
		const [y, t, ...rest] = decoded.split('\u0003');
		name = rest.join('\u0003') || name;
		year = parseInt(y) || year;
		tz = t || tz;
	}

	if (!name) {
		return { databaseTime, year, ...(await parent()) };
	}

	let player;
	let skin: {
		n: string;
		b?: number;
		f?: number;
	} = { n: 'default' };

	try {
		const points = getPoints(name);
		if (!points) {
			const error = `404 - ${name} NO RECORDS`;
			return { databaseTime, year, error, tz, ...(await parent()) };
		}

		player = {
			name: name,
			points: points
		};

		try {
			skin = await (
				await fetch(`https://teeworlds.cn/api/playerskin?name=${encodeURIComponent(name)}`)
			).json();

			if (!skin.n || skin.n === 'x-spec') {
				skin = { n: 'default' };
			}
		} catch {}
	} catch (e) {
		console.error(e);
		const error = `500 - UNKNOWN ERROR`;
		return { databaseTime, year, error, tz, ...(await parent()) };
	}

	return { databaseTime, year, name, skin, player, tz, ...(await parent()) };
};
