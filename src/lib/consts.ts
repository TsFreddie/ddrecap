// define current yearly, will only generate yearly data for this year
export const CURRENT_YEAR = 2025;

export type YearlyData = {
	/** version */
	v: number;
	/** name */
	n: string;
	/** year */
	y: number;
	/** this year total points */
	tp: number;
	/** last year total points */
	lp: number;
	/** most point gainer [map, points] */
	mpg: [string, number];
	/** total races */
	tr: number;
	/** most hourly race [timeName, finishes] */
	mhr: [string, number];
	/** most monthly race [startMonth, endMonth, seasonName, finishes] */
	mmr: [number, number, string, number];
	/** late night finish [map, time, timestamp] */
	lnf: [string, number, number];
	/** this year's map finishes [total, finished] */
	ymf: [number, number];
	/** most finishes servers [server, finishes] */
	mps: [string, number];
	/** most finished map [map, num] */
	mfm: [string, number];
	/** longest time finished race [map, time, timestamp] */
	lf: [string, number, number];
	/** most played teammates [[name, num], [name, num]] */
	mpt: [[string, number], [string, number]];
	/** biggest team size [teamsize, map, playerNames] */
	bt: [number, string, string];
	/** nearest release record [map, time] */
	nrr: [string, number];
	/** mapper special */
	map: string[];
};
