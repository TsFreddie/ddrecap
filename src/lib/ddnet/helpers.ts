/** Convert ddnet's YYYY-MM-DD HH:MM:SS which is GMT+1 to local time */
export const ddnetDate = (date: string) => {
	return new Date(date.slice(0, 10) + 'T' + date.slice(11, 19) + '+01:00');
};

const MAP_TYPES: { [key: string]: string } = {
	solo: 'Solo',
	dummy: 'Dummy',
	novice: 'Novice',
	moderate: 'Moderate',
	brutal: 'Brutal',
	insane: 'Insane',
	oldschool: 'Oldschool',
	race: 'Race',
	fun: 'Fun',
	'ddmax.easy': 'DDMaX.Easy',
	'ddmax.next': 'DDMaX.Next',
	'ddmax.pro': 'DDMaX.Pro',
	'ddmax.nut': 'DDMaX.Nut'
};

export const mapType = (type: string) => {
	return MAP_TYPES[type.toLowerCase()] || type;
};

export const ddnetColorToRgb = (color: number) => {
	const h = ((color >> 16) & 0xff) / 255;
	const s = ((color >> 8) & 0xff) / 255;
	const l = 0.5 + ((color & 0xff) / 255) * 0.5;

	const h1 = h * 6;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs((h1 % 2) - 1));

	let r = 0;
	let g = 0;
	let b = 0;

	switch (Math.floor(h1)) {
		case 0:
			r = c;
			g = x;
			break;
		case 1:
			r = x;
			g = c;
			break;
		case 2:
			g = c;
			b = x;
			break;
		case 3:
			g = x;
			b = c;
			break;
		case 4:
			r = x;
			b = c;
			break;
		case 5:
			r = c;
			b = x;
			break;
		case 6:
			r = c;
			b = x;
			break;
	}

	const m = l - c / 2;
	return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};
