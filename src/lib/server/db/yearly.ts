import { sqlite } from '../sqlite';

// yearly table
sqlite
	.query(
		'CREATE TABLE IF NOT EXISTS yearly (name VARCHAR(255) PRIMARY KEY, year INTEGER, offset INTEGER, data BLOB)'
	)
	.run();

// indexes
sqlite
	.query('CREATE INDEX IF NOT EXISTS idx_yearly_name_offset_year ON yearly (name, year, offset);')
	.run();

export const getYearlyData = (name: string, year: number, offset: number) => {
	const result = sqlite
		.query<
			{
				data: Uint8Array;
			},
			[string, number, number]
		>('SELECT data FROM yearly WHERE name = ? AND year = ? AND offset = ?')
		.get(name, year, offset);

	if (!result) {
		return null;
	}
	return result.data;
};

export const setYearlyData = (name: string, year: number, offset: number, data: Uint8Array) => {
	const result = sqlite
		.query('INSERT OR REPLACE INTO yearly (name, year, offset, data) VALUES (?, ?, ?, ?)')
		.run(name, year, offset, data);
	return result.changes > 0;
};
