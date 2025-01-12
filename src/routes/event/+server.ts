import type { RequestHandler } from './$types';
import sqlstring from 'sqlstring';
import { produce } from 'sveltekit-sse';
import { maps } from '$lib/server/fetches/maps';
import { ddnetDate } from '$lib/ddnet/helpers';
import { getYearlyData, setYearlyData } from '$lib/server/db/yearly';
import { encode, decode } from 'msgpackr';
import { error } from '@sveltejs/kit';

// define current yearly, will only generate yearly data for this year
const CURRENT_YEARLY = 2024;

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
	/** this year's map type finishes [server, total, finished] */
	ymfs: [string, number, number];
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

const fetchDDStats = async (sql: string) => {
	sql = sql.replace(/\n/g, ' ');
	const result = await fetch(`https://db.ddstats.org/ddnet.json?sql=${encodeURIComponent(sql)}`);

	if (!result.ok) {
		throw new Error(`Failed to fetch data: ${result.status} ${result.statusText}`);
	}

	const json = await result.json();
	if (!json.ok) {
		throw new Error(`Failed to fetch data: ${json.error}`);
	}
	return json;
};

/** [map, points, lowestTime, server] */
const findAllPointsBeforeTime = async (tz: string, name: string, time: Date) => {
	let offset = 0;
	const rows = [];
	while (true) {
		const sql = `
        SELECT m.Map, m.Points, LowestTime, m.Server FROM maps m
        JOIN (SELECT Map, MIN(Time) as LowestTime FROM race 
            WHERE Name = ${sqlstring.escape(name)}
            AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(time)} GROUP BY Map
        ) r
        ON m.Map = r.Map LIMIT ${offset}, 1001;`;

		const result = await fetchDDStats(sql);
		rows.push(...(result?.rows || []));
		if (!result?.truncated) {
			break;
		}
		offset += result.rows.length;
	}
	return rows as [string, number, number, string][];
};

/** [count, slice] */
const countTimeSliceFinishes = async (
	tz: string,
	name: string,
	timeFormat: '%H' | '%m',
	start: Date,
	end: Date
) => {
	const sql = `
    SELECT COUNT(), strftime('${timeFormat}', datetime(Timestamp, '${tz}')) as Slice, Server FROM race
    WHERE Name=${sqlstring.escape(name)}
    AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
    GROUP BY Slice;`;

	const result = await fetchDDStats(sql);
	return result.rows as [number, string][];
};

/** [map, time, timestamp] */
const findLateNightFinishedRace = async (tz: string, name: string, start: Date, end: Date) => {
	const sql = `
    SELECT r.Map, r.Time, r.DateTime, m.Server FROM maps m JOIN
		(SELECT Map, Time, unixepoch(Timestamp) as DateTime FROM race
			WHERE Name=${sqlstring.escape(name)}
			AND (
				(time(Timestamp, '${tz}') < '05:00' AND Time <= CAST(strftime('%M', datetime(Timestamp, '${tz}')) as INT) * 60 + CAST(strftime('%H', datetime(Timestamp, '${tz}')) as INT) * 3600 + 7200) OR
				(time(Timestamp, '${tz}') < '08:00' AND Time >= CAST(strftime('%H', datetime(Timestamp, '${tz}')) as INT) * 1800)
			)
			AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}) r
		ON m.Map = r.Map AND m.Points > 0 ORDER BY Time desc LIMIT 1;`;

	const result = await fetchDDStats(sql);
	return result.rows as [string, number, number][];
};

/** [type, total, finished] */
const findServerFinishCount = async (tz: string, name: string, start: Date, end: Date) => {
	const sql = `
    SELECT m.Server, COUNT(m.Map) as Total, COUNT(r.Map) as Finished FROM
        (SELECT Server, Map FROM maps
            WHERE datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
        ) m LEFT JOIN 
        (SELECT Map FROM race WHERE
			Name = ${sqlstring.escape(name)}
			AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
		 GROUP BY Map) r
    ON m.Map = r.Map GROUP BY Server;`;
	const result = await fetchDDStats(sql);
	return result.rows as [string, number, number][];
};

/** [type, finishes] */
const findServerFinishes = async (tz: string, name: string, start: Date, end: Date) => {
	const sql = `
    SELECT m.Server, COUNT(r.Map) as Finishes FROM Maps m JOIN
        (SELECT Map FROM race
        WHERE Name = ${sqlstring.escape(name)}
        AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}) r
    ON m.Map = r.Map GROUP BY Server;`;

	const result = await fetchDDStats(sql);
	return result.rows as [string, number][];
};

/** [map, num] */
const findMostFinishedMap = async (tz: string, name: string, start: Date, end: Date) => {
	const sql = `
    SELECT Map, COUNT(Map) as Num FROM race 
    WHERE Name = ${sqlstring.escape(name)}
    AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
    GROUP BY Map ORDER BY Num DESC LIMIT 1;`;

	const result = await fetchDDStats(sql);
	return result.rows as [string, number][];
};

/** [map, time] */
const findNearestReleaseRecord = async (tz: string, name: string, start: Date, end: Date) => {
	const sql = `
    SELECT m.Map, unixepoch(r.Timestamp) - unixepoch(m.Timestamp) as TimeDiff FROM maps m JOIN race r
	ON m.Map = r.Map AND r.Name = ${sqlstring.escape(name)}
    AND datetime(m.Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(m.Timestamp, '${tz}') > ${sqlstring.escape(start)}
	ORDER BY unixepoch(r.Timestamp) - unixepoch(m.Timestamp) ASC LIMIT 1`;

	const result = await fetchDDStats(sql);
	return result.rows as [string, number][];
};

/** [map, time, timestamp] */
const findLongestTimeFinishedRace = async (tz: string, name: string, start: Date, end: Date) => {
	const sql = `
    SELECT r.Map, r.Time, r.DateTime FROM maps m JOIN 
		(SELECT Map, Time, unixepoch(Timestamp) as DateTime from race
			WHERE Name = ${sqlstring.escape(name)}
			AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}) r
	ON m.Map = r.Map AND m.Points > 0 ORDER BY Time DESC LIMIT 1;`;

	const result = await fetchDDStats(sql);
	return result.rows as [string, number, number][];
};

/** [name, num]*/
const findMostPlayedTeammate = async (tz: string, name: string, start: Date, end: Date) => {
	const sql = `
    WITH FilteredIDs AS (
        SELECT DISTINCT ID
        FROM teamrace
        WHERE Name = ${sqlstring.escape(name)}
        AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
    )
    SELECT t.Name, COUNT(t.ID) as Num
    FROM teamrace t
    JOIN FilteredIDs f ON t.ID = f.ID
    WHERE t.Name != ${sqlstring.escape(name)}
    GROUP BY t.Name ORDER BY Num DESC LIMIT 2;`;

	const result = await fetchDDStats(sql);
	return result.rows as [string, number][];
};

/** [teamsize, map, playerNames] */
const findTeamSize = async (tz: string, name: string, start: Date, end: Date) => {
	const sql = `
    WITH FilteredIDs AS (
        SELECT DISTINCT ID
        FROM teamrace
        WHERE Name = ${sqlstring.escape(name)}
        AND datetime(Timestamp, '${tz}') <= ${sqlstring.escape(end)} AND datetime(Timestamp, '${tz}') > ${sqlstring.escape(start)}
    )
    SELECT COUNT() as Num, t.Map, GROUP_CONCAT(t.Name, ', ')
    FROM teamrace t
    JOIN FilteredIDs f ON t.ID = f.ID
    GROUP BY t.ID ORDER BY Num DESC LIMIT 1;`;

	const result = await fetchDDStats(sql);
	return result.rows as [number, string, string][];
};

export const POST: RequestHandler = async ({ url }) => {
	const name = url.searchParams.get('name') || '';
	const year = parseInt(url.searchParams.get('year') || CURRENT_YEARLY.toString());
	let timezone = (url.searchParams.get('tz') || 'utc+0').toLowerCase();

	if (!timezone.startsWith('utc+') && !timezone.startsWith('gmt+')) {
		// this should convert a timezone to GMT offset
		// we fixed the date to january so it should be without DST
		const date = new Date(Date.UTC(year, 0, 1));
		const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			hour: '2-digit',
			hour12: false,
			timeZoneName: 'short'
		});
		timezone =
			dateTimeFormat.formatToParts(date).find((part) => part.type == 'timeZoneName')?.value ||
			'utc+0';
	}

	// this should give us the truncated GMT offset in hours
	// timezone like GMT+04:30 will be treated as GMT+04:00
	// the less than an hour error should be acceptable
	// the finally date should be displayed in the user's timezone
	// errors can only show up when the user have date info at the start or the end of the year
	let offset = parseInt(timezone.slice(4));

	// referece: https://en.wikipedia.org/wiki/List_of_UTC_offsets
	if (offset < -12 || offset > 14) {
		return error(400, 'Invalid timezone');
	}

	// this will be used for querying the database
	const tz = `${offset < 0 ? '-' : '+'}${Math.abs(offset).toString().padStart(2, '0')}:00`;

	const start = new Date(`${year}-01-01T00:00:00`);
	const end = new Date(`${year}-12-31T23:59:59`);
	const lastYearEnd = new Date(`${year - 1}-12-31T23:59:59`);

	if (!name) {
		return error(404, 'Not found');
	}

	let stopped = false;

	return produce(
		async ({ emit, lock }) => {
			try {
				const data = getYearlyData(name, year, offset);
				if (data) {
					const d = decode(data) as YearlyData;
					if (stopped) return;
					emit('progress', '100');
					emit('data', JSON.stringify({ d }));
					lock.set(false);
					return;
				}

				// don't generate yearly data for other years
				if (year != CURRENT_YEARLY) {
					throw new Error('Not available');
				}

				const d = {} as YearlyData;

				d.v = 1;
				d.n = name;
				d.y = year;

				const totalSteps = 13;
				let currentStep = 0;

				const updateProgress = () => {
					if (stopped) return true;
					currentStep++;
					if (currentStep > totalSteps) currentStep = totalSteps;
					emit('progress', `${Math.round((currentStep / totalSteps) * 100)}`);
					return false;
				};

				const thisYearPoints = await findAllPointsBeforeTime(tz, name, end);
				if (updateProgress()) return;
				const thisYearTotalPoints = thisYearPoints.reduce((sum, [_, points]) => sum + points, 0);
				const lastYearPoints = await findAllPointsBeforeTime(tz, name, lastYearEnd);
				if (updateProgress()) return;
				const lastYearTotalPoints = lastYearPoints.reduce((sum, [_, points]) => sum + points, 0);
				// most point gainer that isn't in the last year
				const thisYearOnlyPoints = thisYearPoints.filter(
					([name]) => !lastYearPoints.some(([name2]) => name == name2)
				);
				const thisYearPointGainers = thisYearOnlyPoints.sort((a, b) => b[1] - a[1]);
				const mostPointGainer = thisYearPointGainers[0];
				d.tp = thisYearTotalPoints;
				d.lp = lastYearTotalPoints;
				if (mostPointGainer) {
					d.mpg = [mostPointGainer[0], mostPointGainer[1]];
				}
				const hourly = await countTimeSliceFinishes(tz, name, '%H', start, end);
				if (updateProgress()) return;
				const totalRaces = hourly.reduce((sum, [num, _]) => sum + num, 0);
				const hourRange = [
					[0, 3, 'Midnight', 0],
					[4, 7, 'Dawn', 0],
					[9, 12, 'Morning', 0],
					[13, 16, 'Afternoon', 0],
					[17, 20, 'Evening', 0],
					[21, 24, 'Night', 0]
				] as [number, number, string, number][];
				for (const hour of hourly) {
					const range = hourRange.find(
						(range) => range[0] <= parseInt(hour[1]) && parseInt(hour[1]) <= range[1]
					);
					if (range) {
						range[3] += hour[0];
					}
				}
				hourRange.sort((a, b) => b[3] - a[3]);
				const mostHourlyRaces = hourRange[0];

				d.tr = totalRaces;
				d.mhr = [mostHourlyRaces[2], mostHourlyRaces[3]];
				const monthly = await countTimeSliceFinishes(tz, name, '%m', start, end);
				if (updateProgress()) return;
				const monthRange = [
					[1, 3, 'First Quarter', 0],
					[4, 6, 'Second Quarter', 0],
					[7, 9, 'Third Quarter', 0],
					[10, 12, 'Fourth Quarter', 0]
				] as [number, number, string, number][];
				for (const month of monthly) {
					const range = monthRange.find(
						(range) => range[0] <= parseInt(month[1]) && parseInt(month[1]) <= range[1]
					);
					if (range) {
						range[3] += month[0];
					}
				}
				monthRange.sort((a, b) => b[3] - a[3]);
				const mostMonthlyRaces = monthRange[0];

				d.mmr = mostMonthlyRaces;
				d.lnf = (await findLateNightFinishedRace(tz, name, start, end))[0];
				if (updateProgress()) return;
				const mapFinishesThisYear = (await findServerFinishCount(tz, name, start, end)).sort(
					(a, b) => b[2] - a[2]
				);
				if (updateProgress()) return;
				const totalFinishes = mapFinishesThisYear.reduce(
					(sum, [server, total, finishes]) => {
						if (server.toLowerCase() == 'fun') return sum;
						sum[0] += total;
						sum[1] += finishes;
						return sum;
					},
					[0, 0] as [number, number]
				);
				d.ymf = totalFinishes;
				d.ymfs = mapFinishesThisYear[0];
				const serverFinishes = await findServerFinishes(tz, name, start, end);
				if (updateProgress()) return;
				const sortedServerFinishes = serverFinishes.sort((a, b) => b[1] - a[1]);
				d.mps = sortedServerFinishes[0];
				const mostFinishedMap = await findMostFinishedMap(tz, name, start, end);
				if (updateProgress()) return;
				d.mfm = mostFinishedMap[0];
				const longestFinishedTime = await findLongestTimeFinishedRace(tz, name, start, end);
				if (updateProgress()) return;
				d.lf = longestFinishedTime[0];
				const mostPlayedTeammate = await findMostPlayedTeammate(tz, name, start, end);
				if (updateProgress()) return;
				d.mpt = [mostPlayedTeammate[0], mostPlayedTeammate[1]];
				const biggestTeam = await findTeamSize(tz, name, start, end);
				if (updateProgress()) return;
				d.bt = biggestTeam[0];
				const nearestReleaseRecord = await findNearestReleaseRecord(tz, name, start, end);
				if (updateProgress()) return;
				d.nrr = nearestReleaseRecord[0];
				const mapList = await maps.fetch();
				if (updateProgress()) return;
				const mapperMaps = mapList
					.filter((map) => {
						const releaseDate = ddnetDate(map.release);
						return releaseDate.getFullYear() == year;
					})
					.filter((map) => {
						const mappers = map.mapper
							.split(',')
							.flatMap((mapper) => mapper.split('&'))
							.map((mapper) => mapper.trim());
						return mappers.includes(name);
					})
					.map((map) => map.name);
				d.map = mapperMaps;

				// store data in db
				setYearlyData(name, year, offset, encode(d) as any);

				if (stopped) return;
				emit('data', JSON.stringify({ d }));
				lock.set(false);
			} catch (e) {
				if (stopped) return;
				emit('error', 'Unknown error');
				console.error(`Failed to generate yearly data for ${name} (${year})`);
				console.error(e);
			}
		},
		{
			stop: () => {
				stopped = true;
			}
		}
	);
};
