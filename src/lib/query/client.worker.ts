import sql from 'sql.js';
import { query } from './engine';

onmessage = async (e) => {
	const SQL = await sql({
		locateFile: (file) => `/assets/${file}`
	});

	const { maps, name, year, tz, dbTime } = e.data;
	const result = await query(SQL.Database, maps, name, year, tz, dbTime, (progress) => {
		postMessage({ type: 'progress', progress });
	});
	postMessage({ type: 'result', result });
};
