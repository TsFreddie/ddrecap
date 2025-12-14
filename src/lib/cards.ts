import { mapType } from './ddnet/helpers';
import { escapeHTML, getPlayerSkin, month, secondsToTime } from './helpers';
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
	m: typeof messages
) => {
	const getMapper = (name: string) => maps?.find((map) => map.name == name)?.mapper || '不详';
	const mapHasBonus = (name: string) =>
		maps?.find((map) => map.name == name)?.tiles.includes('BONUS');
	const bgMap = (name: string) =>
		maps?.find((map) => map.name == name)?.thumbnail || '/assets/yearly/bif.png';

	// TODO: better locale
	const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeZone: data.tz
	});
	const timeFormat = new Intl.DateTimeFormat(locale, {
		timeStyle: 'short',
		timeZone: data.tz
	});
	const date = (date: Date) => dateFormat.format(date);
	const time = (date: Date) => timeFormat.format(date);

	const cards: CardData[] = [];
	const allTitles: { bg: string; color: string; text: string }[] = [];

	if (d.tp && d.lp != null && d.tp - d.lp > 0) {
		let firstWord;
		let enderLevel = 1;
		const titles: { bg: string; color: string; text: string }[] = [];
		if (d.tp >= 10000) {
			firstWord = 'copious';
			titles.push({ bg: '#ffba08', color: '#000', text: 'Completionist' });
			enderLevel = 3;
		} else if (d.tp >= 3000) {
			firstWord = 'considerable';
			enderLevel = 2;
		} else {
			firstWord = 'gratifying';
			enderLevel = 1;
		}

		const delta = d.tp - d.lp;
		let verb;
		if (delta >= 5000) {
			verb =
				'You went all out this year, <span class="font-semibold text-orange-400">gained</span> an additional';
			enderLevel = Math.max(enderLevel, 3);
			titles.push({ bg: '#dc2f02', color: '#fff', text: 'Full Throttle' });
		} else if (delta >= 1000) {
			verb =
				'This year, You gave it your all, <span class="font-semibold text-orange-400">reaped</span> an additional';
			enderLevel = Math.max(enderLevel, 2);
		} else {
			verb =
				'You kept it steady this year, <span class="font-semibold text-orange-400">earned</span> an additional';
			enderLevel = Math.max(enderLevel, 1);
		}

		let enderText = '';
		if (enderLevel == 3) {
			enderText =
				'Reaching the peak, you become the embodiment of skill and expertise. Your mastery is unmatched.';
		} else if (enderLevel == 2) {
			enderText =
				'Through determination and effort, you have proven your worth. Challenges are no obstacle for you.';
		} else {
			enderText =
				"The winds will guide you to greater heights. Believe in your potential, and you'll excel even further.";
		}

		// 今年分数
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `By the end of ${data.year},<br>you have gathered a ${firstWord} total of ${d.tp} points`
				},
				{
					type: 't',
					text: `${verb}`
				},
				{ type: 'b', bg: '#fdd300', color: '#000', text: `${d.tp - d.lp} points`, rotation: 4 },
				{
					type: 't',
					text: `${enderText}`
				}
			],
			background: '/assets/yearly/ssu.png',
			leftTeeTop: 5,
			leftTeeSkin: data.skin,
			mapper: 'Sunny Side Up by Ravie'
		});
	} else if (d.tp != null) {
		// 今年分数
		if (d.tp == 0) {
			const titles = [{ bg: '#caffbf', color: '#000', text: 'New Beginning' }];
			allTitles.push(...titles);

			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `By the end of ${data.year},<br>you have <span class="font-semibold text-orange-400">no points</span> on record yet`
					},
					{
						type: 't',
						text: `But we know you have already started your journey`
					},
					{
						type: 't',
						text: 'Welcome to DDNet! We hope you will enjoy this'
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `new beginning`,
						rotation: -4
					}
				],
				background: '/assets/yearly/lf.png',
				mapper: 'Lavender Forest by Pipou'
			});
		} else {
			const titles = [{ bg: '#b7b7a4', color: '#000', text: 'Returning Voyage' }];
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `By the end of ${data.year},<br>your have ${d.tp} points on record`
					},
					{
						type: 't',
						text: `Compared to last year,<br>you have earned <span class="font-semibold text-orange-400">no new points</span>`
					},
					{
						type: 't',
						text: "It's been a while since your last adventure."
					},
					{
						type: 't',
						text: 'We sincerely hope to see you back in the game for'
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `new adventures`,
						rotation: -4
					}
				],
				background: '/assets/yearly/lf.png',
				mapper: 'Lavender Forest by Pipou'
			});
		}
	}
	if (d.mpg) {
		// 分数成就
		const titles = [];
		if (d.mpg[1] >= 34) {
			titles.push({ bg: '#a8dadc', color: '#000', text: 'Peak Performer' });
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `In the new maps you’ve conquered this year,<br>this one is truly a <span class="font-semibold text-orange-400">career highlight</span> for you.`
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${escapeHTML(d.mpg[0])}`,
						rotation: -24,
						x: -50
					},
					{
						type: 't',
						text: `This success added a total of`,
						t: -3,
						b: -3,
						rotation: -24
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${d.mpg[1]}pts`,
						rotation: -24,
						x: 50
					},
					{
						type: 't',
						text: `This means you have mastered an insanely difficult map.`
					},
					{
						type: 't',
						text: `May you not rest on these laurels,<br>but continue to push towards even greater challenges.`
					}
				],
				background: bgMap(d.mpg[0]),
				mapper: `${d.mpg[0]} by ${getMapper(d.mpg[0])}`
			});
		} else {
			if (d.mpg[1] >= 18) titles.push({ bg: '#f1faee', color: '#000', text: 'Steady Progress' });
			allTitles.push(...titles);
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `In the new maps you’ve finished this year,<br>this map stands out as your <span class="font-semibold text-orange-400">shining moment</span>.`
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${escapeHTML(d.mpg[0])}`,
						rotation: -24,
						x: -50
					},
					{
						type: 't',
						text: `By mastering this map, you've earned`,
						t: -3,
						b: -3,
						rotation: -24
					},
					{
						type: 'b',
						bg: '#fdd300',
						color: '#000',
						text: `${d.mpg[1]}pts`,
						rotation: -24,
						x: 50
					},
					{
						type: 't',
						text: `Keep conquering new challenges,`
					},
					{
						type: 't',
						text: `and shine on even higher scoring maps.`
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
		if (d.mhr[0] == 'Morning') {
			titles.push({ bg: '#2a9d8f', color: '#000', text: 'Early Bird' });
		}

		if ((d.tr || 0) >= 10 && d.mhr[1] / d.tr >= 0.5) {
			titles.push({ bg: '#e5989b', color: '#000', text: 'Clockwork' });
		}

		let bg;
		switch (d.mhr[0]) {
			case 'Dawn':
			case 'Morning':
				bg = {
					background: '/assets/yearly/s.png',
					mapper: 'Spoon by Ravie'
				};
				break;
			case 'Afternoon':
			case 'Evening':
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
					text: `You have successfully <span class="font-semibold text-orange-400">crossed the finish line</span> a total of`
				},
				{
					type: 'b',
					text: `${d.tr} times`,
					bg: '#fdd300',
					color: '#000',
					rotation: -4
				},
				{
					type: 't',
					text: `Among these,<br><span class="text-orange-400">${d.mhr[1]} times</span> were during the`,
					x: -30
				},
				{
					type: 'b',
					text: `${d.mhr[0]}`,
					bg: '#fdd300',
					color: '#000',
					rotation: 4,
					x: 100,
					t: -18,
					b: 3
				},
				{
					type: 't',
					text: 'Does this time hold special significance for you?'
				}
			],
			...bg
		});
	}
	if (d.mmr && d.mmr[3] > 0) {
		let bg;
		if (d.mmr[0] == 1) {
			bg = {
				background: '/assets/yearly/bif.png',
				mapper: 'Back in Festivity by Silex & Pipou'
			};
		} else if (d.mmr[0] == 4) {
			bg = {
				background: '/assets/yearly/p2.png',
				mapper: 'powerless2 by spiritdote'
			};
		} else if (d.mmr[0] == 7) {
			bg = {
				background: '/assets/yearly/h2.png',
				mapper: 'Holidays 2 by Destoros'
			};
		} else if (d.mmr[0] == 10) {
			bg = {
				background: '/assets/yearly/lt.png',
				mapper: 'Lonely Travel by QuiX'
			};
		}

		const titles = [];
		let prePhrase = false;
		if (d.tr && d.tr >= 10 && d.mmr[3] / d.tr >= 0.5) {
			titles.push({ bg: '#e07a5f', color: '#000', text: 'Seasonal' });
			prePhrase = true;
		}

		allTitles.push(...titles);

		// 常来季度
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `${prePhrase ? 'You seem to share a peculiar rhythm with the seasons.<br>' : ''}Your <span class="font-semibold text-orange-400">most active season</span> is the`
				},
				{ type: 'b', bg: '#fdd300', color: '#000', text: `${d.mmr[2]}`, rotation: 5 },
				{
					type: 't',
					text: `From <span class="text-orange-400">${month(d.mmr[0])} to ${month(d.mmr[1])}</span>,<br>you crossed the finish line <span class="text-orange-400">${d.mmr[3]} times</span>`
				}
			],
			...bg
		});
	}
	if (d.lnf) {
		// 夜猫子
		const dateTime = new Date(d.lnf[2] * 1000);
		const titles = [];

		if (dateTime.getHours() >= 2 || d.lnf[1] >= 2 * 60 * 60) {
			titles.push({ bg: '#14213d', color: '#fff', text: 'Night Owl' });
		}

		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `There was a special moment<br>on <span class="font-semibold text-orange-400">${date(dateTime)}</span>`
				},
				{
					type: 't',
					text: `You took ${secondsToTime(d.lnf[1])} to complete <span class="font-semibold text-orange-400">${escapeHTML(d.lnf[0])}</span><br>and crossed the finish line at`
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${time(dateTime)}`,
					rotation: -4
				},
				{
					type: 't',
					text: 'While the sky is dark, your passion burns bright.'
				},
				{
					type: 't',
					text: 'Do you still remember the effort you put in at that moment?'
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
			titles.push({ bg: '#a0c4ff', color: '#000', text: 'Map Master' });
		} else if (d.ymf[1] >= 60) {
			titles.push({ bg: '#caffbf', color: '#000', text: 'Path Pioneer' });
		} else if (d.ymf[1] >= 40) {
			titles.push({ bg: '#ffd6a5', color: '#000', text: 'Map Explorer' });
		}
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `Among the <span class="text-orange-400">${d.ymf[0]} new challenging maps</span> released this year,<br>you successfully completed <span class="font-semibold text-orange-400">${d.ymf[1] >= d.ymf[0] ? 'all' : d.ymf[1]}</span> of them`
				},
				{
					type: 't',
					text: `This means you achieved a finish rate of`
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
					text: `Among these maps, you finished`
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
					text: `the most times (${d.ymf[3]} finishes).`
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
			titles.push({ bg: '#3f37c9', color: '#fff', text: 'Hawk Eye' });
		}
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `You finished ${escapeHTML(d.nrr[0])} only`
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${secondsToTime(d.nrr[1])}`,
					rotation: -4
				},
				{
					type: 't',
					text: `<span class="text-orange-400 font-semibold">after its release</span>`
				},
				{
					type: 't',
					text: 'Not even a hawk could spot you racing to the finish line'
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
				titles.push({ bg: '#10002b', color: '#fff', text: 'Casual Enjoyer' });
			} else if (type == 'moderate') {
				titles.push({ bg: '#240046', color: '#fff', text: 'Challenge Solver' });
			} else if (type == 'brutal') {
				titles.push({ bg: '#3c096c', color: '#fff', text: 'Professional Player' });
			} else if (type == 'insane') {
				titles.push({ bg: '#5a189a', color: '#fff', text: 'Amazingly Insane' });
			} else if (type == 'dummy') {
				titles.push({ bg: '#6f1d1b', color: '#fff', text: 'Combined Mind' });
			} else if (type == 'solo') {
				titles.push({ bg: '#bb9457', color: '#000', text: 'Lone Wolf' });
			} else if (type.startsWith('ddmax')) {
				titles.push({ bg: '#432818', color: '#fff', text: 'DDmaX Enjoyer' });
			} else if (type == 'oldschool') {
				titles.push({ bg: '#99582a', color: '#000', text: 'Oldschool Enjoyer' });
			} else if (type == 'race') {
				titles.push({ bg: '#ffe6a7', color: '#000', text: 'Racer' });
			}
		}

		if (d.mps[1] >= 10 && type == 'fun') {
			titles.push({ bg: '#ffbf69', color: '#000', text: 'TRUE PLAYER' });
		}

		allTitles.push(...titles);
		if (type == 'fun') {
			cards.push({
				titles,
				content: [
					{
						type: 't',
						text: `Your most played map type is`
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
						text: `You seem to have discovered the true way to play DDNet`
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
						text: `Your most played map type is`
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
						text: `This year, you've crossed the finish line of ${mapType(d.mps[0])} maps <span class="font-semibold text-orange-400">${d.mps[1]} times</span>`
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
			titles.push({ bg: '#e0e1dd', color: '#000', text: 'Snake Oiler' });
		} else if (map == 'LearnToPlay') {
			titles.push({ bg: '#3d5a80', color: '#fff', text: 'LiveToPlay' });
		} else if (map == 'Sunny Side Up') {
			titles.push({ bg: '#ffc300', color: '#000', text: 'Always Sunny in DDNet' });
		} else if (map == 'Tutorial') {
			titles.push({ bg: '#a7c957', color: '#000', text: 'Live and Learn' });
		} else if (map == 'Epix') {
			titles.push({ bg: '#89c2d9', color: '#000', text: 'Narrow Trail' });
		} else if (map == 'Linear') {
			titles.push({ bg: '#e9edc9', color: '#000', text: 'Solo Traveler' });
		}

		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `Your most played map is`
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
					text: `You finished this map <span class="font-semibold text-orange-400">${d.mfm[1]} time</span><br>You must really like this map`
				}
			],
			background: bgMap(d.mfm[0]),
			mapper: `${d.mfm[0]} by ${getMapper(d.mfm[0])}`
		});
	}
	if (d.lf && d.lf[1] > 1) {
		// 最慢的记录
		const isBonusMap = mapHasBonus(d.lf[0]);
		const dateTime = new Date(d.lf[2] * 1000);
		const titles = [];
		if (isBonusMap) {
			titles.push({ bg: '#f28482', color: '#000', text: 'Time Wizard' });
		} else if (d.lf[1] >= 12 * 60 * 60) {
			titles.push({ bg: '#c8b6ff', color: '#000', text: 'Afk Warrior' });
		} else if (d.lf[1] >= 4 * 60 * 60) {
			titles.push({ bg: '#ffd6ff', color: '#000', text: 'Perseverance' });
		}
		allTitles.push(...titles);

		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `On <span class="text-orange-400 font-semibold">${date(dateTime)}</span>, you took`
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${secondsToTime(d.lf[1])}`,
					rotation: -4
				},
				{
					type: 't',
					text: `to complete <span class="font-semibold text-orange-400">${escapeHTML(d.lf[0])}</span>.`
				},
				{
					type: 't',
					text: 'This marks your <span class="font-semibold text-orange-400">slowest completion record</span> this year.<br>Your resilience and determination helped you reach the end.'
				},
				{
					type: 't',
					text: 'Or perhaps,',
					t: -2,
					b: -2
				},
				{
					type: 't',
					text: isBonusMap
						? 'was it some mysterious time magic at work?'
						: 'is this just a unique hobby of yours?'
				}
			],
			background: bgMap(d.lf[0]),
			mapper: `${d.lf[0]} by ${getMapper(d.lf[0])}`
		});
	}
	if (d.mpt && d.mpt[0]) {
		// 最常玩队友
		const titles = [];
		if (d.mpt[0][1] >= 100) {
			titles.push({ bg: '#2ec4b6', color: '#000', text: 'Unstoppable Duo' });
		} else if (d.mpt[0][1] >= 50) {
			titles.push({ bg: '#00509d', color: '#fff', text: 'Inseparable Team' });
		} else if (d.mpt[0][1] >= 20) {
			titles.push({ bg: '#00296b', color: '#fff', text: 'Brotherly Bond' });
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
						text: `Team race usually needs a teammate`
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
						text: `seems like your best buddy.<br>You have finished <span class="font-semibold text-orange-400">${d.mpt[0][1]} times</span> together`
					},
					{
						type: 't',
						text: `Just in case that was a dummy,`
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
						text: `is your second most teamed player. You've finished <span class="font-semibold text-orange-400">${d.mpt[1][1]} times</span> together.`
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
						text: `Team race usually needs a teammate`
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
						text: `seems like your best buddy.<br>You have finished <span class="font-semibold text-orange-400">${d.mpt[0][1]} times</span> together`
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
			titles.push({ bg: '#bee9e8', color: '#000', text: 'Tee Army' });
		}
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `You and other ${d.bt[0] - 1} Tees formed a stack of`
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${d.bt[0]} Tees Team`,
					rotation: -4
				},
				{
					type: 't',
					text: `and finished <span class="font-semibold text-orange-400">${escapeHTML(d.bt[1])}</span> together on ${date(new Date(d.bt[3] * 1000))}`
				},
				{
					type: 't',
					text: `The team: ${escapeHTML(d.bt[2])}`
				}
			],
			background: bgMap(d.bt[1]),
			mapper: `${d.bt[1]} by ${getMapper(d.bt[1])}`
		});
	}
	if (d.map && d.map.length > 0) {
		// 地图作者
		const titles = [{ bg: '#333533', color: '#fff', text: 'Level Designer' }];
		allTitles.push(...titles);
		cards.push({
			titles,
			content: [
				{
					type: 't',
					text: `This year, you have participated in publishing`
				},
				{
					type: 'b',
					bg: '#fdd300',
					color: '#000',
					text: `${d.map.length} maps`,
					rotation: -4
				},
				{
					type: 't',
					text: `${d.map.length > 1 ? 'Maps: ' : ''}${escapeHTML(d.map.join(', '))}`
				},
				{
					type: 't',
					text: `Thank you for your contributions`
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
				text: m.happy_new_year(),
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
		allTitles.push({ bg: '#8338ec', color: '#fff', text: 'Unnamed Hero' });
	}

	return {
		cards,
		titles: allTitles
	};
};
