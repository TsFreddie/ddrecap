import { Database } from 'bun:sqlite';

const db = new Database('./cache/ddnet.sqlite');

const getRaceStmt = db.prepare<
	{
		Map: string;
		Time: number;
		Timestamp: number;
		Server: string;
	},
	[string]
>('SELECT Map, Time, Timestamp, Server FROM race WHERE Name = ?');

const getTeamRaceStmt = db.prepare<
	{
		Map: number;
		Name: string;
		Time: string;
		ID: string;
		Timestamp: number;
	},
	[string]
>(
	'SELECT t.Map, t.Name, t.Time, HEX(t.ID) as ID, t.Timestamp FROM teamrace JOIN teamrace as t ON teamrace.ID = t.ID WHERE teamrace.name = ?'
);

const getPointsStmt = db.prepare<
	{
		Points: number;
	},
	[string]
>(
	'SELECT SUM(Points) as Points FROM (SELECT Map FROM race WHERE Name = ? GROUP BY Map) r JOIN maps ON r.Map = maps.Map;'
);

const getKv = db.prepare<
	{
		Value: string;
	},
	[string]
>('SELECT Value FROM kv WHERE Key = ?');

export function getPlayerDatabase(name: string) {
	const races = getRaceStmt.all(name);
	const teamRaces = getTeamRaceStmt.all(name);

	return {
		races: races.map(
			(r) => [r.Map, r.Time, r.Timestamp, r.Server] as [string, number, number, string]
		),
		teamRaces: teamRaces.map((r) => {
			return [Buffer.from(r.ID, 'hex'), r.Name, r.Map, r.Time, r.Timestamp] as [
				Uint8Array,
				string,
				number,
				string,
				number
			];
		})
	};
}

export function getPoints(name: string) {
	return getPointsStmt.get(name)?.Points ?? null;
}

export function getDatabaseTime() {
	return parseInt(getKv.get('database_time')?.Value ?? '0');
}
