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

export function getPlayerDatabase(name: string) {
	const races = getRaceStmt.all(name);
	const teamRaces = getTeamRaceStmt.all(name);

	return {
		races: races.map(
			(r) => [r.Map, r.Time, r.Timestamp, r.Server] as [string, number, number, string]
		),
		teamRaces: teamRaces.map((r) => {
			return [Buffer.from(r.ID, 'hex').toString('base64').replace(/=+$/, ''), r.Name, r.Map, r.Time, r.Timestamp] as [
				string,
				string,
				number,
				string,
				number
			];
		})
	};
}
