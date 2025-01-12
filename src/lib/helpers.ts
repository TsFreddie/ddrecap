export const escapeHTML = (str: string) => {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');
};

export const secondsToTime = (totalSeconds: number) => {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);

	if (hours > 0)
		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const uaIsMobile = (ua: string | null) => {
	if (!ua) return false;
	const regex =
		/(iPhone|iPad|iPod|Android|BlackBerry|Windows Phone|BB10|webOS|IEMobile|Opera Mini|Mobile|Silk-Accelerated|(hpw|web)OS|Opera Mini)/i;
	return regex.test(ua);
};

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

export const month = (month: number) => {
	return MONTHS[month - 1];
};
