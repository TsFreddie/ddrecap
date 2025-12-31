# DDRecap

This is a standalone sveltekit app that generates a recap for a DDNet player, extracted directly from the chinese version.

Designed to be run on [Bun](https://bun.sh/).

> DDRecap (DDNet年度总结) 已从 teeworlds.cn 项目中剔除并单独立项并支持多语言与多时区

The 2025 version of the project is now mostly self-contained, the only external service dependencies are:

- [ddstats.tw](https://ddstats.tw/) - used to retrive playtime tracking for one card.
- [teeworlds.cn](https://teeworlds.cn/) - for skin tracking.

All other data is extracted from the official public database.

The app will download the entire history of a player, import them to a wasm version of sqlite, then query the player data in-browser. This allows the host database to be smaller due to fewer indexes.

### TODO for 2026:

- [ ] Exclude BONUS maps in race time `d.rt` data.
- [ ] Fix badge colors:
  - Running man
  - To the moon
  - Praise the sun
