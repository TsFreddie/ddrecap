import type { Chart, ChartConfiguration } from 'chart.js';
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
import { createRng, stringHash } from './pose';
import { getSkinData } from './stores/skins';
import normalSkins from '$lib/normal-skins.json';
import { queue } from './queue-pool';

export interface CardTextItem {
	type: 't';
	text: string;
	rotation?: number;
	max?: number;
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
	px?: number;
	py?: number;
	x?: number;
	t?: number;
	b?: number;
	// min-width
	minW?: number;
	// no wrap
	nr?: boolean;
}

export type CardItem = CardTextItem | CardBannerItem;
type Skin = { n: string; b?: number; f?: number };

export interface CardData {
	border?: string;
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
	leftTeeSkin?: Skin | null;
	rightTeeTop?: number;
	rightTeeSkin?: Skin | null;
	swarm?: {
		t?: number;
		r?: number;
		l?: number;
		b?: number;
		vx: number;
		vy: number;
		delay: number;
		skin: Skin;
		emote: number;
		angle: number;
		var: number;
	}[];
	chart?: ChartConfiguration;
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
		name: string;
		tz: string;
		year: number;
		skin: { n: string; b?: number; f?: number };
	},
	d: Partial<YearlyData>,
	m: typeof messages,
	locale: string,
	progress: (percent: number) => void
) => {
	const getMapper = (name: string) => maps?.find((map) => map.name == name)?.mapper || '[REDACTED]';
	const mapHasBonus = (name: string) =>
		maps?.find((map) => map.name == name)?.tiles.includes('BONUS');
	const bgMap = (name: string) =>
		maps?.find((map) => map.name == name)?.thumbnail || '/assets/yearly/bif.png';

	const mapFormat = (map: string) => {
		return `${escapeHTML(map)} <span class="text-[0.8em] text-gray-300">by <span class="font-semibold text-white">${escapeHTML(getMapper(map))}</span></span>`;
	};

	const tasks: (() => Promise<void>)[] = [];
	const runTasks = async () => {
		const totalTasks = tasks.length;
		let finished = 0;
		const prog = () => {
			finished++;
			progress(finished / totalTasks);
		};
		await Promise.all(
			tasks.map(async (task) => {
				try {
					await queue().push(task);
				} catch {}
				prog();
			})
		);
		progress(1);
	};

	const seed = stringHash(data.name);
	const rng = createRng(seed);

	const sample = (names: string[], num: number) => {
		names = [...names];
		for (let i = names.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[names[i], names[j]] = [names[j], names[i]];
		}
		return names.slice(0, num);
	};

	const generateSwarm = (names: string[], mode: 'player' | 'skin') => {
		// Generate swarm entries for each team member
		const swarmEntries: NonNullable<CardData['swarm']> = [];
		const cardW = 512;
		const cardH = 512;
		const centerX = cardW / 2;
		const centerY = cardH / 2;

		const deg2rad = Math.PI / 180;
		const delta = 1 / names.length;

		let indexes = Array.from({ length: names.length }, (_, i) => i);
		for (let i = names.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[indexes[i], indexes[j]] = [indexes[j], indexes[i]];
		}

		const delayDelta = 1.5 / (names.length - 1);

		for (let i = 0; i < names.length; i++) {
			// Random angle for this member (distribute evenly with some variance)
			const baseDeg = i * delta * 310 + 140;
			const baseAngle = (baseDeg + rng() * Math.max(delta * 310 - 8, 0)) * deg2rad;
			const angle = baseAngle;

			// Direction vector
			const dirX = Math.cos(angle);
			const dirY = Math.sin(angle);

			// Calculate corner proximity - corners are at 45°, 135°, 225°, 315°
			const normalizedAngle = ((((angle * 180) / Math.PI) % 360) + 360) % 360;
			const cornerAngles = [45, 135, 225, 315];
			const minCornerDist = Math.min(
				...cornerAngles.map((c) =>
					Math.min(Math.abs(normalizedAngle - c), 360 - Math.abs(normalizedAngle - c))
				)
			);
			const linearProximity = 1 - minCornerDist / 45;
			const cornerProximity = Math.pow(linearProximity, 8); // More concentrated near corners
			const cornerOffset = -cornerProximity;
			const edgeOffset = 1 + (rng() * 4.2 - 3.0);

			// Find intersection with card boundary using robust line-rect intersection
			const intersections: Array<{ t: number; edge: string; x: number; y: number }> = [];

			// Left edge (x = 0)
			if (Math.abs(dirX) > 0.0001) {
				const tLeft = (0 - centerX) / dirX;
				if (tLeft > 0) {
					const yLeft = centerY + tLeft * dirY;
					if (yLeft >= 0 && yLeft <= cardH) {
						intersections.push({ t: tLeft, edge: 'left', x: 0, y: yLeft });
					}
				}
			}

			// Right edge (x = cardW)
			if (Math.abs(dirX) > 0.0001) {
				const tRight = (cardW - centerX) / dirX;
				if (tRight > 0) {
					const yRight = centerY + tRight * dirY;
					if (yRight >= 0 && yRight <= cardH) {
						intersections.push({ t: tRight, edge: 'right', x: cardW, y: yRight });
					}
				}
			}

			// Top edge (y = 0)
			if (Math.abs(dirY) > 0.0001) {
				const tTop = (0 - centerY) / dirY;
				if (tTop > 0) {
					const xTop = centerX + tTop * dirX;
					if (xTop >= 0 && xTop <= cardW) {
						intersections.push({ t: tTop, edge: 'top', x: xTop, y: 0 });
					}
				}
			}

			// Bottom edge (y = cardH)
			if (Math.abs(dirY) > 0.0001) {
				const tBottom = (cardH - centerY) / dirY;
				if (tBottom > 0) {
					const xBottom = centerX + tBottom * dirX;
					if (xBottom >= 0 && xBottom <= cardW) {
						intersections.push({ t: tBottom, edge: 'bottom', x: xBottom, y: cardH });
					}
				}
			}

			// Find the closest intersection
			if (intersections.length === 0) {
				// Fallback: just don't push it
				continue;
			}

			// Sort by distance and take the closest
			intersections.sort((a, b) => a.t - b.t);
			const closest = intersections[0];

			// Position at the edge (as percentage)
			const edgeX = (closest.x / cardW) * 100;
			const edgeY = (closest.y / cardH) * 100;

			// Determine which edge and set position
			const entry: NonNullable<CardData['swarm']>[0] = {
				vx: -dirX,
				vy: -dirY,
				delay: indexes[i] * delayDelta + 0.5,
				skin: { n: 'default' },
				emote: Math.floor(rng() * 4),
				angle: (-angle * 180 + 10 * rng()) / Math.PI + 165,
				var: rng() * 10 - 5
			};

			const member = names[i];
			if (mode === 'player') {
				tasks.push(async () => {
					entry.skin = await getPlayerSkin(member, false);
				});
			} else {
				entry.skin = { n: member };
			}

			// Set position based on which edge was hit
			// For left/right edges: use t for vertical positioning
			// For top/bottom edges: use l for horizontal positioning
			if (closest.edge === 'left') {
				entry.l = -edgeOffset - cornerOffset * 1.5;
				entry.t = edgeY;
			} else if (closest.edge === 'right') {
				entry.r = -edgeOffset - cornerOffset * 1.5;
				entry.t = edgeY;
			} else if (closest.edge === 'top') {
				entry.t = -edgeOffset - cornerOffset * 3.5 - 1.0;
				entry.l = edgeX;
			} else if (closest.edge === 'bottom') {
				entry.b = -edgeOffset - cornerOffset * 3.5;
				entry.l = edgeX;
			}

			swarmEntries.push(entry);
		}

		return swarmEntries;
	};

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
				mapper: mapFormat('SKYBOW')
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
				mapper: mapFormat('Sunny Side Up')
			});
		}

		// 今年分数增长图
		if (d.graph_p && d.graph_p.length > 0) {
			let min = d.graph_p[0];
			let max = d.graph_p[d.graph_p.length - 1];

			min = Math.floor(min / 500) * 500;
			max = Math.ceil(max / 500) * 500;

			if (max - min < 1000) {
				max = min + 1000;
			}

			const steps = (max - min) / 500;
			let stepSize = 500;
			const ticksLimit = 4;
			if (steps > ticksLimit) {
				let i = ticksLimit;
				while (i >= 1) {
					if ((max - min) % i === 0) {
						stepSize = (max - min) / i;
						break;
					}
					i--;
				}
				if (i == 0) {
					stepSize = (max - min) / ticksLimit;
				}
			}

			cards.push({
				b: 80,
				content: [
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						rotation: -1,
						text: `<div class="text-[0.8em]">${m.card_chart_points({ year: data.year })}</div>`
					}
				],
				chart: {
					type: 'line',
					data: {
						labels: d.graph_p.map((_, i) => i + 1),
						datasets: [
							{
								data: d.graph_p,
								borderColor: '#fdd300',
								backgroundColor: 'rgba(253, 211, 0, 0.1)',
								fill: true,
								pointRadius: 0,
								tension: 0.2,
								borderWidth: 5,
								borderCapStyle: 'round'
							}
						]
					},
					options: {
						layout: {
							padding: {
								top: 512 * 0.2,
								bottom: 0,
								left: 0,
								right: 20
							}
						},
						plugins: {
							legend: { display: false }
						},
						scales: {
							x: {
								display: true,
								grid: { color: '#d4d4d855', drawTicks: false, tickColor: '#d4d4d855' },
								ticks: {
									color: '#0000',
									align: 'inner',
									padding: 10,
									maxRotation: 0,
									crossAlign: 'near',

									callback: function (_, index) {
										if (index === 0) return data.year - 1;
										if (index === d.graph_p!.length - 1) return data.year;
										return '';
									}
								}
							},
							y: {
								display: true,
								grid: { color: '#d4d4d855', drawTicks: false, tickColor: '#d4d4d855' },
								ticks: {
									padding: 20,
									stepSize,
									precision: 0,
									color: '#0000',
									align: 'inner'
								},
								min,
								max
							}
						}
					}
				},
				background: '/assets/yearly/ssu2.png',
				mapper: mapFormat('Slippy Slide Up')
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
			mapper: mapFormat('Lavender Forest')
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
			mapper: mapFormat('Lavender Forest')
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
					text: m.card_first_finish_verse_2({ map: escapeHTML(d.ff[0]) })
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
			mapper: mapFormat('Romantic')
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
						rotation: -6,
						x: -2
					},
					{
						type: 't',
						text: m.card_peak_performer_verse_2(),
						t: -3,
						b: -3,
						rotation: -6
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${d.mpg[1]} pts`,
						rotation: -6,
						x: 2
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
				mapper: mapFormat(d.mpg[0])
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
						rotation: -6,
						x: -2
					},
					{
						type: 't',
						text: m.card_steady_progress_verse_2(),
						t: -3,
						b: -3,
						rotation: -6
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${d.mpg[1]} pts`,
						rotation: -6,
						x: 2
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
				mapper: mapFormat(d.mpg[0])
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
					mapper: mapFormat('Spoon')
				};
				break;
			case 'afternoon':
			case 'evening':
				bg = {
					background: '/assets/yearly/w.png',
					mapper: mapFormat('willow')
				};
				break;
			default:
				bg = {
					background: '/assets/yearly/sp.png',
					mapper: mapFormat('Starlit Peaks')
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
				mapper: mapFormat('Back in Festivity')
			};
		} else if (d.mmr[0] >= 4 && d.mmr[0] < 7) {
			bg = {
				background: '/assets/yearly/p2.png',
				mapper: mapFormat('powerless2')
			};
		} else if (d.mmr[0] >= 7 && d.mmr[0] < 10) {
			bg = {
				background: '/assets/yearly/h2.png',
				mapper: mapFormat('Holidays 2')
			};
		} else {
			bg = {
				background: '/assets/yearly/lt.png',
				mapper: mapFormat('Lonely Travel')
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
			mapper: mapFormat('Withered Rose')
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
			mapper: mapFormat(d.lnf[0])
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
			mapper: mapFormat('Planet 9')
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
					text: escapeHTML(d.ymf[2]),
					rotation: 2
				},
				{
					type: 't',
					text: m.card_new_map_verse_4({ count: d.ymf[3] })
				}
			);
			cards[cards.length - 1].background = bgMap(d.ymf[2]);
			cards[cards.length - 1].mapper = mapFormat(d.ymf[2]);
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
			mapper: mapFormat(d.nrr[0])
		});
	}

	if (d.mps && d.mps[1] > 0) {
		const titles = [];
		const type = d.mps[0].toLowerCase();
		let bg;

		if (type == 'novice') {
			bg = {
				background: '/assets/yearly/t.png',
				mapper: mapFormat('Teeasy')
			};
		} else if (type == 'moderate') {
			bg = {
				background: '/assets/yearly/cs.png',
				mapper: mapFormat('Cyber Space')
			};
		} else if (type == 'brutal') {
			bg = {
				background: '/assets/yearly/gt.png',
				mapper: mapFormat('GalacTees')
			};
		} else if (type == 'insane') {
			bg = {
				background: '/assets/yearly/c.png',
				mapper: mapFormat('Catharsis')
			};
		} else if (type == 'dummy') {
			bg = {
				background: '/assets/yearly/q.png',
				mapper: mapFormat('quon')
			};
		} else if (type == 'solo') {
			bg = {
				background: '/assets/yearly/a.png',
				mapper: mapFormat('Amethyst')
			};
		} else if (type.startsWith('ddmax')) {
			bg = {
				background: '/assets/yearly/nj.png',
				mapper: mapFormat('Night Jungle')
			};
		} else if (type == 'oldschool') {
			bg = {
				background: '/assets/yearly/sr.png',
				mapper: mapFormat('Sunrise')
			};
		} else if (type == 'race') {
			bg = {
				background: '/assets/yearly/g.png',
				mapper: mapFormat('Grenadium')
			};
		} else {
			bg = {
				background: '/assets/yearly/qd.png',
				mapper: mapFormat('Quickdraw')
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

	if (d.graph_t && d.graph_t.activity.filter((t) => t > 0).length > 0) {
		// 今年模式雷达图
		const maxValue = Math.max(...d.graph_t.activity);
		const labels = d.graph_t.labels;
		const activity = d.graph_t.activity.map((t) => t / maxValue);
		const completion = d.graph_t.completion;

		cards.push({
			b: 80,
			content: [
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					rotation: 1.2,
					text: `<div class="text-[0.8em]">${m.card_chart_types({ year: data.year })}</div>`
				},
				{
					type: 'b',
					bg: '#4681e8',
					color: '#fff',
					rotation: -0.5,
					px: 3,
					py: 0.75,
					t: -1,
					x: 50,
					text: `<div class="text-[0.6em]">${m.card_chart_completion()}</div>`
				}
			],
			chart: {
				type: 'radar',
				data: {
					labels,
					datasets: [
						{
							data: activity,
							borderColor: '#fdd300',
							backgroundColor: 'rgba(253, 211, 0, 0.2)',
							borderWidth: 3,
							pointRadius: 4,
							pointBackgroundColor: '#fdd300',
							pointBorderColor: '#fdd300',
							borderCapStyle: 'round'
						},
						{
							data: completion,
							borderColor: '#60a5fa',
							backgroundColor: 'rgba(96, 165, 250, 0.2)',
							borderWidth: 3,
							pointRadius: 2,
							pointBackgroundColor: '#60a5fa',
							pointBorderColor: '#60a5fa',
							borderCapStyle: 'round'
						}
					]
				},
				options: {
					layout: {
						padding: {
							top: 512 * 0.2,
							bottom: 0,
							left: 20,
							right: 20
						}
					},
					plugins: {
						legend: { display: false }
					},
					scales: {
						r: {
							angleLines: {
								color: '#d4d4d855'
							},
							grid: {
								color: '#d4d4d855'
							},
							backgroundColor: '#0000002d',
							pointLabels: {
								color: '#0000',
								padding: 10
							},
							ticks: {
								display: false,
								stepSize: 0.25
							},
							min: 0,
							max: 1
						}
					}
				}
			},
			background: '/assets/yearly/ud.png',
			mapper: mapFormat('Until Dawn')
		});
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
			mapper: mapFormat(d.mfm[0])
		});
	}

	if (d.t5m && d.t5m.length >= 5 && d.t5m.filter((t) => t[1] > 1).length >= 3) {
		// 通过次数前五的地图
		const t5mLabels = d.t5m.map((t) => t[0]);
		const t5mData = d.t5m.map((t) => t[1]);
		const maxFinishes = Math.max(...t5mData);

		cards.push({
			b: 80,
			content: [
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					rotation: -0.43,
					text: `<div class="text-[0.8em]">${m.card_chart_top_maps({ year: data.year })}</div>`
				}
			],
			chart: {
				type: 'bar',
				data: {
					labels: t5mLabels,
					datasets: [
						{
							data: t5mData,
							borderColor: '#60a5fa',
							backgroundColor: 'rgba(96, 165, 250, 0.8)',
							borderWidth: 2,
							borderRadius: 4,
							barPercentage: 0.7,
							categoryPercentage: 0.8
						}
					]
				},
				options: {
					indexAxis: 'y',
					layout: {
						padding: {
							top: 512 * 0.2,
							bottom: 0,
							left: 0,
							right: 10
						}
					},
					plugins: {
						legend: { display: false }
					},
					scales: {
						x: {
							min: 0,
							ticks: {
								display: false,
								callback: () => ''
							},
							max: maxFinishes * 1.3
						},
						y: {
							display: true,
							grid: { display: false },
							ticks: {
								color: '#0000',
								padding: 10
							}
						}
					}
				}
			},
			background: bgMap(d.t5m[1][0]),
			mapper: mapFormat(d.t5m[1][0])
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
			mapper: mapFormat('Bamboozled')
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
			mapper: mapFormat(d.lf[0])
		});

		// Add banners for slowest finishes if there are any
		if (
			d.graph_lf &&
			d.graph_lf.length > 0 &&
			(d.graph_lf.length !== 1 || d.graph_lf[0].map !== d.lf[0])
		) {
			const content: CardItem[] = [
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					rotation: -0.5,
					text: `<div class="text-[0.8em]">${m.card_chart_slowest_finishes({ year: data.year })}</div>`
				}
			];

			// Add banners for each of the slowest finishes
			for (let i = 0; i < d.graph_lf.length; i++) {
				const item = d.graph_lf[i];
				content.push({
					type: 'b',
					bg: '#dc2626dd',
					color: '#fff',
					rotation: (rng() - 0.5) * 3,
					py: 0,
					px: 0,
					t: 1,
					b: 1,
					minW: 55,
					x: i % 2 === 1 ? rng() + 5 : -rng() - 5,
					text: `<div style="font-size: 0.9em;margin-top:-0.2em">${escapeHTML(item.map)}<br><div style="font-size: 0.75em">${duration(item.time, locale, m)}</div></div>`
				});
			}

			cards.push({
				content,
				background: '/assets/yearly/cw.png',
				mapper: mapFormat('Chill Wood')
			});
		}
	}

	if (d.fw && d.fw[1] > 2) {
		// 连续过图
		const titles = [];
		if (d.fw[1] > 10) {
			titles.push({ bg: '#3E2F5B', color: '#fff', text: m.title_speedrunner() });
		}
		allTitles.push(...titles);

		// Group bars by y value for proper Gantt display
		const uniqueYValues = d.graph_fw
			? [...new Set(d.graph_fw.map((item) => item.y))].sort((a, b) => a - b)
			: [];
		const ganttChart: ChartConfiguration | undefined =
			d.graph_fw && d.graph_fw.length > 0
				? ({
						type: 'bar',
						data: {
							labels: uniqueYValues,
							datasets: [
								{
									data: d.graph_fw.map((item) => ({
										x: [item.x[0], item.x[1]],
										y: item.y
									})) as any,
									backgroundColor: 'rgba(96, 165, 250, 0.4)',
									borderRadius: 5,
									borderSkipped: false,
									barPercentage: 0.95,
									categoryPercentage: 1
								}
							]
						},
						options: {
							indexAxis: 'y',
							skipBarDataLabels: true,
							noCustomBackground: true,
							animation: false,
							layout: {
								padding: {
									top: 0,
									bottom: 0,
									left: 0,
									right: 0
								}
							},
							plugins: {
								legend: { display: false }
							},
							scales: {
								x: {
									type: 'linear',
									display: false,
									min: Math.min(...d.graph_fw.map((item) => item.x[0])),
									max: Math.max(...d.graph_fw.map((item) => item.x[1])),
									callback: () => ''
								},
								y: {
									type: 'category',
									display: false,
									reverse: false,
									callback: () => ''
								}
							}
						}
					} as ChartConfiguration)
				: undefined;

		cards.push({
			titles,
			chart: ganttChart,
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
			mapper: mapFormat('Brassrun')
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
					text: `${escapeHTML(d.bi[0])}<br><div style="font-size: 0.75em">${duration(d.bi[1], locale, m)}</div>`,
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
			mapper: mapFormat('Not Novice')
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
			const card: CardData = {
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
				leftTeeTop: 8,
				rightTeeTop: 55,
				background: '/assets/yearly/wx.png',
				mapper: mapFormat('weixun')
			};

			const leftTeePlayer = d.mpt[0][0];
			const rightTeePlayer = d.mpt[1][0];
			tasks.push(async () => {
				card.leftTeeSkin = await getPlayerSkin(leftTeePlayer, false);
				card.rightTeeSkin = await getPlayerSkin(rightTeePlayer, false);
			});
			cards.push(card);
		} else {
			const card: CardData = {
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
				mapper: mapFormat('weixun'),
				rightTeeTop: 20
			};

			const rightTeePlayer = d.mpt[0][0];
			tasks.push(async () => {
				card.rightTeeSkin = await getPlayerSkin(rightTeePlayer, false);
			});
			cards.push();
		}
	}

	const skins = await getSkinData();

	if (d.dt && d.dt.length >= 5) {
		// 不同队友数量
		const titles = [];
		const count = d.dt.length;
		if (count >= 50) {
			titles.push({ bg: '#ff6b6b', color: '#fff', text: m.title_social_butterfly() });
		} else if (count >= 20) {
			titles.push({ bg: '#4ecdc4', color: '#000', text: m.title_team_player() });
		} else if (count >= 10) {
			titles.push({ bg: '#ffe66d', color: '#000', text: m.title_social_tee() });
		}
		allTitles.push(...titles);
		cards.push({
			titles,
			l: 6.5,
			r: 6.5,
			content: [
				{
					type: 't',
					text: m.card_distinct_teammates_verse_1()
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: m.card_distinct_teammates_verse_2({ count }),
					rotation: -4
				},
				{
					type: 't',
					text: m.card_distinct_teammates_verse_3()
				}
			],
			swarm: skins
				? generateSwarm(sample(normalSkins, Math.min(d.dt.length, 64)), 'skin')
				: undefined,
			background: '/assets/yearly/m.png',
			mapper: mapFormat('Mint')
		});
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
			l: 6.5,
			r: 6.5,
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
					text: m.card_stack_verse_4({ members: escapeHTML(d.bt[2].join(', ')) }),
					max: 30
				}
			],
			swarm: generateSwarm(d.bt[2], 'player'),
			background: bgMap(d.bt[1]),
			mapper: mapFormat(d.bt[1])
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
			mapper: mapFormat(d.map[0])
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
				rotation: 8
			}
		],
		l: 45,
		b: 80,
		format: 'no-blur',
		background:
			data.name === 'nameless tee' ? '/assets/yearly/year-b.png' : '/assets/yearly/year.png'
	});

	// 分享
	cards.push({
		format: 'share',
		background: '/assets/yearly/end.png'
	});

	if (allTitles.length == 0) {
		allTitles.push({ bg: '#8338ec', color: '#fff', text: m.title_unnamed_hero() });
	}

	await runTasks();

	return {
		cards,
		titles: allTitles
	};
};
