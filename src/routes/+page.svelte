<script lang="ts">
	import { type Snippet } from 'svelte';

	import { browser } from '$app/environment';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { encodeAsciiURIComponent } from '$lib/link.js';
	import { fade } from 'svelte/transition';
	import { escapeHTML, month, secondsToTime, uaIsMobile } from '$lib/helpers';
	import { mapType } from '$lib/ddnet/helpers.js';
	import qrcode from 'qrcode';
	import type { YearlyData } from './event/+server.js';
	import type { MapList } from '$lib/server/fetches/maps.js';
	import { source } from 'sveltekit-sse';
	import { encode } from 'msgpackr';
	import { encodeBase64Url } from '$lib/base64url.js';
	import { page } from '$app/state';

	type Timer = any;

	const { data } = $props();

	const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
	const isMobile = $derived(() => uaIsMobile(data.ua));

	interface CardTextItem {
		type: 't';
		text: string;
		rotation?: number;
		x?: number;
		t?: number;
		b?: number;
	}

	interface CardBannerItem {
		type: 'b';
		bg: string;
		color?: string;
		text: string;
		rotation?: number;
		x?: number;
		t?: number;
		b?: number;
	}

	type CardItem = CardTextItem | CardBannerItem;

	interface CardData {
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
		format?: Snippet<[number, CardData]>;
		leftTeeTop?: number;
		leftTeeSkin?: { n: string; b?: number; f?: number } | null;
		rightTeeTop?: number;
		rightTeeSkin?: { n: string; b?: number; f?: number } | null;
	}

	let totalCards = $state(null) as {
		cards: CardData[];
		titles: { bg: string; color: string; text: string }[];
	} | null;
	let cardReady = $state(false);
	let currentCard = $state(-1);
	let scrollRoot = $state(null) as HTMLDivElement | null;
	let showContent = $state(true);

	let referenceScrollTop = 0;
	let scrollVersion = 0;

	let error = $state(false);
	let shareableUrl = $state('');
	let shareableQRCode = $state('');

	const leftTeePose = {
		bodyRotation: 15,
		eyesRotation: -8,
		frontFootRotation: 69,
		backFootRotation: 50,
		eyesPosition: '-4%, 0%',
		frontFootPosition: '-17%, -1%',
		backFootPosition: '-7%, -4%'
	};
	const rightTeePose = {
		bodyRotation: -17,
		eyesRotation: 3,
		frontFootRotation: -35,
		backFootRotation: -74,
		eyesPosition: '-56%, -2%',
		frontFootPosition: '-5%, -11%',
		backFootPosition: '9%, 12%'
	};

	const easeInOut = (t: number) => {
		return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
	};

	const easeOut = (t: number) => {
		const t1 = t - 1;
		return t1 * t1 * t1 + 1;
	};

	const scorllToPos = (top: number, totalTime: number, easing = easeOut) => {
		// scroll card into the center of the screen
		if (overscrollAnimationTimer) {
			clearTimeout(overscrollAnimationTimer);
			overscrollAnimationTimer = null;
		}

		if (scrollRoot) {
			const targetTop = top;

			let start = Date.now();
			let end = start + totalTime;

			const _scrollRoot = scrollRoot;
			const startTop = _scrollRoot.scrollTop;

			scrollVersion++;
			const version = scrollVersion;
			const update = () => {
				if (version != scrollVersion) return;
				let time = Date.now();
				if (time < end) {
					const progress = easing((time - start) / (end - start));
					const currentTop = startTop + (targetTop - startTop) * progress;
					_scrollRoot.scrollTo({
						top: currentTop,
						behavior: 'instant'
					});
					referenceScrollTop = currentTop;
					requestAnimationFrame(update);
				} else {
					_scrollRoot.scrollTo({
						top: targetTop,
						behavior: 'instant'
					});
					referenceScrollTop = targetTop;
				}
			};
			update();
		}
	};

	const scrollToCard = (id: number, totalTime: number = 500, easing = easeOut) => {
		const card = document.querySelector(`#card-${id}`) as HTMLDivElement;
		if (scrollRoot && card) {
			const targetTop =
				card.offsetTop - scrollRoot.offsetTop - (scrollRoot.clientHeight - card.clientHeight) / 2;
			scorllToPos(targetTop, totalTime);
		}
	};

	$effect(() => {
		if (!browser) return;
		scrollToCard(currentCard);
	});

	let timer: Timer | null = null;

	const onResize = () => {
		if (timer != null) {
			clearTimeout(timer);
			timer = null;
		}

		timer = setTimeout(() => {
			scrollToCard(currentCard);
			timer = null;
		}, 300);
	};

	let startAnimation = $state(true);
	let loadingProgress = $state(-1);

	let maps: MapList | null = null;

	const startProcess = async () => {
		const name = data.name;
		if (!name)
			return goto(``, {
				replaceState: true
			});

		let d: Partial<YearlyData> = {};

		const getMapper = (name: string) => maps?.find((map) => map.name == name)?.mapper || '不详';
		const mapHasBonus = (name: string) =>
			maps?.find((map) => map.name == name)?.tiles.includes('BONUS');
		const bgMap = (name: string) =>
			maps?.find((map) => map.name == name)?.thumbnail || '/assets/yearly/bif.png';

		loadingProgress = 0;
		try {
			if (!maps) {
				maps = await (await fetch('https://ddnet.org/releases/maps.json')).json();
			}
			loadingProgress = 0.01;

			const sseSource = source(
				`/event?name=${encodeURIComponent(name)}&year=${data.year}&tz=${encodeURIComponent(data.tz)}`
			);

			sseSource.select('progress').subscribe((progress) => {
				if (!progress) return;
				loadingProgress = parseInt(progress) / 100;
			});

			const result = await new Promise<any>((resolve, reject) => {
				sseSource.select('data').subscribe((result) => {
					if (!result) return;
					const data = JSON.parse(result);
					resolve(data);
				});
				sseSource.select('error').subscribe((error) => {
					if (!error) return;
					reject(error);
				});
			});

			d = result.d;
		} catch (e) {
			error = true;
			console.error(e);
		}

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
						text: `By the end of ${d.y},<br>you have gathered a ${firstWord} total of ${d.tp} points`
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
		if (d.ymf && d.ymfs && d.ymf[1] > 0) {
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
					},
					{
						type: 't',
						text: `Among these, you favored <span class="text-orange-400 font-semibold">${mapType(d.ymfs[0])}</span> maps,<br>completing <span class="text-orange-400">${d.ymfs[2]}/${d.ymfs[1]}</span> maps.`
					}
				],
				background: '/assets/yearly/p9.png',
				mapper: 'Planet 9 by Silex'
			});
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
				let leftTeeSkin = null;
				let rightTeeSkin = null;
				try {
					leftTeeSkin = await (
						await fetch(`/skins?name=${encodeURIComponent(d.mpt[0][0])}`)
					).json();
					rightTeeSkin = await (
						await fetch(`/skins?name=${encodeURIComponent(d.mpt[1][0])}`)
					).json();
				} catch {}

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
				let rightTeeSkin = null;
				try {
					rightTeeSkin = await (
						await fetch(`/skins?name=${encodeURIComponent(d.mpt[0][0])}`)
					).json();
				} catch {}
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
						text: `and finished <span class="font-semibold text-orange-400">${escapeHTML(d.bt[1])}</span> together`
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

		if (d.y) {
			// 新年快乐
			cards.push({
				content: [
					{
						type: 'b',
						bg: '#A00F2A',
						color: '#fff',
						text: `Happy New Year!`,
						rotation: 0
					}
				],
				t: 80,
				l: 50,
				b: 5,
				r: 5,
				format: noBlurRegularFormat,
				background: '/assets/yearly/year.png'
			});
		}

		// 分享
		cards.push({
			format: shareFormat,
			background: '/assets/yearly/end.png'
		});

		if (allTitles.length == 0) {
			allTitles.push({ bg: '#8338ec', color: '#fff', text: 'Unnamed Hero' });
		}

		const code = encodeBase64Url(encode({ n: data.name, y: data.year, t: data.tz }) as any);

		const url = new URL(window.location.href);
		url.search = `?code=${code}`;
		replaceState(url.toString(), page.state);
		shareableUrl = url.toString();
		shareableQRCode = await qrcode.toDataURL(url.toString());

		totalCards = {
			cards,
			titles: allTitles
		};
		await timeout(700);
		cardReady = true;
		await timeout(500);
		scrollToCard(0, 2000, easeInOut);
		await timeout(2000);

		showContent = true;
		currentCard = 0;
		startAnimation = false;
	};

	afterNavigate(() => {
		// make sure we clear the data after navigation, so we prompt the user to generate the page again

		totalCards = null;
		error = false;
		cardReady = false;
		startAnimation = true;
		loadingProgress = -1;
		currentCard = -1;

		if (observer) {
			observer.disconnect();
			observer = null;
		}
	});

	let dragStart = 0;
	let draggingPointer = null as number | null;

	const onPointerDown = (ev: PointerEvent) => {
		if (startAnimation) return;
		if (draggingPointer) return;

		// only accept left click
		if (ev.pointerType == 'mouse' && ev.button != 0) return;

		const card = document.querySelector(`#card-${currentCard}`) as HTMLDivElement;
		if (card) {
			card.style.scale = '0.98';
		}

		dragStart = ev.clientY;
		draggingPointer = ev.pointerId;
	};

	const onPointerMove = (ev: PointerEvent) => {
		if (ev.pointerId != draggingPointer) return;

		const delta = dragStart - ev.clientY;
		if (scrollRoot)
			scrollRoot.scrollTop =
				referenceScrollTop + Math.sign(delta) * Math.pow(Math.abs(delta), 0.5) * 3;
	};

	const updateCardDelta = (delta: number) => {
		showContent = true;
		if (delta < 0) {
			if (currentCard >= (totalCards?.cards?.length || 0) - 1) {
				return;
			}
			currentCard++;
		} else if (delta > 0) {
			if (currentCard <= 0) {
				return;
			}
			currentCard--;
		}
	};

	let shareError = $state('');
	let shareInfo = $state('');

	const onPointerUp = (ev: PointerEvent) => {
		if (ev.pointerId != draggingPointer) return;

		const card = document.querySelector(`#card-${currentCard}`) as HTMLDivElement;
		if (card) {
			card.style.scale = '1';
		}

		const delta = ev.clientY - dragStart;
		if (Math.abs(delta) > 5) {
			const current = currentCard;
			updateCardDelta(delta);
			if (currentCard == current) {
				scrollToCard(currentCard);
			}
		} else {
			showContent = !showContent;

			if (totalCards && currentCard == totalCards.cards.length - 1) {
				try {
					if (navigator.canShare && navigator.canShare()) {
						navigator.share({
							title: `DDNet ${data.year} Recap for ${data.name}`,
							text: `Check out ${data.name}'s DDNet ${data.year} recap`,
							url: shareableUrl
						});
					} else {
						navigator.clipboard.writeText(
							`Check out ${data.name}'s DDNet ${data.year} recap: ${shareableUrl}`
						);

						shareInfo = 'Copied to clipboard!';
					}
				} catch {
					shareError = 'Failed to share. You can copy the address manually or take a screenshot';
				}
			}
		}
		draggingPointer = null;
	};

	const onPointerCancel = (ev: PointerEvent) => {
		if (ev.pointerId != draggingPointer) return;

		draggingPointer = null;
	};

	let wheelDebounceTimer: Timer | null = null;
	let overscrollAnimationTimer: Timer | null = null;

	const onWheel = (ev: WheelEvent) => {
		if (startAnimation) return;
		if (wheelDebounceTimer) return;

		const delta = -ev.deltaY;
		const current = currentCard;
		updateCardDelta(delta);
		if (currentCard == current) {
			// make a overscroll animation
			if (scrollRoot) {
				scrollRoot.scrollTo({
					top: referenceScrollTop - delta,
					behavior: 'smooth'
				});
				overscrollAnimationTimer = setTimeout(() => {
					overscrollAnimationTimer = null;
					if (scrollRoot) {
						scrollRoot.scrollTo({
							top: referenceScrollTop,
							behavior: 'smooth'
						});
					}
				}, 100);
			}
		}

		wheelDebounceTimer = setTimeout(() => {
			wheelDebounceTimer = null;
		}, 200);
	};

	let observer: IntersectionObserver | null = null;

	$effect(() => {
		totalCards;
		// after review data is loaded and rendered. scroll to the bottom
		if (scrollRoot) {
			// scroll to bottom
			scrollRoot.scrollTo({
				top: scrollRoot.scrollHeight,
				behavior: 'instant'
			});
		}

		if (!observer) {
			observer = new IntersectionObserver((entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						(entry.target as HTMLDivElement).style.visibility = 'visible';
					} else {
						(entry.target as HTMLDivElement).style.visibility = 'hidden';
					}
				}
			});
		}

		const cards = document.querySelectorAll('.card');
		for (const card of cards) {
			observer.observe(card);
		}
	});

	let gotoName = $state('');

	/** this is needed to grab user's system timezone and navigate to the timezone specific recap page */
	const goForName = (name: string) => {
		try {
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			goto(
				`?name=${encodeAsciiURIComponent(name)}&year=${data.year}&tz=${encodeURIComponent(timezone)}`,
				{
					replaceState: true
				}
			);
		} catch (e) {
			console.error('Failed to check user timezone');
			console.error(e);
			goto(
				`?name=${encodeAsciiURIComponent(name)}&year=${data.year}&tz=${encodeURIComponent('UTC')}`
			);
		}
	};
</script>

<svelte:window on:resize={onResize} />

<svelte:head>
	{#if data.name}
		<title>{data.name} - DDNet Recap {data.year}</title>
	{:else}
		<title>DDNet Recap {data.year}</title>
	{/if}
</svelte:head>

{#snippet cardSnippet(id: number, card: CardData, format: Snippet<[number, CardData]>)}
	<div
		id="card-{id}"
		class="card relative mx-auto my-8 aspect-square max-w-full select-none text-[7svw] transition-[scale] sm:h-[70%] sm:text-[4svh]"
		class:odd:motion-translate-x-in-[30%]={id == currentCard}
		class:odd:motion-translate-x-out-[30%]={id != currentCard}
		class:odd:motion-rotate-in-[12deg]={id == currentCard}
		class:odd:motion-rotate-out-[12deg]={id != currentCard}
		class:even:motion-translate-x-in-[-30%]={id == currentCard}
		class:even:motion-translate-x-out-[-30%]={id != currentCard}
		class:even:motion-rotate-in-[-12deg]={id == currentCard}
		class:even:motion-rotate-out-[-12deg]={id != currentCard}
		class:motion-blur-in-md={id == currentCard}
		class:motion-blur-out-md={id != currentCard}
		class:motion-opacity-in-50={id == currentCard}
		class:motion-opacity-out-50={id != currentCard}
		class:z-10={id == currentCard}
	>
		{#if card.mapper}
			<div
				class="motion-duration-250 absolute mt-[-10%] flex h-[10%] w-[75%] flex-col items-center justify-center overflow-hidden rounded-t-xl bg-teal-900 text-[0.5em] transition-transform"
				class:motion-translate-y-in-[100%]={id == currentCard}
				class:motion-translate-y-out-[100%]={id != currentCard}
				class:motion-delay-500={id == currentCard}
				class:translate-y-[50%]={showContent}
				class:ml-[20%]={id % 3 == 0}
				class:ml-[5%]={id % 3 == 1}
				class:ml-[13%]={id % 3 == 2}
			>
				<div class="px-[4%] transition-transform" class:translate-y-[-30%]={showContent}>
					{card.mapper}
				</div>
			</div>
		{/if}
		<div
			class="absolute h-full w-full overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black"
		>
			<div
				class="absolute h-full w-full bg-cover bg-center"
				style="background-image: url({card.background})"
			>
				{@render format(id, card)}
			</div>
		</div>
		{#if card.titles}
			<div
				class="absolute bottom-[-5%] left-[5%] right-[5%] flex flex-row flex-nowrap text-[0.6em]"
			>
				{#each card.titles as title, i}
					<div
						class="m-[1%] text-nowrap rounded-3xl border border-white/50 px-[4%] py-[1%] text-center font-semibold"
						style="background-color: {title.bg};{title.color ? `color: ${title.color};` : ''}"
						class:motion-delay-1000={i == 0}
						class:motion-delay-1500={i == 1}
						class:motion-delay-2000={i == 2}
						class:motion-preset-shrink={showContent && id == currentCard}
						class:opacity-0={!showContent || id != currentCard}
					>
						{title.text}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet regularFormat(id: number, card: CardData)}
	<div
		class="flex h-full w-full items-center justify-center text-[0.8em] transition-[backdrop-filter] motion-delay-700"
		class:motion-opacity-in-0={id == currentCard}
		class:motion-opacity-out-0={id != currentCard}
		class:backdrop-blur-sm={showContent}
		class:backdrop-brightness-75={showContent}
		class:backdrop-saturate-50={showContent}
	>
		<div
			class="absolute flex flex-col items-center justify-center gap-[3%] transition-opacity"
			class:opacity-0={!showContent}
			style="left: {card.l ?? 5}%; top: {card.t ?? 5}%; right: {card.r ?? 5}%; bottom: {card.b ??
				5}%;"
		>
			{#if card.leftTeeSkin}
				<div
					class="absolute left-[-12.5%] h-[20%] w-[20%] motion-duration-500 motion-delay-700"
					style="top: {card.leftTeeTop ?? 0}%"
					class:motion-translate-x-in-[-50%]={showContent && id == currentCard}
					class:motion-translate-x-out-[-50%]={!showContent && id != currentCard}
					class:motion-rotate-in-[-12deg]={showContent && id == currentCard}
					class:motion-rotate-out-[-12deg]={!showContent && id != currentCard}
				>
					<TeeRender
						name={card.leftTeeSkin.n}
						body={card.leftTeeSkin.b}
						feet={card.leftTeeSkin.f}
						className="h-full w-full"
						useDefault
						alwaysFetch
						pose={leftTeePose}
					/>
				</div>
			{/if}
			{#if card.rightTeeSkin}
				<div
					class="absolute right-[-12.5%] h-[20%] w-[20%] motion-duration-500 motion-delay-700"
					style="top: {card.rightTeeTop ?? 0}%"
					class:motion-translate-x-in-[50%]={showContent && id == currentCard}
					class:motion-translate-x-out-[50%]={!showContent && id != currentCard}
					class:motion-rotate-in-[12deg]={showContent && id == currentCard}
					class:motion-rotate-out-[12deg]={!showContent && id != currentCard}
				>
					<TeeRender
						name={card.rightTeeSkin.n}
						body={card.rightTeeSkin.b}
						feet={card.rightTeeSkin.f}
						className="h-full w-full"
						useDefault
						alwaysFetch
						pose={rightTeePose}
					/>
				</div>
			{/if}
			{#if card.content}
				{#each card.content as item}
					{#if item.type == 't'}
						<div
							class="rounded-xl bg-slate-700/90 px-[4%] py-[1%] text-center text-[0.7em]"
							style="transform: rotate({item.rotation ?? 0}deg) translate({item.x ??
								0}%);margin-top: {item.t ?? 0}%;margin-bottom: {item.b ?? 0}%;"
						>
							{@html item.text}
						</div>
					{:else if item.type == 'b'}
						<div
							class="rounded px-[4.5%] py-[1.5%] text-center font-semibold"
							style="transform: rotate({item.rotation ?? 0}deg) translate({item.x ??
								0}%);background-color: {item.bg};margin-top: {item.t ??
								0}%;margin-bottom: {item.b ?? 0}%;{item.color ? `color: ${item.color};` : ''}"
						>
							{@html item.text}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet noBlurRegularFormat(id: number, card: CardData)}
	<div
		class="flex h-full w-full items-center justify-center text-[0.8em] motion-delay-700"
		class:motion-opacity-in-0={id == currentCard}
		class:motion-opacity-out-0={id != currentCard}
	>
		<div
			class="absolute flex flex-col items-center justify-center gap-[3%] transition-opacity"
			class:opacity-0={!showContent}
			style="left: {card.l ?? 5}%; top: {card.t ?? 5}%; right: {card.r ?? 5}%; bottom: {card.b ??
				5}%;"
		>
			{#if card.content}
				{#each card.content as item}
					{#if item.type == 't'}
						<div class="rounded-lg bg-slate-700/80 px-2 py-1 text-center text-[0.7em]">
							{@html item.text}
						</div>
					{:else if item.type == 'b'}
						<div
							class="rounded px-4 py-2 text-center font-semibold"
							style="transform: rotate({item.rotation}deg);background-color: {item.bg};{item.color
								? `color: ${item.color};`
								: ''}"
						>
							{@html item.text}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet shareFormat(id: number, card: CardData)}
	<div class="flex h-full w-full items-center justify-center text-[0.6em]">
		<div
			class="absolute bottom-[2%] left-[2%] right-[2%] top-[2%] flex flex-col items-center justify-center gap-[3%]"
		>
			<div
				class="absolute bottom-[35%] left-0 right-0 top-0 flex flex-grow items-center justify-center rounded-xl border-[0.25em] border-sky-200/60 bg-sky-100/90 pt-[7%]"
			>
				<div class="flex w-full flex-row flex-wrap items-center justify-center">
					{#if totalCards?.titles}
						{#each totalCards.titles as title}
							<span
								class="m-[1%] text-nowrap rounded-3xl border border-black/50 px-[2%] py-[0.25%] text-center font-semibold"
								style="background-color: {title.bg};{title.color ? `color: ${title.color};` : ''}"
							>
								{title.text}
							</span>
						{/each}
					{/if}
				</div>
			</div>
			<div class="absolute top-[1%] font-semibold text-black">
				{data.year} Badges for {data.name}
			</div>
			<div
				class="absolute left-[-9%] top-[70%] h-[20%] w-[20%] motion-duration-500 motion-delay-700"
				class:motion-translate-x-in-[-70%]={id == currentCard}
				class:motion-translate-x-out-[-70%]={id != currentCard}
				class:motion-rotate-in-[-12deg]={id == currentCard}
				class:motion-rotate-out-[-12deg]={id != currentCard}
			>
				<TeeRender
					name={data.skin?.n}
					body={data.skin?.b}
					feet={data.skin?.f}
					className="h-full w-full"
					useDefault
					alwaysFetch
					pose={leftTeePose}
				/>s
			</div>
			<div
				class="absolute bottom-[2.5%] left-[7%] flex h-[30%] w-[55%] flex-row items-center justify-center motion-duration-500 motion-delay-1500"
				class:motion-opacity-in-0={id == currentCard}
			>
				<div class="rounded-lg bg-white/80 px-[3%] py-[2%] text-center text-[0.9em] text-black">
					{#if shareError}
						{shareError}
					{:else if shareInfo}
						{shareInfo}
					{:else if navigator.canShare && navigator.canShare()}
						{isMobile() ? 'Tap' : 'Click'} this card to share
					{:else}
						{isMobile() ? 'Tap' : 'Click'} this card to copy your recap link
					{/if}
				</div>
			</div>
			<div class="absolute bottom-[2.5%] right-[5%] flex h-[30%] w-[30%]">
				<div
					class="h-full w-full rounded-lg bg-white bg-cover bg-center"
					style="background-image: url({shareableQRCode});"
				></div>
			</div>
		</div>
	</div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed bottom-0 left-0 right-0 top-0">
	<div
		class="absolute h-full w-full touch-none"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
		onwheel={onWheel}
	>
		<div
			bind:this={scrollRoot}
			class="scrollbar-hide pointer-events-none h-full w-full flex-col gap-1 overflow-y-scroll"
		>
			<div class="h-svh"></div>
			{#if totalCards}
				{#each totalCards.cards as card, i}
					{@render cardSnippet(i, card, card.format || regularFormat)}
				{/each}
			{/if}
			<div class="h-svh"></div>
		</div>
		<div class="absolute left-[5%] right-0 top-0 z-20 flex flex-row space-x-2">
			{#if data.player}
				<div class="rounded-b-xl bg-blue-600 px-4 py-2 font-semibold">
					DDNet {data.year} Recap for {data.player.name}
				</div>
			{/if}
		</div>
		<div class="absolute bottom-0 left-0 right-0 z-20 flex flex-row space-y-2">
			{#if data.tz}
				<div class="absolute bottom-0 right-0 rounded-tl-xl bg-blue-500 px-4 py-2 font-semibold">
					Timezone: {data.tz}
				</div>
			{/if}
			<a
				data-sveltekit-replacestate
				href="/"
				class="rounded-tr bg-slate-600 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-300 hover:bg-slate-700"
			>
				Change name
			</a>
		</div>
		{#if currentCard == 0 && !startAnimation}
			<div
				class="absolute bottom-[5%] left-0 right-0 z-20 flex items-center justify-center text-[7svw] sm:text-[4svh]"
				out:fade
				in:fade
			>
				<div class="motion-preset-oscillate text-[0.7em]">
					↓ {isMobile() ? 'Swipe up' : 'Scroll'} to continue ↓
				</div>
			</div>
		{/if}
	</div>
	{#if !totalCards || !cardReady || error}
		<div
			class="absolute z-50 flex h-full w-full items-center justify-center bg-slate-800 px-2"
			out:fade
			in:fade
		>
			<div
				class="relative w-96 overflow-hidden rounded-lg border border-slate-600 bg-slate-700 shadow-md transition-all duration-500"
				class:h-[18rem]={!data.player}
				class:h-[20.5rem]={data.player}
			>
				<div
					class="relative flex h-32 items-center justify-center overflow-hidden rounded-t-lg bg-cover bg-center"
					style="background-image: url(/assets/yearly/bif.png)"
				>
					<div
						class="absolute h-[150%] w-16 translate-x-[-400%] rotate-12 bg-slate-200/10 motion-translate-x-loop-[800%] motion-duration-[5000ms]"
					></div>
					{#if error}
						<div
							class="motion-preset-shake rounded-3xl bg-red-700/40 px-8 py-4 text-xl font-bold text-white backdrop-blur-lg"
						>
							Unknown error, please try again later
						</div>
					{:else}
						<div
							class="rounded-3xl bg-slate-700/40 px-8 py-4 text-center text-xl font-bold backdrop-blur-lg"
						>
							<div class="w-full text-red-300 motion-scale-loop-[110%] motion-duration-2000">
								Happy new year!
							</div>
							DDNet {data.year} Recap
							<div class="text-sm">
								Powered by <a
									class="text-orange-400 hover:text-orange-300"
									href="https://db.ddstats.org">ddstats.org</a
								>
							</div>
						</div>
					{/if}
				</div>
				<div class="h-full max-h-[calc(100svh-20rem)] space-y-3 p-4">
					{#if error}
						<div class="flex h-[10rem] w-full flex-col items-center justify-center gap-4">
							<div class="flex flex-col space-y-2">
								<button
									class="text-nowrap rounded bg-blue-500 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-200 hover:bg-blue-600"
									onclick={() => goto(``)}
								>
									Re-enter name
								</button>
							</div>
						</div>
					{:else if data.player}
						{#if loadingProgress >= 0}
							<div
								class="flex h-[10rem] w-full flex-col items-center justify-center gap-4"
								out:fade
								in:fade
							>
								<div class="font-bold">{data.name} - {data.year} Recap</div>
								<div class="flex flex-row items-center justify-center gap-2">
									<div>Preparing...</div>
									<div class="w-[3.5rem]text-center">{Math.round(loadingProgress * 100)}%</div>
								</div>
								<div class="h-5 w-full overflow-hidden rounded border border-sky-700 bg-sky-900">
									<div
										class="h-full rounded bg-sky-600"
										style="width: {loadingProgress * 100}%;"
									></div>
								</div>
							</div>
						{:else}
							{#key data.player.name}
								<div out:fade>
									<div
										class="flex flex-row items-center justify-center gap-8 motion-translate-x-in-[-200%] motion-rotate-in-12 motion-duration-1000 motion-delay-100"
									>
										<TeeRender
											className="relative h-20 w-20"
											name={data.skin?.n}
											body={data.skin?.b}
											feet={data.skin?.f}
											useDefault
											alwaysFetch
										/>
										<div class="flex flex-col">
											<div class="font-semibold text-slate-300">{data.player.name}</div>
											<div>Points：{data.player.points.points}pts</div>
											<div>Rank：No.{data.player.points.rank}</div>
										</div>
									</div>
									<div class="flex flex-col space-y-2">
										<button
											class="mt-2 text-nowrap rounded bg-blue-500 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-200 hover:bg-blue-600"
											onclick={startProcess}
										>
											{isMobile() ? 'Tap' : 'Click'} here to start
										</button>
									</div>
									<div class="absolute bottom-0 left-0 right-0 flex flex-row space-y-2">
										<a
											data-sveltekit-replacestate
											href="/"
											class="rounded-tr bg-slate-800 px-4 py-2 text-white motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-300 hover:bg-slate-900"
										>
											Change name
										</a>
									</div>
								</div>
							{/key}
						{/if}
					{:else}
						{#key 'entry'}
							<div class="flex flex-col space-y-2">
								<div class="text-sm text-slate-300">
									Enter player name
									{#if data.error}
										<span class="text-red-500 motion-text-loop-red-400">
											{data.error}
										</span>
									{/if}
								</div>
								<input
									type="text"
									class="w-full rounded border border-slate-500 bg-slate-600 px-3 py-2 text-sm font-normal shadow-md md:flex-1"
									bind:value={gotoName}
									onkeydown={(ev) => {
										if (ev.key == 'Enter') {
											if (gotoName) goForName(gotoName);
										}
									}}
								/>
							</div>
							<div class="flex flex-col space-y-2">
								<button
									class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50"
									onclick={() => {
										if (gotoName) goForName(gotoName);
									}}
								>
									Go
								</button>
							</div>
						{/key}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
