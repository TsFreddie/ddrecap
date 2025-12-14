import { decodeAsciiURIComponent } from '$lib/link';
import { decodeBase64Url } from '$lib/base64url';
import { decode } from 'msgpackr';
import { CURRENT_YEAR } from '$lib/consts';
import { getDatabaseTime, getPoints } from '$lib/server/db.js';

export const load = async ({ url, parent }) => {
	let year = parseInt(url.searchParams.get('year') || CURRENT_YEAR.toString());
	let name = decodeAsciiURIComponent(url.searchParams.get('name') || '');
	let tz = url.searchParams.get('tz') || 'utc+0';
	let databaseTime = getDatabaseTime();

	let code = url.searchParams.get('code');

	if (code) {
		const decoded = decodeBase64Url(code, { buffer: true });
		const { n, y, t } = decode(decoded) as { n: string; y: number; t: string };
		name = n || name;
		year = y || year;
		tz = t || tz;
	}

	if (!name) {
		return { databaseTime, year, ...(await parent()) };
	}

	let player;
	let skin;

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
		} catch {}
	} catch (e) {
		console.error(e);
		const error = `500 - UNKNOWN ERROR`;
		return { databaseTime, year, error, tz, ...(await parent()) };
	}

	return { databaseTime, year, name, skin, player, tz, ...(await parent()) };
};
