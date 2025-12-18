import { DateTime, Duration } from 'luxon';
import type { m as messages } from './paraglide/messages';
import { encodeBase64Url } from './base64url';

export const escapeHTML = (str: string) => {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');
};

export const uaIsMobile = (ua: string | null) => {
	if (!ua) return false;
	const regex =
		/(iPhone|iPad|iPod|Android|BlackBerry|Windows Phone|BB10|webOS|IEMobile|Opera Mini|Mobile|Silk-Accelerated|(hpw|web)OS|Opera Mini)/i;
	return regex.test(ua);
};

const convertLocale = (displayLocale: string) => {
	// if display locale has region, use it
	if (displayLocale.split('-')[1]) return displayLocale;

	let locale = DateTime.local().locale;
	if (displayLocale !== locale.split('-')[0]) {
		// use langLocale if target language is different from browser language
		locale = displayLocale;
	}

	return locale;
};

export const month = (month: number, displayLocale: string) => {
	let locale = convertLocale(displayLocale);
	return DateTime.fromObject({ month }).setLocale(locale).toLocaleString({ month: 'long' });
};

export const date = (date: Date, tz: string, displayLocale: string) => {
	let locale = convertLocale(displayLocale);
	return DateTime.fromJSDate(date).setLocale(locale).setZone(tz).toLocaleString(DateTime.DATE_MED);
};

export const time = (date: Date, tz: string, displayLocale: string) => {
	let locale = convertLocale(displayLocale);
	return DateTime.fromJSDate(date)
		.setLocale(locale)
		.setZone(tz)
		.toLocaleString({ hour: 'numeric', minute: 'numeric' });
};

export const datetime = (date: Date, tz: string, displayLocale: string) => {
	let locale = convertLocale(displayLocale);
	return DateTime.fromJSDate(date)
		.setLocale(locale)
		.setZone(tz)
		.toLocaleString(DateTime.DATETIME_MED);
};

export const durationFull = (seconds: number, displayLocale: string, m: typeof messages) => {
	let locale = convertLocale(displayLocale);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	seconds = Math.round(seconds % 60);

	const format =
		days == 0
			? hours == 0
				? minutes == 0
					? m.format_s()
					: m.format_ms()
				: m.format_hms()
			: m.format_dhms();
	if (format) {
		return Duration.fromObject({ days, hours, minutes, seconds }).toFormat(format);
	}

	return Duration.fromObject({ days, hours, minutes, seconds })
		.reconfigure({ locale })
		.toHuman({ listStyle: 'narrow', showZeros: false });
};

export const duration = (seconds: number, displayLocale: string, m: typeof messages) => {
	let locale = convertLocale(displayLocale);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	seconds = Math.round(seconds % 60);

	const format = hours == 0 ? (minutes == 0 ? m.format_s() : m.format_ms()) : m.format_hms();
	if (format) {
		return Duration.fromObject({ hours, minutes, seconds }).toFormat(format);
	}

	return Duration.fromObject({ hours, minutes, seconds })
		.reconfigure({ locale })
		.toHuman({ listStyle: 'narrow', showZeros: false });
};

export const durationMinutes = (seconds: number, displayLocale: string, m: typeof messages) => {
	let locale = convertLocale(displayLocale);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const format = hours == 0 ? m.format_m() : m.format_hm();
	if (format) {
		return Duration.fromObject({ hours, minutes }).toFormat(format);
	}

	return Duration.fromObject({ hours, minutes })
		.reconfigure({ locale })
		.toHuman({ listStyle: 'narrow', showZeros: false });
};

export const getPlayerSkin = async (
	player: string,
	fetch: typeof globalThis.fetch = globalThis.fetch
) => {
	if (!player) return { n: 'default' };
	try {
		const skin = await (await fetch(`/skins?name=${encodeURIComponent(player)}`)).json();
		if (!skin.n || skin.n === 'x-spec') {
			return { n: 'default' };
		}
		return skin;
	} catch (e) {
		console.error('Failed to fetch player skin for ' + player);
		console.error(e);
		return { n: 'default' };
	}
};

export const code = async (data: { n: string; y: number; t: number }) => {
	return encodeBase64Url(`${data.t}\u0003${data.y}\u0003${data.n}`);
};
