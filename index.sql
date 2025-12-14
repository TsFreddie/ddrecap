-- Database prepping
PRAGMA journal_mode = WAL;

-- Migrate race
CREATE TABLE
    race_new (
        Map TEXT,
        Name TEXT,
        Time REAL,
        Timestamp INTEGER,
        Server TEXT
    );

INSERT INTO
    race_new (Map, Name, Time, Timestamp, Server)
SELECT
    Map,
    Name,
    Time,
    unixepoch (Timestamp) as Timestamp,
    Server
FROM
    race;

DROP TABLE race;

ALTER TABLE race_new
RENAME TO race;

-- Migrate teamrace
CREATE TABLE
    teamrace_new (
        Map TEXT,
        Name TEXT,
        Time REAL,
        ID BLOB,
        Timestamp INTEGER
    );

INSERT INTO
    teamrace_new (Map, Name, Time, ID, Timestamp)
SELECT
    Map,
    Name,
    Time,
    ID,
    unixepoch (Timestamp) as Timestamp
FROM
    teamrace;

DROP TABLE teamrace;

ALTER TABLE teamrace_new
RENAME TO teamrace;

-- Migrate maps
CREATE TABLE
    maps_new (
        Map TEXT,
        Server TEXT,
        Points INTEGER,
        Stars INTEGER,
        Mapper TEXT,
        Timestamp INTEGER
    );

INSERT INTO
    maps_new (Map, Server, Points, Stars, Mapper, Timestamp)
SELECT
    Map,
    Server,
    Points,
    Stars,
    Mapper,
    unixepoch (Timestamp) as Timestamp
FROM
    maps;

DROP TABLE maps;

ALTER TABLE maps_new
RENAME TO maps;

-- Drop map info table
DROP TABLE mapinfo;

-- Create index for race
CREATE INDEX race_name_idx ON race (Name);

-- Create index for teamrace
CREATE INDEX teamrace_name_id_idx ON teamrace (Name, ID);

CREATE INDEX teamrace_id_idx ON teamrace (ID);

-- Create index for maps
CREATE INDEX maps_map_idx ON maps (Map);

-- Cache latest record
CREATE TABLE
    kv (Key TEXT PRIMARY KEY, Value TEXT);

INSERT INTO
    kv (Key, Value)
SELECT
    'database_time' as Key,
    Timestamp as Value
FROM
    race
ORDER BY
    Timestamp DESC
LIMIT
    1;

-- Compact the database
VACUUM;