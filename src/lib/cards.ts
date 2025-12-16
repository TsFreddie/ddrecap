import { mapType } from './ddnet/helpers';
import {
	date,
	datetime,
	duration,
	durationFull,
	durationMinutes,
	escapeHTML,
	getPlayerSkin,
	month,
	time
} from './helpers';
import type { m as messages } from './paraglide/messages';
import type { YearlyData } from './query-engine.worker';

export interface CardTextItem {
	type: 't';
	text: string;
	rotation?: number;
	x?: number;
	t?: number;
	b?: number;
}

export interface CardBannerItem {
	type: 'b';
	bg: string;
	color?: string;
	text: string;
	rotation?: number;
	x?: number;
	t?: number;
	b?: number;
}

export type CardItem = CardTextItem | CardBannerItem;

export interface CardData {
	titles?: { bg: string; color: string; text: string }[];
	content?: CardItem[];
	w?: number;
	h?: number;
	l?: number;
	t?: number;
	r?: number;
	b?: number;
	background?: string;
	mapper?: string;
	format?: string;
	leftTeeTop?: number;
	leftTeeSkin?: { n: string; b?: number; f?: number } | null;
	rightTeeTop?: number;
	rightTeeSkin?: { n: string; b?: number; f?: number } | null;
}

export const generateCards = async (
	maps: {
		name: string;
		thumbnail: string;
		type: string;
		points: number;
		difficulty: number;
		mapper: string;
		release: string;
		width: number;
		height: number;
		tiles: string[];
	}[],
	data: {
		tz: string;
		year: number;
		skin: { n: string; b?: number; f?: number };
	},
	d: Partial<YearlyData>,
	m: typeof messages,
	locale: string
) => {
	const getMapper = (name: string) => maps?.find((map) => map.name == name)?.mapper || '不详';
	const mapHasBonus = (name: string) =>
		maps?.find((map) => map.name == name)?.tiles.includes('BONUS');
	const bgMap = (name: string) =>
		maps?.find((map) => map.name == name)?.thumbnail || '/assets/yearly/bif.png';

	const tz = data.tz;

	const cards: CardData[] = [];
	const allTitles: { bg: string; color: string; text: string }[] = [];

	if (d.tp && d.lp != null && d.tp - d.lp > 0) {
		let firstWord;
		let enderLevel = 1;
		const titles: { bg: string; color: string; text: string }[] = [];
		if (d.lp == 0) {
			titles.push({ bg: '#ffba08', color: '#000', text: m.title_new_beginning() });
		}

		if (d.tp >= 10000) {
			firstWord = m.card_points_word_10000();
			titles.push({ bg: '#ffba08', color: '#000', text: m.title_points_30000() });
			enderLevel = 3;
		} else if (d.tp >= 3000) {
			firstWord = m.card_points_word_3000();
			enderLevel = 2;
		} else {
			firstWord = m.card_points_word();
			enderLevel = 1;
		}

		const delta = d.tp - d.lp;
		let verse_a;
		if (delta >= 5000) {
			verse_a = m.card_points_verse_a_5000();
			enderLevel = Math.max(enderLevel, 3);
			titles.push({ bg: '#dc2f02', color: '#fff', text: m.title_full_throttle() });
		} else if (delta >= 1000) {
			verse_a = m.card_points_verse_a_1000();
			enderLevel = Math.max(enderLevel, 2);
		} else {
			verse_a = m.card_points_verse_a();
			enderLevel = Math.max(enderLevel, 1);
		}

		let verse_b = '';
		if (enderLevel == 3) {
			verse_b = m.card_points_verse_b_3();
		} else if (enderLevel == 2) {
			verse_b = m.card_points_verse_b_2();
		} else {
			verse_b = m.card_points_verse_b();
		}

		// 今年分数
		allTitles.push(...titles);
		if (d.lp == 0) {
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: m.card_points_verse_new({ year: data.year, word: firstWord })
					},
					{ type: 'b', bg: '#fdd300', color: '#000', text: `${d.tp - d.lp} pts`, rotation: 4 },
					{
						type: 't',
						text: `${verse_b}`
					}
				],
				background: '/assets/yearly/sb.png',
				leftTeeTop: 5,
				leftTeeSkin: data.skin,
				mapper: 'SKYBOW by Exotix'
			});
		} else {
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: m.card_points_verse({ year: data.year, word: firstWord, points: d.tp })
					},
					{
						type: 't',
						text: `${verse_a}`
					},
					{ type: 'b', bg: '#fdd300', color: '#000', text: `${d.tp - d.lp} pts`, rotation: 4 },
					{
						type: 't',
						text: `${verse_b}`
					}
				],
				background: '/assets/yearly/ssu.png',
				leftTeeTop: 5,
				leftTeeSkin: data.skin,
				mapper: 'Sunny Side Up by Ravie'
			});
		}
	} else if (d.tp === 0) {
		const titles = [{ bg: '#ffba08', color: '#000', text: m.title_new_beginning() }];
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_no_points_verse_1({ year: data.year })
				},
				{
					type: 't',
					text: m.card_no_points_verse_2()
				}
			],
			background: '/assets/yearly/lf.png',
			mapper: 'Lavender Forest by Pipou'
		});
	} else if (d.tp != null) {
		const titles = [{ bg: '#b7b7a4', color: '#000', text: m.title_returning_voyage() }];
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_returning_voyage_verse_1({ year: data.year, points: d.tp })
				},
				{
					type: 't',
					text: m.card_returning_voyage_verse_2()
				},
				{
					type: 't',
					text: m.card_returning_voyage_verse_3()
				},
				{
					type: 't',
					text: m.card_returning_voyage_verse_4()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: m.card_returning_voyage_verse_5(),
					rotation: -4
				}
			],
			background: '/assets/yearly/lf.png',
			mapper: 'Lavender Forest by Pipou'
		});
	}

	if (d.ff && d.ff[0] && d.ff[1]) {
		// 首次记录
		const titles = [];

		const veteranYears = Math.floor(d.ff[2] / 31557600 / 5) * 5;
		if (veteranYears >= 5) {
			titles.push({ bg: '#ffba08', color: '#000', text: m.title_veteran({ years: veteranYears }) });
		}

		let years = (d.ff[2] / 31557600).toFixed(1);
		if (years.endsWith('.0')) {
			years = years.slice(0, -2);
		}

		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_first_finish_verse_1()
				},
				{
					type: 'b',
					text: datetime(new Date(d.ff[1] * 1000), tz, locale),
					bg: '#fdd300',
					color: '#000',
					rotation: -4
				},
				{
					type: 't',
					text: m.card_first_finish_verse_2({ map: d.ff[0] })
				},
				{
					type: 't',
					text: m.card_first_finish_verse_3()
				},
				{
					type: 'b',
					text: m.unit_years({ count: years }),
					bg: '#fdd300',
					color: '#000',
					rotation: 4
				}
			],
			background: '/assets/yearly/r.png',
			mapper: 'Romantic by Wartoz & ɳ0vą'
		});
	}

	if (d.mpg) {
		// 分数成就
		const titles = [];
		if (d.mpg[1] >= 34) {
			titles.push({ bg: '#a8dadc', color: '#000', text: m.title_peak_performer() });
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: m.card_peak_performer_verse_1()
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${escapeHTML(d.mpg[0])}`,
						rotation: -12,
						x: -50
					},
					{
						type: 't',
						text: m.card_peak_performer_verse_2(),
						t: -3,
						b: -3,
						rotation: -12
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${d.mpg[1]} pts`,
						rotation: -12,
						x: 50
					},
					{
						type: 't',
						text: m.card_peak_performer_verse_3()
					},
					{
						type: 't',
						text: m.card_peak_performer_verse_4()
					}
				],
				background: bgMap(d.mpg[0]),
				mapper: `${d.mpg[0]} by ${getMapper(d.mpg[0])}`
			});
		} else {
			if (d.mpg[1] >= 18)
				titles.push({ bg: '#f1faee', color: '#000', text: m.title_steady_progress() });
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: m.card_steady_progress_verse_1()
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${escapeHTML(d.mpg[0])}`,
						rotation: -12,
						x: -50
					},
					{
						type: 't',
						text: m.card_steady_progress_verse_2(),
						t: -3,
						b: -3,
						rotation: -12
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${d.mpg[1]} pts`,
						rotation: -12,
						x: 50
					},
					{
						type: 't',
						text: m.card_steady_progress_verse_3()
					},
					{
						type: 't',
						text: m.card_steady_progress_verse_4()
					}
				],
				background: bgMap(d.mpg[0]),
				mapper: `${d.mpg[0]} by ${getMapper(d.mpg[0])}`
			});
		}
	}

	if (d.tr && d.mhr && d.mhr[1] > 0) {
		// 常玩时间
		const titles = [];
		if (d.mhr[0] == 'morning') {
			titles.push({ bg: '#2a9d8f', color: '#000', text: m.title_early_bird() });
		}

		if ((d.tr || 0) >= 10 && d.mhr[1] / d.tr >= 0.5) {
			titles.push({ bg: '#e5989b', color: '#000', text: m.title_clockwork() });
		}

		let bg;
		switch (d.mhr[0]) {
			case 'dawn':
			case 'morning':
				bg = {
					background: '/assets/yearly/s.png',
					mapper: 'Spoon by Ravie'
				};
				break;
			case 'afternoon':
			case 'evening':
				bg = {
					background: '/assets/yearly/w.png',
					mapper: 'willow by louis'
				};
				break;
			default:
				bg = {
					background: '/assets/yearly/sp.png',
					mapper: 'Starlit Peaks by ♂S1mple♂'
				};
		}

		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_finishes_verse_1()
				},
				{
					type: 'b',
					text: m.unit_times({ count: d.tr }),
					bg: '#fdd300',
					color: '#000',
					rotation: -4,
					x: -5
				},
				{
					type: 't',
					text: m.card_finishes_verse_2({ count: d.mhr[1] })
				},
				{
					type: 'b',
					text: m.card_finishes_verse_2_period({ period: d.mhr[0] }),
					bg: '#fdd300',
					color: '#000',
					rotation: 4,
					x: 5
				},
				{
					type: 't',
					text: m.card_finishes_verse_3()
				}
			],
			...bg
		});
	}

	if (d.tr && d.mmr && d.mmr[1] > 0) {
		let bg;
		if (d.mmr[0] >= 1 && d.mmr[0] < 4) {
			bg = {
				background: '/assets/yearly/bif.png',
				mapper: 'Back in Festivity by Silex & Pipou'
			};
		} else if (d.mmr[0] >= 4 && d.mmr[0] < 7) {
			bg = {
				background: '/assets/yearly/p2.png',
				mapper: 'powerless2 by spiritdote'
			};
		} else if (d.mmr[0] >= 7 && d.mmr[0] < 10) {
			bg = {
				background: '/assets/yearly/h2.png',
				mapper: 'Holidays 2 by Destoros'
			};
		} else {
			bg = {
				background: '/assets/yearly/lt.png',
				mapper: 'Lonely Travel by QuiX'
			};
		}

		const titles = [];
		let prePhrase = false;
		if (d.tr >= 10 && d.mmr[1] / d.tr >= 3 / 12) {
			titles.push({ bg: '#e07a5f', color: '#000', text: m.title_monthly() });
			prePhrase = true;
		}

		allTitles.push(...titles);

		// 常来季度
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_monthly_verse_1({ prePhrase: prePhrase })
				},
				{ type: 'b', bg: '#fdd300', color: '#000', text: month(d.mmr[0], locale), rotation: 5 },
				{
					type: 't',
					text: m.card_monthly_verse_2({
						percent: Math.ceil((d.mmr[1] / d.tr) * 100).toFixed(0) + '%'
					})
				}
			],
			...bg
		});
	}

	if (d.rt) {
		// 过图时间
		const titles = [];
		if ((d.tt || d.rt) >= 365 * 24 * 60 * 60) {
			titles.push({ bg: '#85BDA6', color: '#000', text: m.title_shared_name() });
		}

		if ((d.tt || d.rt) >= 900 * 3600) {
			titles.push({ bg: '#3E885B', color: '#fff', text: m.title_fulltime_player() });
		}

		if (d.tt && d.tt < d.rt * 0.5) {
			titles.push({ bg: '#BEDCFE', color: '#000', text: m.title_runtime_error() });
		}

		const card: (typeof cards)[0] = {
			titles: titles,
			content: [
				{
					type: 't',
					text: m.card_runtime_verse_1()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `<div style="font-size: 0.75em">${durationFull(d.rt, locale, m)}</div>`
				}
			],
			background: '/assets/yearly/wr.png',
			mapper: 'Withered Rose by louis'
		};

		if (d.tt) {
			card.content!.push({
				type: 't',
				text: m.card_runtime_verse_2({ duration: durationFull(d.tt, locale, m) })
			});

			if (d.tt < d.rt * 0.5) {
				card.content!.push({
					type: 't',
					text: m.card_runtime_verse_weird()
				});
			}
		}

		cards.push(card);
		allTitles.push(...titles);
	}

	if (d.lnf) {
		// 夜猫子
		const dateTime = new Date(d.lnf[2] * 1000);
		const titles = [];

		if (dateTime.getHours() >= 2 || d.lnf[1] >= 2 * 60 * 60) {
			titles.push({ bg: '#14213d', color: '#fff', text: m.title_night_owl() });
		}

		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_night_owl_verse_1({ date: date(dateTime, tz, locale) })
				},
				{
					type: 't',
					text: m.card_night_owl_verse_2({
						time: duration(d.lnf[1], locale, m),
						map: escapeHTML(d.lnf[0])
					})
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${time(dateTime, tz, locale)}`,
					rotation: -4
				},
				{
					type: 't',
					text: m.card_night_owl_verse_3()
				},
				{
					type: 't',
					text: m.card_night_owl_verse_4()
				}
			],
			background: bgMap(d.lnf[0]),
			mapper: `${d.lnf[0]} by ${getMapper(d.lnf[0])}`
		});
	}

	if (d.ymf && d.ymf[1] > 0) {
		// 新潮追随者
		const titles = [];
		if (d.ymf[1] >= 80) {
			titles.push({ bg: '#a0c4ff', color: '#000', text: m.title_map_master() });
		} else if (d.ymf[1] >= 60) {
			titles.push({ bg: '#caffbf', color: '#000', text: m.title_path_pioneer() });
		} else if (d.ymf[1] >= 40) {
			titles.push({ bg: '#ffd6a5', color: '#000', text: m.title_map_explorer() });
		}
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_new_map_verse_1({
						total: d.ymf[0],
						completed: d.ymf[1]
					})
				},
				{
					type: 't',
					text: m.card_new_map_verse_2()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${Math.round((d.ymf[1] / d.ymf[0]) * 100)}%`,
					rotation: -4
				}
			],
			background: '/assets/yearly/p9.png',
			mapper: 'Planet 9 by Silex'
		});

		if (d.ymf[3] > 1) {
			cards[cards.length - 1].content!.push(
				{
					type: 't',
					text: m.card_new_map_verse_3()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: d.ymf[2],
					rotation: 2
				},
				{
					type: 't',
					text: m.card_new_map_verse_4({ count: d.ymf[3] })
				}
			);
			cards[cards.length - 1].background = bgMap(d.ymf[2]);
			cards[cards.length - 1].mapper = `${d.ymf[2]} by ${getMapper(d.ymf[2])}`;
		}
	}

	if (d.nrr && d.nrr[1] < 24 * 60 * 60) {
		// 离发布最近完成
		const titles = [];
		if (d.nrr[1] < 2 * 60 * 60) {
			titles.push({ bg: '#3f37c9', color: '#fff', text: m.title_speed_demon() });
		}
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_speed_demon_verse_1({ map: escapeHTML(d.nrr[0]) })
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: durationMinutes(d.nrr[1], locale, m),
					rotation: -4
				},
				{
					type: 't',
					text: m.card_speed_demon_verse_2()
				},
				{
					type: 't',
					text:
						d.nrr[1] >= 6 * 60 * 60 ? m.card_speed_demon_verse_3b() : m.card_speed_demon_verse_3a()
				}
			],
			background: bgMap(d.nrr[0]),
			mapper: `${d.nrr[0]} by ${getMapper(d.nrr[0])}`
		});
	}

	if (d.mps && d.mps[1] > 0) {
		const titles = [];
		const type = d.mps[0].toLowerCase();
		let bg;

		if (type == 'novice') {
			bg = {
				background: '/assets/yearly/t.png',
				mapper: 'Teeasy by Tridemy & Cøke'
			};
		} else if (type == 'moderate') {
			bg = {
				background: '/assets/yearly/cs.png',
				mapper: 'Cyber Space by Kaniosek'
			};
		} else if (type == 'brutal') {
			bg = {
				background: '/assets/yearly/gt.png',
				mapper: 'GalacTees by Kaniosek'
			};
		} else if (type == 'insane') {
			bg = {
				background: '/assets/yearly/c.png',
				mapper: 'Catharsis by Doshik'
			};
		} else if (type == 'dummy') {
			bg = {
				background: '/assets/yearly/q.png',
				mapper: 'quon by yo bitch'
			};
		} else if (type == 'solo') {
			bg = {
				background: '/assets/yearly/a.png',
				mapper: 'Amethyst by ♂S1mple♂'
			};
		} else if (type.startsWith('ddmax')) {
			bg = {
				background: '/assets/yearly/nj.png',
				mapper: 'Night Jungle by JeanneDark & Knight :3'
			};
		} else if (type == 'oldschool') {
			bg = {
				background: '/assets/yearly/sr.png',
				mapper: 'Sunrise by geroy231 & Father'
			};
		} else if (type == 'race') {
			bg = {
				background: '/assets/yearly/g.png',
				mapper: 'Grenadium by texnonik'
			};
		} else {
			bg = {
				background: '/assets/yearly/qd.png',
				mapper: 'Quickdraw by FJP'
			};
		}

		if (d.mps[1] >= 20) {
			if (type == 'novice') {
				titles.push({ bg: '#10002b', color: '#fff', text: m.title_casual_enjoyer() });
			} else if (type == 'moderate') {
				titles.push({ bg: '#240046', color: '#fff', text: m.title_challange_solver() });
			} else if (type == 'brutal') {
				titles.push({ bg: '#3c096c', color: '#fff', text: m.title_professional_player() });
			} else if (type == 'insane') {
				titles.push({ bg: '#5a189a', color: '#fff', text: m.title_amazingly_insane() });
			} else if (type == 'dummy') {
				titles.push({ bg: '#6f1d1b', color: '#fff', text: m.title_combined_mind() });
			} else if (type == 'solo') {
				titles.push({ bg: '#bb9457', color: '#000', text: m.title_lone_wolf() });
			} else if (type.startsWith('ddmax')) {
				titles.push({ bg: '#432818', color: '#fff', text: m.title_ddmax_enjoyer() });
			} else if (type == 'oldschool') {
				titles.push({ bg: '#99582a', color: '#000', text: m.title_oldschool_enjoyer() });
			} else if (type == 'race') {
				titles.push({ bg: '#ffe6a7', color: '#000', text: m.title_racer() });
			}
		}

		if (d.mps[1] >= 10 && type == 'fun') {
			titles.push({ bg: '#ffbf69', color: '#000', text: m.title_true_player() });
		}

		allTitles.push(...titles);
		if (type == 'fun') {
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: m.card_map_type_verse_1()
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${mapType(d.mps[0])}`,
						rotation: 4
					},
					{
						type: 't',
						text: m.card_map_type_verse_fun()
					}
				],
				...bg
			});
		} else {
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: m.card_map_type_verse_1()
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${mapType(d.mps[0])}`,
						rotation: 4
					},
					{
						type: 't',
						text: m.card_map_type_verse_2({ type: mapType(d.mps[0]), count: d.mps[1] })
					}
				],
				...bg
			});
		}
	}

	if (d.mfm && d.mfm[1] > 1) {
		// 通过最多的地图
		const map = d.mfm[0];

		const titles = [];
		if (map.startsWith('Kobra')) {
			titles.push({ bg: '#e0e1dd', color: '#000', text: m.title_snake_oiler() });
		} else if (map == 'LearnToPlay') {
			titles.push({ bg: '#3d5a80', color: '#fff', text: m.title_live_to_play() });
		} else if (map == 'Sunny Side Up') {
			titles.push({ bg: '#ffc300', color: '#000', text: m.title_always_sunny() });
		} else if (map == 'Tutorial') {
			titles.push({ bg: '#a7c957', color: '#000', text: m.title_live_and_learn() });
		} else if (map == 'Epix') {
			titles.push({ bg: '#89c2d9', color: '#000', text: m.title_narrow_trail() });
		} else if (map == 'Linear') {
			titles.push({ bg: '#e9edc9', color: '#000', text: m.title_solo_traveler() });
		}

		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_map_verse_1()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${escapeHTML(d.mfm[0])}`,
					rotation: -3
				},
				{
					type: 't',
					text: m.card_map_verse_2({ finishes: d.mfm[1] })
				}
			],
			background: bgMap(d.mfm[0]),
			mapper: `${d.mfm[0]} by ${getMapper(d.mfm[0])}`
		});
	}

	if (d.sfm && d.sfm[1] > 1) {
		// 通过第二多的地图
		cards.push({
			titles: [],
			content: [
				{
					type: 't',
					text: m.card_second_map_verse_1()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${escapeHTML(d.sfm[0])}`,
					rotation: -3
				},
				{
					type: 't',
					text: m.card_second_map_verse_2({ finishes: d.sfm[1] })
				}
			],
			background: bgMap(d.sfm[0]),
			mapper: `${d.sfm[0]} by ${getMapper(d.sfm[0])}`
		});
	}

	if (d.tr && d.sf && d.sf[1] > 1) {
		// 服务器完成数最多的服务器
		cards.push({
			titles: [],
			content: [
				{
					type: 't',
					text: m.card_server_verse_1()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `DDNet ${escapeHTML(d.sf[0])}`,
					rotation: -3
				},
				{
					type: 't',
					text: m.card_server_verse_2({ percent: ((d.sf[1] / d.tr) * 100).toFixed(1) + '%' })
				}
			],
			background: '/assets/yearly/bb.png',
			mapper: 'Bamboozled by StorмPʜöɴix'
		});

		if (d.sf[2]) {
			cards[cards.length - 1].content!.push({
				type: 't',
				text: m.card_server_verse_3({ servers: d.sf[2] })
			});
		}
	}

	if (d.lf && d.lf[1] > 1) {
		// 最慢的记录
		const isBonusMap = mapHasBonus(d.lf[0]);
		const dateTime = new Date(d.lf[2] * 1000);
		const titles = [];
		if (isBonusMap) {
			titles.push({ bg: '#f28482', color: '#000', text: m.title_time_wizard() });
		} else if (d.lf[1] >= 12 * 60 * 60) {
			titles.push({ bg: '#c8b6ff', color: '#000', text: m.title_afk_warrior() });
		} else if (d.lf[1] >= 4 * 60 * 60) {
			titles.push({ bg: '#ffd6ff', color: '#000', text: m.title_perseverance() });
		}
		allTitles.push(...titles);

		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_slowest_verse_1({
						date: `<span class="text-orange-400 font-semibold">${date(dateTime, tz, locale)}</span>`
					})
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: durationMinutes(d.lf[1], locale, m),
					rotation: -4
				},
				{
					type: 't',
					text: m.card_slowest_verse_2({
						map: `<span class="font-semibold text-orange-400">${escapeHTML(d.lf[0])}</span>`
					})
				},
				{
					type: 't',
					text: m.card_slowest_verse_3()
				},
				{
					type: 't',
					text: m.card_slowest_verse_4(),
					t: -2,
					b: -2
				},
				{
					type: 't',
					text: isBonusMap ? m.card_slowest_verse_5_bonus() : m.card_slowest_verse_5_regular()
				}
			],
			background: bgMap(d.lf[0]),
			mapper: `${d.lf[0]} by ${getMapper(d.lf[0])}`
		});
	}

	if (d.fw && d.fw[1] > 2) {
		// 连续过图
		const titles = [];
		if (d.fw[1] > 10) {
			titles.push({ bg: '#3E2F5B', color: '#fff', text: m.title_speedrunner() });
		}
		allTitles.push(...titles);

		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_speedrunner_verse_1({
						date: datetime(new Date(d.fw[0] * 1000), tz, locale)
					})
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: m.unit_maps({ count: d.fw[1] }),
					rotation: -4
				},
				{
					type: 't',
					text: m.card_speedrunner_verse_2()
				},
				{
					type: 't',
					text: `<div class="opacity-70" style="font-size:0.8em">${escapeHTML(d.fw[2])}</div>`
				}
			],
			background: '/assets/yearly/br.png',
			mapper: 'Brassrun by Kaniosek'
		});
	}

	if (d.bi && d.bi[2] >= 1) {
		// 单次最大提升
		const titles: any[] = [];
		allTitles.push(...titles);

		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_biggest_improvement_verse_1({
						date: datetime(new Date(d.bi[3] * 1000), tz, locale)
					})
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${d.bi[0]}<br><div style="font-size: 0.75em">${duration(d.bi[1], locale, m)}</div>`,
					rotation: 1
				},
				{
					type: 't',
					text: m.card_biggest_improvement_verse_2({
						date: datetime(new Date(d.bi[4] * 1000), tz, locale),
						time: duration(d.bi[1] + d.bi[2], locale, m)
					})
				},
				{
					type: 't',
					text: m.card_biggest_improvement_verse_3()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: Math.round((d.bi[2] / (d.bi[1] + d.bi[2])) * 1000) / 10 + '%',
					rotation: -3
				}
			],
			background: '/assets/yearly/nn.png',
			mapper: 'Not Novice by wee & Ybivawka~'
		});
	}

	if (d.mpt && d.mpt[0]) {
		// 最常玩队友
		const titles = [];
		if (d.mpt[0][1] >= 100) {
			titles.push({ bg: '#2ec4b6', color: '#000', text: m.title_unstoppable_duo() });
		} else if (d.mpt[0][1] >= 50) {
			titles.push({ bg: '#00509d', color: '#fff', text: m.title_inseparable_team() });
		} else if (d.mpt[0][1] >= 20) {
			titles.push({ bg: '#00296b', color: '#fff', text: m.title_brotherly_bond() });
		}
		allTitles.push(...titles);
		if (d.mpt[1]) {
			const leftTeeSkin = await getPlayerSkin(d.mpt[0][0]);
			const rightTeeSkin = await getPlayerSkin(d.mpt[1][0]);

			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: m.card_team_verse_1()
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${escapeHTML(d.mpt[0][0])}`,
						rotation: -4
					},
					{
						type: 't',
						text: m.card_team_verse_2({ count: d.mpt[0][1] })
					},
					{
						type: 't',
						text: m.card_team_verse_3()
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${escapeHTML(d.mpt[1][0])}`,
						rotation: 4
					},
					{
						type: 't',
						text: m.card_team_verse_4({ count: d.mpt[1][1] })
					}
				],
				leftTeeSkin,
				leftTeeTop: 8,
				rightTeeSkin,
				rightTeeTop: 55,
				background: '/assets/yearly/wx.png',
				mapper: 'weixun by pinfandsj'
			});
		} else {
			const rightTeeSkin = await getPlayerSkin(d.mpt[0][0]);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: m.card_team_verse_1()
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${escapeHTML(d.mpt[0][0])}`,
						rotation: -4
					},
					{
						type: 't',
						text: m.card_team_verse_2({ count: d.mpt[0][1] })
					}
				],
				background: '/assets/yearly/wx.png',
				mapper: 'weixun by pinfandsj',
				rightTeeSkin,
				rightTeeTop: 20
			});
		}
	}

	if (d.bt && d.bt[0] > 4) {
		// 最大团队
		const titles = [];
		if (d.bt[0] >= 8) {
			titles.push({ bg: '#bee9e8', color: '#000', text: m.title_tee_army() });
		}
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_stack_verse_1({ count: d.bt[0] - 1 })
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: m.card_stack_verse_2({ count: d.bt[0] }),
					rotation: -4
				},
				{
					type: 't',
					text: m.card_stack_verse_3({
						map: `<span class="font-semibold text-orange-400">${escapeHTML(d.bt[1])}</span>`,
						date: date(new Date(d.bt[3] * 1000), tz, locale)
					})
				},
				{
					type: 't',
					text: m.card_stack_verse_4({ members: escapeHTML(d.bt[2]) })
				}
			],
			background: bgMap(d.bt[1]),
			mapper: `${d.bt[1]} by ${getMapper(d.bt[1])}`
		});
	}

	if (d.map && d.map.length > 0) {
		// 地图作者
		const titles = [{ bg: '#333533', color: '#fff', text: m.title_level_designer() }];
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: m.card_level_designer_verse_1()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: m.unit_maps({ count: d.map.length }),
					rotation: -4
				},
				{
					type: 't',
					text: m.card_level_designer_verse_2({ maps: escapeHTML(d.map.join(', ')) })
				},
				{
					type: 't',
					text: m.card_level_designer_verse_3()
				}
			],
			background: bgMap(d.map[0]),
			mapper: `${d.map[0]} by ${getMapper(d.map[0])}`
		});
	}

	// 新年快乐
	cards.push({
		content: [
			{
				type: 'b',
				bg: '#A00F2A',
				color: '#fff',
				text: m.page_happy_new_year(),
				rotation: 0
			}
		],
		t: 80,
		l: 50,
		b: 5,
		r: 5,
		format: 'no-blur',
		background: '/assets/yearly/year.png'
	});

	// 分享
	cards.push({
		format: 'share',
		background: '/assets/yearly/end.png'
	});

	if (allTitles.length == 0) {
		allTitles.push({ bg: '#8338ec', color: '#fff', text: m.title_unnamed_hero() });
	}

	return {
		cards,
		titles: allTitles
	};
};
