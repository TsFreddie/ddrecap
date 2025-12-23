import { unpack } from 'msgpackr';
import sql, { type BindParams } from 'sql.js';
import { DateTime, Duration } from 'luxon';
import type { MapList } from './server/fetches/maps';

const b2s = (bytes: Uint8Array) =>
	bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

export type YearlyData = {
	/** first finish [map, timestamp, years] */
	ff: [string, number, number];
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
	/** most monthly race [month (1-12), finishes] */
	mmr: [number, number];
	/** late night finish [map, time, timestamp] */
	lnf: [string, number, number];
	/** this year's map finishes [total, finished, map, finishes] */
	ymf: [number, number, string, number];
	/** most finishes servers [server, finishes] */
	mps: [string, number];
	/** most finished map [map, num] */
	mfm: [string, number];
	/** top 5 maps */
	t5m: [string, number][];
	/** longest time finished race [map, time, timestamp] */
	lf: [string, number, number];
	/** most played teammates [[name, num], [name, num]] */
	mpt: [string, number][];
	/** distinct teammates */
	dt: string[];
	/** biggest team size [teamsize, map, playerNames, timestamp] */
	bt: [number, string, string[], number];
	/** nearest release record [map, time] */
	nrr: [string, number];
	/** mapper special */
	map: string[];
	/** run time */
	rt: number;
	/** tracker time */
	tt: number;
	/** server finishes [server, finishes, other servers] */
	sf: [string, number, string];
	/** finishes window [start, count, maps] */
	fw: [number, number, string];
	/** biggest improvement [map, time, delta, timestamp, prevtimestamp] */
	bi: [string, number, number, number, number];
	/** [graph] point chart */
	graph_p: number[];
	/** [graph] type charts */
	graph_t: {
		labels: string[];
		activity: number[];
		completion: number[];
	};
	/** [graph] grantt chart for fw */
	graph_fw: {
		x: number[];
		y: number;
	}[];
	/** [graph] bar chart for lf */
	graph_lf: {
		map: string;
		time: number;
	}[];
};

export const query = async (
	maps: MapList,
	name: string,
	year: number,
	tz: string,
	dbTime: number,
	progress: (progress: number) => void
) => {
	const SQL = await sql({
		locateFile: (file) => `/assets/${file}`
	});
	progress(20);
	const playerData = await fetch(`/download/${encodeURIComponent(name)}?v=${dbTime}`);
	progress(30);
	const playerDataBuffer = await playerData.arrayBuffer();
	progress(40);
	const unpacked: {
		races: [string, number, number, string][];
		teamRaces: [Uint8Array, string, number, string, number][];
	} = unpack(playerDataBuffer as any);

	const mapLookup: Record<string, MapList[0]> = {};

	const db = new SQL.Database();
	db.run(`
		CREATE TABLE race (
			Map TEXT,
			Time REAL,
			Timestamp INTEGER,
			Server TEXT
		);
		CREATE TABLE teamrace (
			ID TEXT,
			Name TEXT,
			Map TEXT,
			Time REAL,
			Timestamp INTEGER
		);
		CREATE TABLE maps (
			Map TEXT,
			Type TEXT,
			Points INTEGER,
			Difficulty TEXT,
			Mapper TEXT,
			Timestamp INTEGER
		);

		CREATE INDEX maps_map_idx ON maps(Map);
		CREATE INDEX maps_timestamp_idx ON maps(Timestamp);
		CREATE INDEX race_map_idx ON race(Map);
		CREATE INDEX race_timestamp_idx ON race(Timestamp);
		CREATE INDEX teamrace_map_idx ON teamrace(Map);
		CREATE INDEX teamrace_timestamp_idx ON teamrace(Timestamp);
	`);

	db.run('BEGIN TRANSACTION');

	const insertRaceStmt = db.prepare(
		'INSERT INTO race (Map, Time, Timestamp, Server) VALUES (?, ?, ?, ?)'
	);
	for (const race of unpacked.races) {
		insertRaceStmt.run(race);
	}
	insertRaceStmt.free();

	const insertTeamRaceStmt = db.prepare(
		'INSERT INTO teamrace (ID, Name, Map, Time, Timestamp) VALUES (?, ?, ?, ?, ?)'
	);
	for (const teamrace of unpacked.teamRaces) {
		insertTeamRaceStmt.run([b2s(teamrace[0]), ...teamrace.slice(1)]);
	}
	insertTeamRaceStmt.free();

	const insertMapStmt = db.prepare(
		'INSERT INTO maps (Map, Type, Points, Difficulty, Mapper, Timestamp) VALUES (?, ?, ?, ?, ?, ?)'
	);
	for (const map of maps) {
		insertMapStmt.run([
			map.name,
			map.type,
			map.points,
			map.difficulty,
			map.mapper,
			DateTime.fromISO(map.release + 'Z').toSeconds() || 0
		]);
		mapLookup[map.name] = map;
	}
	insertMapStmt.free();

	db.run('COMMIT');
	progress(50);

	let queryCount = 0;
	const totalQuery = 25;

	const one = (sql: string, args: BindParams = []) => {
		const stmt = db.prepare(sql, args);
		console.log(stmt.getSQL());
		stmt.step();
		const result = stmt.get();
		stmt.free();
		queryCount++;
		progress(50 + (queryCount / (totalQuery + 2)) * 50);
		return result.length === 0 ? undefined : result;
	};

	const all = (sql: string, args: BindParams = []) => {
		const stmt = db.prepare(sql, args);
		console.log(stmt.getSQL());
		const result = [];
		while (stmt.step()) {
			result.push(stmt.get());
		}
		stmt.free();
		queryCount++;
		progress(50 + (queryCount / (totalQuery + 2)) * 50);
		return result;
	};

	const s = Duration.fromMillis(1000);
	const opt = { zone: tz };
	const previousYearStart = DateTime.fromObject({ year: year - 1 }, opt).toSeconds();
	const previousYearEnd = DateTime.fromObject({ year }, opt).minus(s).toSeconds();
	const yearStart = DateTime.fromObject({ year }, opt).toSeconds();
	const yearEnd = DateTime.fromObject({ year: year + 1 }, opt)
		.minus(s)
		.toSeconds();
	const berlinYearStart = DateTime.fromObject({ year }, { zone: 'Europe/Berlin' }).toSeconds();
	const berlinYearEnd = DateTime.fromObject({ year: year + 1 }, { zone: 'Europe/Berlin' })
		.minus(s)
		.toSeconds();

	console.log('Y-1 ST', previousYearStart);
	console.log('Y-1 ED', previousYearEnd);
	console.log('Y-0 ST', yearStart);
	console.log('Y-0 ED', yearEnd);
	console.log('Y-0 ST BERLIN', berlinYearStart);
	console.log('Y-0 ED BERLIN', berlinYearEnd);

	// format: [+-][0-9]{2}:[0-9]{2}
	const offsetMinutes = DateTime.fromSeconds(yearEnd).setZone(tz).offset;
	const offset = (() => {
		const sign = offsetMinutes <= 0 ? '-' : '+';
		const absMinutes = Math.abs(offsetMinutes);
		const hours = Math.floor(absMinutes / 60);
		const minutes = absMinutes % 60;
		const hoursStr = hours.toString().padStart(2, '0');
		const minutesStr = minutes.toString().padStart(2, '0');
		return `${sign}${hoursStr}:${minutesStr}`;
	})();

	/** First finish */
	const ff = one(
		`
SELECT Map, Timestamp, ? - Timestamp as Years FROM race WHERE race.Timestamp <= ? ORDER BY race.Timestamp ASC LIMIT 1;`,
		[yearEnd, yearEnd]
	) as [string, number, number];

	/** This year total points */
	const tp =
		(one(
			`
SELECT SUM(Points) FROM (SELECT maps.Map, maps.Points FROM maps JOIN race ON race.Map = maps.Map WHERE race.Timestamp <= ? GROUP BY maps.Map);`,
			[yearEnd]
		)?.[0] as number) || 0;

	/** Last year total points */
	const lp =
		(one(
			`
SELECT SUM(Points) FROM (SELECT maps.Map, maps.Points FROM maps JOIN race ON race.Map = maps.Map WHERE race.Timestamp <= ? GROUP BY maps.Map);`,
			[previousYearEnd]
		)?.[0] as number) || 0;

	/** Most point gainer */
	const mpg = one(
		`
WITH lastYearAllMaps AS (SELECT maps.Map, maps.Points FROM maps JOIN race ON race.Map = maps.Map WHERE race.Timestamp <= ? GROUP BY maps.Map),
thisYearMaps AS (SELECT maps.Map, maps.Points FROM maps JOIN race ON race.Map = maps.Map WHERE race.Timestamp >= ? AND race.Timestamp <= ? GROUP BY maps.Map)
SELECT ty.Map, ty.Points
FROM thisYearMaps ty
LEFT JOIN lastYearAllMaps ly ON ty.Map = ly.Map
WHERE ly.Map IS NULL ORDER BY ty.Points DESC LIMIT 1;`,
		[previousYearEnd, yearStart, yearEnd]
	) as [string, number];

	/** Total races */
	const tr = one(
		`
SELECT COUNT(*) FROM race WHERE Timestamp >= ? AND Timestamp <= ?;`,
		[yearStart, yearEnd]
	)?.[0] as number;

	/** Hourly slices */
	const slices = all(
		`
SELECT floor(Timestamp / 3600) * 3600 as Slice, COUNT(*) as Cnt FROM race WHERE Timestamp >= ? and Timestamp <= ? GROUP BY Slice ORDER BY Cnt DESC;`,
		[yearStart, yearEnd]
	) as [number, number][];

	const hourRange = [
		[0, 3, 'midnight', 0],
		[4, 7, 'dawn', 0],
		[9, 12, 'morning', 0],
		[13, 16, 'afternoon', 0],
		[17, 20, 'evening', 0],
		[21, 24, 'night', 0]
	] as [number, number, string, number][];

	const monthCount: [number, number][] = new Array(12).fill(true).map((_, i) => [i, 0]);

	for (const slice of slices) {
		const time = DateTime.fromSeconds(slice[0], { zone: tz });
		const range = hourRange.find((range) => range[0] <= time.hour && time.hour <= range[1]);
		if (range) {
			range[3] += slice[1];
		}
		monthCount[time.month - 1][1] = monthCount[time.month - 1][1] + slice[1];
	}

	hourRange.sort((a, b) => b[3] - a[3]);

	/** Most hourly range */
	const mhr = [hourRange[0][2], hourRange[0][3]] as [string, number];

	/** Most monthly range */
	monthCount.sort((a, b) => b[1] - a[1]);
	const mmr = [monthCount[0][0] + 1, monthCount[0][1]] as [number, number];

	/** Late night finishes */
	const lnf = one(
		`
SELECT r.Map, r.Time, r.Timestamp, r.rowid FROM maps m JOIN
(SELECT Map, Time, Timestamp, rowid FROM race WHERE (
	(time(Timestamp, 'unixepoch', $offset) < '05:00' AND Time <= CAST(strftime('%M', datetime(Timestamp, 'unixepoch', $offset)) as INT) * 60 + CAST(strftime('%H', datetime(Timestamp, 'unixepoch', $offset)) as INT) * 3600 + 7200) OR
	(time(Timestamp, 'unixepoch', $offset) < '08:00' AND Time <= 12 * 3600 AND Time >= CAST(strftime('%H', datetime(Timestamp, 'unixepoch', $offset)) as INT) * 1800)
	)
AND Timestamp >= $yearStart AND Timestamp <= $yearEnd) r
ON m.Map = r.Map AND m.Points > 0 ORDER BY Time desc LIMIT 1;
		`,
		{
			$yearStart: yearStart,
			$yearEnd: yearEnd,
			$offset: offset
		}
	) as [string, number, number];

	/** Map released this year most finished maps */
	const thisYearMapFinishes = all(
		`
WITH thisYearMaps AS (SELECT Type, Map FROM maps WHERE Timestamp >= ? AND Timestamp <= ? AND Points > 0)
SELECT thisYearMaps.Map, COUNT(race.Map) as Finishes
FROM race RIGHT JOIN thisYearMaps ON race.Map = thisYearMaps.Map AND Timestamp >= ? AND Timestamp <= ? GROUP BY thisYearMaps.Map ORDER BY Finishes DESC;
		`,
		[berlinYearStart, berlinYearEnd, berlinYearStart, yearEnd]
	) as [string, number][];

	/** This year map finishes */
	const ymf = [
		thisYearMapFinishes.length,
		thisYearMapFinishes.filter((data) => data[1]).length,
		thisYearMapFinishes[0]?.[0],
		thisYearMapFinishes[0]?.[1]
	] as [number, number, string, number];

	/** Nearest release record */
	const nrr = one(
		`
SELECT m.Map, r.Timestamp - m.Timestamp as TimeDiff FROM maps m JOIN race r
	ON m.Map = r.Map AND m.Timestamp >= ? AND m.Timestamp <= ?
	ORDER BY r.Timestamp - m.Timestamp ASC LIMIT 1;`,
		[yearStart, yearEnd]
	) as [string, number];

	/** Most finished map server */
	const mps = one(
		`
SELECT m.Type, COUNT(r.Map) as Finishes FROM Maps m JOIN
        (SELECT Map FROM race
        WHERE Timestamp >= ? AND Timestamp <= ?) r
    ON m.Map = r.Map GROUP BY Type ORDER BY Finishes DESC LIMIT 1;`,
		[yearStart, yearEnd]
	) as [string, number];

	/** Most finished map */
	const mfm = one(
		`
SELECT race.Map, COUNT(race.Map) as Num FROM race JOIN maps ON race.Map = maps.Map
    WHERE race.Timestamp >= ? AND race.Timestamp <= ? AND Points > 0
    GROUP BY race.Map ORDER BY Num DESC LIMIT 1;`,
		[yearStart, yearEnd]
	) as [string, number];

	/** Top 5 most finished map */
	const t5m = all(
		`
SELECT race.Map, COUNT(race.Map) as Num FROM race JOIN maps ON race.Map = maps.Map
    WHERE race.Timestamp >= ? AND race.Timestamp <= ? AND Points > 0
    GROUP BY race.Map ORDER BY Num DESC LIMIT 5;`,
		[yearStart, yearEnd]
	) as [string, number][];

	/** Longest finished races list */
	const lfList = all(
		`
SELECT r.Map, r.Time, r.Timestamp FROM maps m JOIN 
		(SELECT Map, Time, Timestamp from race
			WHERE Timestamp >= ? AND Timestamp <= ?) r
	ON m.Map = r.Map AND m.Points > 0 ORDER BY Time DESC;`,
		[yearStart, yearEnd]
	) as [string, number, number][];

	/** Longest finished race */
	const lf = lfList[0] as [string, number, number];

	const graph_lf = lfList
		.filter((m) => !mapLookup[m[0]] || !mapLookup[m[0]].tiles.includes('BONUS'))
		.slice(0, 4)
		.map((m) => {
			return { map: m[0], time: m[1] };
		});

	/** most played teammate */
	const mpt = all(
		`
WITH FilteredIDs AS (
	   SELECT DISTINCT ID
	   FROM teamrace
	   WHERE Timestamp >= ? AND Timestamp <= ?
)
SELECT t.Name, COUNT(t.ID) as Num
FROM teamrace t
JOIN FilteredIDs f ON t.ID = f.ID
WHERE t.Name != ?
GROUP BY t.Name ORDER BY Num DESC LIMIT 2;`,
		[yearStart, yearEnd, name]
	) as [string, number][];

	/** distinct teammates count */
	const dt = (
		all(
			`
SELECT DISTINCT t.Name
FROM teamrace t
WHERE Timestamp >= ? AND Timestamp <= ? AND t.Name != ?;`,
			[yearStart, yearEnd, name]
		) as [string][]
	).map((x) => x[0]);

	/** biggest team */
	const bt = one(
		`
WITH FilteredIDs AS (
    SELECT DISTINCT ID
    FROM teamrace
    WHERE Timestamp >= ? AND Timestamp <= ? AND ID != ''
)
SELECT COUNT() as Num, t.Map, GROUP_CONCAT(t.Name, '\u0003'), t.Timestamp
FROM teamrace t
JOIN FilteredIDs f ON t.ID = f.ID
GROUP BY t.ID ORDER BY Num DESC LIMIT 1;`,
		[yearStart, yearEnd]
	) as [number, string, string, number];

	/** mapper special */
	const mapperMaps = maps
		.filter((map) => {
			const releaseDate = map.release?.slice(0, 4);
			return releaseDate == year.toString();
		})
		.filter((map) => {
			const mappers = map.mapper
				.split(',')
				.flatMap((mapper) => mapper.split('&'))
				.map((mapper) => mapper.trim());
			return mappers.includes(name);
		})
		.map((map) => map.name);
	const map = mapperMaps;

	/** run time */
	const rt = one(`SELECT SUM(Time) FROM race WHERE Timestamp >= ? AND Timestamp <= ?;`, [
		yearStart,
		yearEnd
	])?.[0] as number;

	/** tracker time */
	let tt = 0;
	try {
		const tracker = (await (await fetch(`/ddstats/${encodeURIComponent(name)}`)).json()) as {
			playtime: number[];
		};
		tt = tracker.playtime.reduce((a, b) => a + b, 0);
	} catch (e) {
		console.log(e);
	}

	/** server finishes */
	const serverFinishes = all(
		`
SELECT Server, COUNT(*) as Cnt FROM race WHERE Timestamp >= ? AND Timestamp <= ? GROUP BY Server ORDER BY Cnt DESC;`,
		[yearStart, yearEnd]
	) as [string, number][];

	const sf = [
		serverFinishes[0]?.[0],
		serverFinishes[0]?.[1] || 0,
		serverFinishes
			.slice(1)
			.map(
				(s) =>
					`${s[0]}<span class="opacity-70" style="font-size:0.65em">(${((s[1] / tr) * 100).toFixed(1) + '%'})</span>`
			)
			.join(' ')
	] as [string, number, string];

	/** finishes window */
	const mostDistinctMapFinishWindow = one(
		`SELECT floor(Timestamp / 3600) * 3600 as Slice, COUNT(DISTINCT Map) as Cnt FROM race WHERE Timestamp >= ? and Timestamp <= ? GROUP BY Slice ORDER BY Cnt DESC LIMIT 1;`,
		[yearStart, yearEnd]
	) as [number, number];

	let fw: [number, number, string] | undefined;
	let graph_fw: typeof data.graph_fw;

	// find all the map finishes in the 2 hour span
	if (mostDistinctMapFinishWindow) {
		const mapFinishes = all(
			`SELECT Map, Timestamp, min(Timestamp - Time) as T FROM race WHERE timestamp >= ? AND timestamp < ? GROUP BY Map ORDER BY T`,
			[mostDistinctMapFinishWindow[0] - 1800, mostDistinctMapFinishWindow[0] + 5400]
		) as [string, number, number][];

		// sliding window find the most finishes in a 60 minute window
		let left = 0;
		let maxCount = 0;
		let bestStart = 0;
		let bestEnd = 0;

		for (let right = 0; right < mapFinishes.length; right++) {
			while (mapFinishes[right][1] - mapFinishes[left][1] > 3600) {
				left++;
			}

			const currentCount = right - left + 1;
			if (currentCount > maxCount) {
				maxCount = currentCount;
				bestStart = mapFinishes[left][1];
				bestEnd = mapFinishes[left][1] + 3600;
			}
		}

		// collect result
		const maps = mapFinishes.filter((data) => data[1] >= bestStart && data[1] < bestEnd);
		fw = [bestStart, maps.length, maps.map((m) => m[0]).join('・')];

		// re-query details about finishes during the window
		const finishDetails = all(
			`SELECT Map, Timestamp - Time as Start, Timestamp as End FROM race WHERE Timestamp >= ? AND Timestamp < ?`,
			[bestStart, bestEnd]
		) as [string, number, number][];

		const mapIds = finishDetails
			.sort((a, b) => a[1] - b[1])
			.reduce(
				(acc, [map]) => {
					if (acc[map] == null) acc[map] = Object.keys(acc).length;
					return acc;
				},
				{} as Record<string, number>
			);

		graph_fw = finishDetails
			.map(([map, start, end]) => ({
				x: [start, end],
				y: mapIds[map]
			}))
			.sort((a, b) => a.y - b.y);
	} else {
		one(`SELECT 1`);
		one(`SELECT 1`);
	}

	const bi = one(
		`
WITH YearMapTimes AS
	(SELECT race.Map, min(Time) as MinTime, race.Timestamp FROM race
   JOIN maps ON race.Map = maps.Map WHERE Points > 0 AND Type != 'Fun' AND Type != 'Event' AND race.Timestamp >= ? AND race.Timestamp <= ? GROUP BY race.Map)
SELECT race.Map, MinTime, min(race.Time) - MinTime as Delta, YearMapTimes.Timestamp, race.Timestamp as PrvTimestamp
FROM race JOIN YearMapTimes ON race.Map = YearMapTimes.Map AND race.Timestamp < YearMapTimes.Timestamp GROUP BY race.Map ORDER BY Delta / race.Time DESC LIMIT 1;		
`,
		[yearStart, yearEnd]
	) as [string, number, number, number, number];

	const data: Partial<YearlyData> = {
		ff,
		tp,
		lp,
		mpg,
		tr,
		mhr,
		mmr,
		lnf,
		ymf,
		nrr,
		mps,
		mfm,
		t5m,
		lf,
		mpt,
		dt,
		bt: bt ? [bt[0], bt[1], bt[2].split('\u0003'), bt[3]] : undefined,
		map,
		rt,
		tt,
		sf,
		fw,
		bi,
		graph_fw,
		graph_lf
	};

	const pointHistory = all(`
WITH
first_finishes AS (
    SELECT 
        MIN(race.Timestamp) as Timestamp,
        maps.Points
    FROM race
    JOIN maps ON race.Map = maps.Map
    GROUP BY race.Map
)
SELECT 
    Timestamp,
    SUM(Points) OVER (ORDER BY Timestamp) as Points
FROM first_finishes
ORDER BY Timestamp;`) as [number, number][];

	// find this years point history
	let pointer = 0;
	const pointList: number[] = [];
	const samples = 12;
	for (let sample = 0; sample <= samples; sample++) {
		const time = yearStart + (yearEnd - yearStart) * (sample / samples);
		while (pointer < pointHistory.length && pointHistory[pointer][0] < time) {
			pointer++;
		}
		const points = pointer > 0 ? pointHistory[pointer - 1][1] : 0;
		pointList.push(points);
	}
	data.graph_p = pointList;

	const mapTypeTimes = Object.fromEntries(
		(
			all(
				`SELECT Type, SUM(Time) as Time FROM race JOIN maps ON race.Map = maps.Map WHERE race.Timestamp >= ? AND race.Timestamp <= ? GROUP BY SUBSTR(Type, 1, 3);`,
				[yearStart, yearEnd]
			) as [string, number][]
		).map((t) => [t[0].split('.')[0], t[1]])
	);

	const mapCompletion = Object.fromEntries(
		(
			all(
				`SELECT Type, COUNT(DISTINCT race.Map) / CAST(COUNT(DISTINCT maps.Map) as REAL) FROM maps LEFT JOIN race ON race.Timestamp < ? AND maps.Timestamp < ? AND race.Map = maps.Map GROUP BY SUBSTR(Type, 1, 3);`,
				[yearEnd, yearEnd]
			) as [string, number][]
		).map((t) => [t[0].split('.')[0], t[1]])
	);

	const types = [
		'Oldschool',
		'DDmaX',
		'Race',
		'Novice',
		'Moderate',
		'Brutal',
		'Insane',
		'Solo',
		'Dummy'
	];

	data.graph_t = {
		labels: types,
		activity: types.map((t) => mapTypeTimes[t] || 0),
		completion: types.map((t) => mapCompletion[t] || 0)
	};

	progress(50 + ((totalQuery + 1) / (totalQuery + 2)) * 50);
	console.log('TOTAL QUERY COUNT', queryCount);

	return {
		db: db.export(),
		data: data
	};
};

onmessage = async (e) => {
	const { maps, name, year, tz, dbTime } = e.data;
	const result = await query(maps, name, year, tz, dbTime, (progress) => {
		postMessage({ type: 'progress', progress });
	});
	postMessage({ type: 'result', result });
};
