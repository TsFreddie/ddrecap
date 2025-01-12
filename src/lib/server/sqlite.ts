import { env } from '$env/dynamic/private';
import { Database } from 'bun:sqlite';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const sqlitePath = env.SQLITE_PATH || './cache/sqlite.db';
console.log(`sqlite: persistent using ${sqlitePath}`);

const dbDir = dirname(sqlitePath);
if (!existsSync(dbDir)) {
	mkdirSync(dbDir, { recursive: true });
}

export const sqlite = new Database(sqlitePath);
sqlite.query('PRAGMA journal_mode = WAL;').run();
