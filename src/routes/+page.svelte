<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { encodeAsciiURIComponent } from '$lib/link';
	import { fade, slide } from 'svelte/transition';
	import { datetime, uaIsMobile } from '$lib/helpers';
	import * as qrcode from 'qrcode';
	import { encodeBase64Url } from '$lib/base64url';
	import { page } from '$app/state';
	import { onMount, type Snippet } from 'svelte';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { YearlyData } from '$lib/query-engine.worker';
	import QueryWorker from '$lib/query-engine.worker?worker';
	import { DateTime } from 'luxon';
	import { generateCards, type CardData } from '$lib/cards';
	import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime.js';
	import { CURRENT_YEAR } from '$lib/consts';
	import { chart } from '$lib/chart.svelte.js';
	import { genPose } from '$lib/pose.js';

	let pageKey = $state(0);

	const locales: { code: Locale; name: string; sub?: string }[] = [
		{ code: 'en', name: 'English' },
		{ code: 'cs', name: 'Čeština' },
		{ code: 'de', name: 'Deutsch' },
		{ code: 'ja', name: '日本語' },
		{ code: 'ko', name: '한국어' },
		{ code: 'pl', name: 'Polski' },
		{ code: 'pt-BR', name: 'Português', sub: 'Brasil' },
		{ code: 'ru', name: 'Русский' },
		{ code: 'sk', name: 'Slovenčina' },
		{ code: 'sv', name: 'Svenska' },
		{ code: 'tr', name: 'Türkçe' },
		{ code: 'uk', name: 'Українська' },
		{ code: 'zh-CN', name: '简体中文' },
		{ code: 'zh-TW', name: '繁體中文' }
	];
	let dropdownOpen = $state(false);

	type CardFormat = Snippet<[number, CardData]>;

	const { data } = $props();

	const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
	const isMobile = $derived(() => uaIsMobile(data.ua));

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
	let sqliteDb = $state<Uint8Array | null>(null);

	const leftTeePose = {
		bodyRotation: 15,
		eyesRotation: -8,
		frontFootRotation: 25,
		backFootRotation: 50,
		eyesPosition: '-4%, 0%',
		frontFootPosition: '-17%, 8%',
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

	let timer: NodeJS.Timeout | null = null;

	const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
	const maxWidth = rootFontSize * 40;
	const refFontSize = 46;
	let fontSize = $state(refFontSize);

	onMount(() => {
		(window as any).DownloadSqlite = () => {
			if (!sqliteDb) {
				console.error('No SQLite data available');
				return;
			}
			const blob = new Blob([sqliteDb as Uint8Array<ArrayBuffer>], {
				type: 'application/vnd.sqlite3'
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `ddnet_recap_${data.year}_${data.name}.sqlite`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		};

		if (window.innerWidth < maxWidth) {
			fontSize = refFontSize * (window.innerWidth / maxWidth);
		} else {
			fontSize = refFontSize;
		}
	});

	const onResize = () => {
		if (window.innerWidth < maxWidth) {
			fontSize = refFontSize * (window.innerWidth / maxWidth);
		} else {
			fontSize = refFontSize;
		}

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

	let maps:
		| {
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
		  }[]
		| null = null;

	const startProcess = async () => {
		const name = data.name;
		if (!name)
			return goto(``, {
				replaceState: true
			});

		let d: Partial<YearlyData> = {};

		loadingProgress = 0;
		try {
			// download maps
			if (!maps) {
				maps = await (await fetch('/maps')).json();
			}
			loadingProgress = 0.05;

			// process player data
			const result = await new Promise<{
				db: Uint8Array;
				data: Partial<YearlyData>;
			}>((resolve) => {
				let queryWorker = new QueryWorker();
				queryWorker.postMessage({ maps, name, year: data.year, tz: data.tz });
				queryWorker.onmessage = (e) => {
					if (e.data.type == 'progress') {
						loadingProgress = 0.05 + (e.data.progress / 100) * 0.85;
					} else if (e.data.type == 'result') {
						resolve(e.data.result);
						loadingProgress = 0.9;
					}
				};
			});

			d = result.data;
			sqliteDb = result.db;
			// Colorful log for hackers
			console.log('%c🎉 Data generated!', 'color: #0ea5e9; font-size: 1.5em; font-weight: bold;');
			console.log(
				`%c📦 ${name}'s player data is available to download as a sqlite database via \`window.DownloadSqlite()\``,
				'color: #10b981; font-size: 1em;'
			);
			totalCards = await generateCards(maps!, data, d, m, getLocale(), (percent) => {
				loadingProgress = 0.9 + percent * 0.1;
			});
			loadingProgress = 1;
		} catch (e) {
			error = true;
			console.error(e);
		}

		const code = encodeBase64Url(`${data.year}\u0003${data.tz}\u0003${data.name}`);

		const url = new URL(window.location.href);
		url.search = `?code=${code}`;
		replaceState(url.toString(), page.state);

		shareableUrl = url.toString();
		shareableQRCode = await qrcode.toDataURL(url.toString(), { errorCorrectionLevel: 'L' });

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
		sqliteDb = null;
		error = false;
		cardReady = false;
		startAnimation = true;
		loadingProgress = -1;
		currentCard = -1;
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
				const text = m.page_share({
					name: data.name!,
					year: data.year,
					link: shareableUrl!
				});

				try {
					if (navigator.canShare && navigator.canShare()) {
						navigator.share({
							title: m.page_ddnet_recap_for({
								player: data.name!,
								year: data.year
							}),
							text: text,
							url: shareableUrl
						});
					}
				} catch {}

				try {
					navigator.clipboard.writeText(text);
					shareInfo = m.page_share_copied();
					setTimeout(() => {
						shareInfo = '';
					}, 2000);
				} catch {
					shareError = m.page_share_failed();
					setTimeout(() => {
						shareError = '';
					}, 2000);
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

	const onKeyDown = (ev: KeyboardEvent) => {
		if (startAnimation) return;
		if (!cardReady) return;

		const { key } = ev;
		if (key === 'ArrowUp') {
			ev.preventDefault();
			updateCardDelta(1); // positive delta moves to previous card
		} else if (key === 'ArrowDown') {
			ev.preventDefault();
			updateCardDelta(-1); // negative delta moves to next card
		} else if (key === ' ' || key === 'Spacebar') {
			// block spacebar
			ev.preventDefault();
		} else if (key === 'Tab') {
			// block tab
			ev.preventDefault();
		}
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
			const timezone = DateTime.local().zoneName;
			goto(`?y=${data.year}&t=${encodeURIComponent(timezone)}&n=${encodeAsciiURIComponent(name)}`, {
				replaceState: true
			});
		} catch (e) {
			console.error('Failed to check user timezone');
			console.error(e);
			goto(
				`?year=${data.year}&t=${encodeURIComponent('utc+0')}&n=${encodeAsciiURIComponent(name)}`
			);
		}
	};

	const getFormat = (format: string | undefined) => {
		switch (format) {
			case 'no-blur':
				return noBlurRegularFormat;
			case 'share':
				return shareFormat;
			default:
				return regularFormat;
		}
	};

	// Mobile firefox have layout issues when absolute is layouted before an element is layouted.
	// This is a hack to force layouting the element and then add the class to make it absolute.
	let hackTimeout: NodeJS.Timeout | null = null;
	const triggerTimeout = () => {
		if (hackTimeout) {
			clearTimeout(hackTimeout);
		}
		hackTimeout = setTimeout(() => {
			const hack = document.querySelector('.pl-hack-pre');
			if (hack) {
				hack.classList.add('pl-hack');
			}
		}, 1000);
	};

	const hackText = (text: string) => {
		if (getLocale().startsWith('pl')) {
			const polishHack = /[^ <>]+\/[^ <>]+/g;
			return text.replace(polishHack, (match) => {
				const [a, b] = match.split('/');
				triggerTimeout();
				return `<span class="pl-hack-pre"><span>${b}</span><span>${a}</span></span>`;
			});
		}

		return text;
	};
</script>

<div></div>
<svelte:window onresize={onResize} onkeydown={onKeyDown} />

<svelte:head>
	{#if data.name}
		<title>{data.name} - {m.page_ddnet_recap({ year: data.year })}</title>
		<meta property="og:title" content={m.page_ddnet_recap({ year: data.year })} />
		<meta property="og:type" content="website" />
		<meta
			property="og:description"
			content={m.page_ddnet_recap_for({ year: data.year, player: data.name })}
		/> <meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
		<meta name="title" content={m.page_ddnet_recap({ year: data.year })} />
		<meta
			name="description"
			content={m.page_ddnet_recap_for({ year: data.year, player: data.name })}
		/>
	{:else}
		<title>{m.page_ddnet_recap({ year: data.year })}</title>
		<meta property="og:title" content={m.page_ddnet_recap({ year: data.year })} />
		<meta property="og:type" content="website" />
		<meta property="og:description" content={m.page_ddnet_recap_desc({ year: data.year })} />
		<meta property="og:image" content="https://teeworlds.cn/shareicon.png" />
		<meta name="title" content={m.page_ddnet_recap({ year: data.year })} />
		<meta name="description" content={m.page_ddnet_recap_desc({ year: data.year })} />
	{/if}
</svelte:head>

{#snippet cardSnippet(id: number, card: CardData, format: CardFormat)}
	<div
		id="card-{id}"
		class="card relative mx-auto my-8 aspect-square max-w-full transition-[scale] select-none sm:max-w-sm sm:max-h-sm"
		style:font-size="{fontSize}px"
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
				class="motion-duration-250 absolute mt-[-10%] duration-300 ease-out flex h-[10%] w-[75%] flex-col items-center justify-center overflow-hidden rounded-t-[1em] bg-linear-to-r from-cyan-500 to-blue-500 text-white text-[0.5em] ml-(--n) transition-transform"
				class:translate-y-[50%]={showContent || id != currentCard}
				class:translate-y-[120%]={id != currentCard}
				class:delay-500={showContent || id != currentCard}
				class:rotate-(--r)={showContent || id != currentCard}
				class:rotate-0={id != currentCard}
				style="--n: {5 + ((id * 7.25) % 15)}%; --r: {-2 + ((0.0235 + id * 5.32481238) % 1) * 4}deg"
			>
				<div
					class="px-[4%] transition-transform duration-300 ease-out"
					class:translate-y-[-45%]={showContent}
					class:delay-500={showContent || id != currentCard}
				>
					{@html card.mapper}
				</div>
			</div>
		{/if}
		<div
			class="absolute h-full w-full bg-cover bg-center overflow-hidden rounded-[1em] bg-white shadow-2xl shadow-black border-[0.05em] border-white/50"
			style:border={card.border}
			style:box-shadow={'inset 0 0 1em 0.25em #00000044;'}
			style="background-image: url({card.background});"
		>
			{@render format(id, card)}
		</div>
		{#if card.titles}
			<div class="absolute right-[5%] bottom-[-5%] left-[5%] flex flex-row flex-wrap text-[0.55em]">
				{#each card.titles as title, i}
					<div
						class="m-[1%] rounded-[1em] border-[0.1em] motion-delay-(--n) border-t-white/30 border-l-white/30 border-black/30 px-[4%] py-[1%] text-center font-semibold text-nowrap"
						style="--n: {1 + i * 0.25}s; background-color: {title.bg};{title.color
							? `color: ${title.color};`
							: ''}"
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
		class="motion-delay-700 flex h-full w-full items-center justify-center text-[0.8em] transition-[backdrop-filter,box-shadow]"
		class:motion-opacity-in-0={id == currentCard}
		class:motion-opacity-out-0={id != currentCard}
		class:backdrop-blur-xs={showContent}
		class:backdrop-brightness-75={showContent}
		class:backdrop-saturate-50={showContent}
	>
		<div
			class="absolute top-0 bottom-0 left-0 right-0 transition-opacity"
			class:opacity-0={!showContent}
		>
			{#if card.chart}
				<div class="absolute top-[5%] bottom-[5%] left-[5%] right-[5%]">
					<canvas
						class="w-full! h-full!"
						width="512"
						height="512"
						use:chart={{
							config: card.chart,
							locale: getLocale(),
							show: id == currentCard && showContent
						}}
					></canvas>
				</div>
			{/if}
			<div
				class="absolute flex flex-col items-center justify-center gap-[2%]"
				style="left: {card.l ?? 2.5}%; top: {card.t ?? 2.5}%; right: {card.r ??
					2.5}%; bottom: {card.b ?? 2.5}%;"
			>
				{#if card.content}
					{#each card.content as item}
						{#if item.type == 't'}
							<div
								class="rounded-[1em] border-[0.05em] border-zinc-500 bg-zinc-700/90 px-[4%] py-[1%] text-center text-[0.7em]"
								style="transform: rotate({item.rotation ?? 0}deg) translate({item.x ??
									0}%);margin-top: {item.t ?? 0}%;margin-bottom: {item.b ?? 0}%;{item.max
									? `
									max-height: ${item.max}%;`
									: ''}"
							>
								{@html hackText(item.text)}
							</div>
						{:else if item.type == 'b'}
							<div
								class="rounded-[0.5em] text-center font-semibold"
								style="transform: rotate({item.rotation ?? 0}deg) translate({item.x ??
									0}%);background-color: {item.bg};margin-top: {item.t ??
									0}%;margin-bottom: {item.b ?? 0}%;{item.color
									? `color: ${item.color};`
									: ''};padding-left: {item.px ?? 4.5}%;padding-right: {item.px ??
									4.5}%;padding-top: {item.py ?? 1.5}%;padding-bottom: {item.py ??
									1.5}%;min-width: {item.minX ?? 1}%;"
							>
								{@html item.text}
							</div>
						{/if}
					{/each}
				{/if}
			</div>
			{#if card.swarm || card.leftTeeSkin || card.rightTeeSkin}
				<div class="absolute top-[2.5%] bottom-[2.5%] left-[2.5%] right-[2.5%]">
					{#if card.swarm}
						{#each card.swarm as swarm}
							<div
								class="absolute h-[20%] w-[20%]"
								class:tee-swarm={showContent && id == currentCard}
								style="{swarm.t != null ? `top: ${swarm.t - 10}%;` : ''}{swarm.l != null
									? `left: ${swarm.l - 10}%;`
									: ''}{swarm.r != null ? `right: ${swarm.r - 10}%;` : ''}{swarm.b != null
									? `bottom: ${swarm.b - 10}%;`
									: ''}--delay: {swarm.delay}s;--vx: {-swarm.vx * 100}px;--vy: {-swarm.vy * 100}px;"
							>
								<TeeRender
									name={swarm.skin.n}
									body={swarm.skin.b}
									feet={swarm.skin.f}
									emote={swarm.emote}
									className="h-full w-full"
									pose={genPose(swarm.angle, swarm.var)}
								/>
							</div>
						{/each}
					{/if}
					{#if card.leftTeeSkin}
						<div
							class="motion-duration-500 motion-delay-700 absolute left-[-10.5%] h-[20%] w-[20%]"
							style="top: {card.leftTeeTop ?? 0}%"
							class:motion-translate-x-in-[-75%]={showContent && id == currentCard}
							class:motion-translate-x-out-[-75%]={!showContent && id != currentCard}
							class:motion-rotate-in-[-12deg]={showContent && id == currentCard}
							class:motion-rotate-out-[-12deg]={!showContent && id != currentCard}
						>
							<TeeRender
								name={card.leftTeeSkin.n}
								body={card.leftTeeSkin.b}
								feet={card.leftTeeSkin.f}
								className="h-full w-full"
								pose={leftTeePose}
							/>
						</div>
					{/if}
					{#if card.rightTeeSkin}
						<div
							class="motion-duration-500 motion-delay-700 absolute right-[-9.5%] h-[20%] w-[20%]"
							style="top: {card.rightTeeTop ?? 0}%"
							class:motion-translate-x-in-[75%]={showContent && id == currentCard}
							class:motion-translate-x-out-[75%]={!showContent && id != currentCard}
							class:motion-rotate-in-[12deg]={showContent && id == currentCard}
							class:motion-rotate-out-[12deg]={!showContent && id != currentCard}
						>
							<TeeRender
								name={card.rightTeeSkin.n}
								body={card.rightTeeSkin.b}
								feet={card.rightTeeSkin.f}
								className="h-full w-full"
								pose={rightTeePose}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet noBlurRegularFormat(id: number, card: CardData)}
	<div
		class="motion-delay-700 flex h-full w-full items-center justify-center text-[0.8em]"
		class:motion-opacity-in-0={id == currentCard}
		class:motion-opacity-out-0={id != currentCard}
	>
		<div
			class="absolute flex flex-col items-center justify-center gap-[2%] transition-opacity"
			class:opacity-0={!showContent}
			style="left: {card.l ?? 2.5}%; top: {card.t ?? 2.5}%; right: {card.r ??
				2.5}%; bottom: {card.b ?? 2.5}%;"
		>
			{#if card.content}
				{#each card.content as item}
					{#if item.type == 't'}
						<div class="rounded-[1em] bg-zinc-700/80 px-2 py-1 text-center text-[0.7em]">
							{@html item.text}
						</div>
					{:else if item.type == 'b'}
						<div
							class="rounded-[0.5em] px-4 py-2 text-center font-semibold"
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
	{@const titleCount = totalCards?.titles.length || 0}
	<div class="flex h-full w-full items-center justify-center text-[0.6em]">
		<div
			class="absolute top-[2%] right-[2%] bottom-[2%] left-[2%] flex flex-col items-center justify-center gap-[2%]"
		>
			<div
				class="absolute top-0 right-0 bottom-[35%] left-0 flex flex-col grow items-center rounded-[1em] border-[0.1em] border-white/20 overflow-hidden"
				style:box-shadow={'inset 0 0 4em 0.25em #00000088;'}
			>
				<div
					class="w-full font-semibold text-white bg-black/50 shadow-xl shadow-black/30 text-center p-[0.5%]"
				>
					{m.page_badges_for({ year: data.year, name: data.name! })}
				</div>

				<div
					class="flex grow w-full flex-row flex-wrap place-content-evenly content-evenly justify-evenly"
					class:text-[0.9em]={titleCount < 10}
					class:text-[0.8em]={titleCount >= 10 && titleCount < 15}
					class:text-[0.7em]={titleCount >= 15 && titleCount < 20}
					class:text-[0.6em]={titleCount >= 20 && titleCount < 30}
					class:text-[0.5em]={titleCount >= 30}
				>
					{#if totalCards?.titles}
						{#each totalCards.titles as title}
							<span
								class="rounded-[1em] border-[0.1em] border-t-white/30 border-l-white/30 bg-zinc-800/30 border-black/30 px-[2%] py-[0.25%] text-center font-semibold text-nowrap"
								style="background-color: {title.bg};{title.color ? `color: ${title.color};` : ''}"
							>
								{title.text}
							</span>
						{/each}
					{/if}
				</div>
			</div>
			<div
				class="motion-duration-500 motion-delay-700 absolute top-[70%] left-[-9%] h-[20%] w-[20%]"
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
					pose={leftTeePose}
				/>s
			</div>
			<div
				class="motion-duration-500 motion-delay-1500 absolute right-[2.5%] bottom-[2.5%] flex h-[30%] w-[30%]"
				class:motion-opacity-in-0={id == currentCard}
			>
				<div
					class="absolute top-0 left-0 h-full w-full rounded-[0.8em] bg-cover bg-center bg-[#77bdfa] overflow-hidden border-blue-800/10 border-[0.2em]"
				>
					<div
						style="background-image: url({shareableQRCode});"
						class="w-full h-full bg-cover bg-center mix-blend-overlay"
					></div>
				</div>
				<div class="absolute bottom-0 w-full flex flex-row items-center justify-center">
					<div
						class="flex flex-row items-center justify-center rounded-[0.8em] border border-t-white/30 border-l-white/30 border-black/30 translate-y-[50%] px-[3%] py-[1%] text-center text-[0.65em] text-nowrap text-white gap-1 transition-colors"
						class:bg-red-600={shareError}
						class:bg-green-600={shareInfo}
						class:bg-blue-600={!shareError && !shareInfo}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="1.1em"
							height="1.1em"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-clipboard-copy-icon lucide-clipboard-copy"
							><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path
								d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
							/><path d="M16 4h2a2 2 0 0 1 2 2v4" /><path d="M21 14H11" /><path
								d="m15 10-4 4 4 4"
							/></svg
						>
						{#if shareError}
							{shareError}
						{:else if shareInfo}
							{shareInfo}
						{:else}
							{isMobile() ? m.page_to_share_mobile() : m.page_to_share()}
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
{#key pageKey}
	<div class="fixed top-0 right-0 bottom-0 left-0">
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
						{@const format = getFormat(card.format)}
						{@render cardSnippet(i, card, format)}
					{/each}
				{/if}
				<div class="h-svh"></div>
			</div>

			{#if data.player && cardReady}
				<div
					class="absolute top-0 left-0 z-20 max-w-[calc(100%-72px)] rounded-br-xl bg-blue-600 shadow-lg shadow-blue-800/60 px-4 py-2 font-semibold -motion-translate-x-in-100 motion-delay-700 motion-duration-700"
				>
					{m.page_ddnet_recap_for({ year: data.year, player: data.player.name })}
				</div>

				<div class="absolute right-0 bottom-0 left-0 z-20 flex flex-row">
					<a
						data-sveltekit-replacestate
						href="/"
						class="-motion-translate-x-in-100 motion-duration-500 motion-delay-100 rounded-tr-xl backdrop-blur-xs flex items-center justify-center bg-black/80 pl-2 pr-4 py-1.5 text-sm text-white hover:bg-zinc-900 gap-1"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-arrow-left-icon lucide-arrow-left"
							><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg
						>
						{m.page_change_name()}
					</a>
				</div>
			{/if}

			{#if currentCard == 0 && !startAnimation}
				<div
					class="absolute right-0 bottom-[8%] left-0 z-20 flex items-center justify-center text-[7svw] sm:text-[4svh]"
					out:fade
					in:fade
				>
					<div class="motion-preset-oscillate text-[0.7em]">
						{isMobile() ? m.page_continue_mobile() : m.page_continue()}
					</div>
				</div>
			{/if}
		</div>
		{#if !totalCards || !cardReady || error}
			<div
				class="absolute z-50 flex h-full w-full items-center justify-center bg-zinc-800 px-2"
				out:fade
				in:fade
			>
				<div
					class="relative w-100 overflow-hidden rounded-[0.8em] border border-zinc-600 bg-zinc-700 shadow-md transition-all duration-500"
				>
					<div
						class="relative flex h-32 items-center justify-center overflow-hidden rounded-t-lg z-10 shadow-lg shadow-[#154482]"
						style="background: linear-gradient(180deg, #0f233d 0%, #132e52 25%, #143561 50%, #163f75 75%, #154482 100%);"
					>
						<!-- Animated shine effect -->
						<div
							class="motion-opacity-loop-30 motion-duration-5000 w-full h-full absolute"
							style="background: linear-gradient(to bottom, transparent, #3175ce99, transparent);"
						></div>
						{#if error}
							<div
								class="motion-preset-shake rounded-3xl bg-red-700/40 px-8 py-4 text-xl font-bold text-white backdrop-blur-xs"
							>
								UNKNOWN_ERROR
							</div>
						{:else}
							<div class="relative z-10">
								<div class="rounded-2xl px-8 py-4 text-center">
									<div
										class="w-full flex items-center justify-center text-xl font-extrabold text-nowrap mb-1 text-amber-300"
									>
										<div>
											<div class="absolute glow-text">
												{m.page_happy_new_year()}
											</div>
											{m.page_happy_new_year()}
										</div>
									</div>
									<div
										class="text-xl font-bold tracking-wide text-white text-shadow-lg text-shadow-black/30"
									>
										{m.page_ddnet_recap({ year: data.year })}
									</div>
									<div class="text-sm mt-2 font-normal text-shadow-lg text-shadow-black/30">
										{m.page_powered_by()}
										<a
											class="hover:brightness-125 transition-all font-medium text-orange-400"
											href="https://teeworlds.cn">teeworlds.cn</a
										>
									</div>
								</div>
							</div>
						{/if}
					</div>
					<div class="h-55 flex items-center px-8 py-4">
						<div class="w-full">
							{#if error}
								<div class="flex w-full flex-col items-center justify-center gap-4">
									<div class="flex flex-col">
										<button
											class="motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-200 rounded bg-blue-500 px-4 py-2 text-nowrap text-white hover:bg-blue-600"
											onclick={() => goto(``)}
										>
											{m.page_go_back()}
										</button>
									</div>
								</div>
							{:else if data.player}
								{#if loadingProgress >= 0}
									<div
										class="flex w-full flex-col items-center justify-center gap-2"
										out:fade
										in:fade
									>
										<div class="font-bold">
											{m.page_ddnet_recap_for({ year: data.year, player: data.name })}
										</div>
										<div class="flex flex-row items-center justify-center gap-2">
											<div>{m.page_loading()}</div>
											<div class="w-[3.5rem]text-center">{Math.round(loadingProgress * 100)}%</div>
										</div>
										<div
											class="h-5 w-full overflow-hidden rounded border border-sky-700 bg-sky-900"
										>
											<div
												class="h-full rounded bg-sky-600 transition-all duration-300 ease-out shadow-lg shadow-sky-500/50"
												style="width: {loadingProgress *
													100}%; box-shadow: 0 0 10px rgba(14, 165, 233, 0.5), 0 0 20px rgba(14, 165, 233, 0.3), 0 0 30px rgba(14, 165, 233, 0.2);"
											></div>
										</div>
									</div>
								{:else}
									{#key data.player.name}
										<div out:fade>
											<div
												class="motion-translate-x-in-[-200%] motion-rotate-in-12 motion-duration-1000 motion-delay-100 flex flex-row items-center justify-center gap-8"
											>
												<TeeRender
													className="relative h-20 w-20"
													name={data.skin?.n}
													body={data.skin?.b}
													feet={data.skin?.f}
												/>
												<div class="flex flex-col">
													<div class="font-semibold text-zinc-300">{data.player.name}</div>
													<div>{m.page_points_info({ points: `${data.player.points} pts` })}</div>
												</div>
											</div>
											<div class="flex flex-col">
												<button
													class="motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-200 mt-2 rounded bg-blue-500 px-4 py-2 text-nowrap text-white hover:bg-blue-600 cursor-pointer"
													onclick={startProcess}
												>
													{m.page_start_recap()}
												</button>
											</div>
											<div class="h-8"></div>
											<div class="absolute right-0 bottom-0 left-0 flex flex-row">
												<a
													data-sveltekit-replacestate
													href="/"
													class="motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-300 rounded-tr bg-zinc-800 px-4 py-2 text-white hover:bg-zinc-900"
												>
													{m.page_change_name()}
												</a>
											</div>
										</div>
									{/key}
								{/if}
							{:else}
								{#key 'entry'}
									<div class="flex flex-col gap-2">
										<div class="text-sm text-zinc-300">
											{m.page_enter_player_name()}
											{#if data.error}
												<span class="motion-text-loop-red-400 text-red-500">
													{data.error}
												</span>
											{/if}
										</div>
										<input
											type="text"
											class="w-full rounded border border-zinc-500 bg-zinc-600 px-3 py-2 text-sm font-normal shadow-md md:flex-1"
											bind:value={gotoName}
											onkeydown={(ev) => {
												if (ev.key == 'Enter') {
													if (gotoName) goForName(gotoName);
												}
											}}
										/>
										<button
											class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50
										cursor-pointer"
											onclick={() => {
												if (gotoName) goForName(gotoName);
											}}
										>
											{m.page_go()}
										</button>
										<div class="text-sm">
											{m.page_database_time({
												date: datetime(
													new Date(data.databaseTime * 1000),
													data.tz ?? DateTime.local().zoneName,
													getLocale()
												)
											})}
										</div>
									</div>
								{/key}
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if totalCards && cardReady && !error && !startAnimation}
			<div
				class="fixed right-0.5 top-1/2 transform -translate-y-1/2 z-30 flex flex-col items-center gap-2 w-3"
			>
				{#each totalCards.cards as _, i}
					<div
						aria-label="card {i + 1}"
						style="--n: {i * 25}ms"
						class="w-2 h-2 rounded-full transition-all duration-300 motion-opacity-in-0 border border-blue-100/50 motion-scale-in-0 motion-delay-(--n) shadow shadow-black/50
					
						{i === currentCard ? 'w-3 h-3 bg-linear-to-r from-blue-400 to-teal-400' : 'bg-white/10'}"
					></div>
				{/each}
			</div>
		{/if}

		<!-- Coffee button moved to same layer as timezone -->
		<a
			href={getLocale() == 'zh-CN'
				? `https://ifdian.net/order/create?user_id=86452e60dba811ed862c5254001e7c00&remark=${encodeURIComponent(`为 TWCN ${CURRENT_YEAR} 年度总结打赏`)}&affiliate_code=ddnet`
				: 'https://ko-fi.com/tsfreddie'}
			class="absolute z-100 right-0 top-0 rounded-bl-xl bg-purple-600 px-3 py-2 text-white hover:bg-purple-800 hover:duration-200 shadow-lg shadow-purple-800/40 flex items-center gap-2 group text-sm transition-all duration-700 ease-in-out"
			class:translate-x-[calc(100%-42px)]={cardReady}
			title="Buy me a coffee"
			target="_blank"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="lucide lucide-coffee-icon lucide-coffee"
				><path d="M10 2v2" /><path d="M14 2v2" /><path
					d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"
				/><path d="M6 2v2" /></svg
			>
			<span class="transition-opacity duration-300 whitespace-nowrap" class:opacity-0={cardReady}>
				{m.page_donate()}
			</span>
		</a>

		<div
			class="absolute z-100 right-0 bottom-0 rounded-tl-xl bg-blue-500 pl-4 pr-2 py-0.5 flex items-center gap-4"
		>
			<div class="text-xs flex flex-col items-center justify-center">
				<div>{m.page_timezone()}</div>
				<div>{data.tz ?? DateTime.local().zoneName}</div>
			</div>
			<div class="relative">
				<button
					class="text-white cursor-pointer font-semibold flex items-center gap-1 text-sm"
					onclick={() => (dropdownOpen = !dropdownOpen)}
					onblur={() => setTimeout(() => (dropdownOpen = false), 100)}
				>
					{locales.find((l) => l.code === getLocale())?.name ?? getLocale()}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="lucide lucide-chevron-up-icon lucide-chevron-up"><path d="m18 15-6-6-6 6" /></svg
					>
				</button>
				{#if dropdownOpen}
					<div
						in:slide={{ duration: 300, easing: easeOut }}
						class="absolute bottom-full text-sm right-0 mb-1 bg-slate-600/70 backdrop-blur-xs rounded-lg shadow-lg z-10 grid grid-cols-2 min-w-72 overflow-hidden"
					>
						{#each locales as locale}
							<button
								class="border-b border-r border-slate-800 text-left w-full px-3 py-1.5 text-white text-nowrap hover:bg-slate-700 cursor-pointer {locale.code ===
								getLocale()
									? 'bg-slate-500'
									: ''}"
								onclick={async () => {
									scrollVersion = -100;
									setLocale(locale.code, { reload: false });
									let regen = cardReady;
									await goto(page.url, { replaceState: true, invalidateAll: true });
									scrollVersion = 0;
									pageKey++;
									dropdownOpen = false;
									if (regen) startProcess();
								}}
							>
								{locale.name}
								{#if locale.sub}
									<span class="text-xs text-slate-400 tracking-tighter">({locale.sub})</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/key}

<style>
	@keyframes glow {
		0% {
			opacity: 0.2;
		}
		50% {
			opacity: 1;
		}
		100% {
			opacity: 0.2;
		}
	}

	@keyframes teeIn {
		0% {
			transform: translateX(var(--vx)) translateY(var(--vy));
		}
		100% {
			transform: translateX(0) translateY(0);
		}
	}

	.tee-swarm {
		animation: teeIn 0.5s ease-out forwards;
		animation-delay: var(--delay);
		transform: translateX(var(--vx)) translateY(var(--vy));
	}

	.glow-text {
		animation: glow 3.5s ease-in-out infinite;
		text-shadow:
			0 0 40px rgba(255, 195, 106, 1),
			0 0 20px rgba(255, 203, 92, 1),
			0 2px 8px rgba(0, 0, 0, 0.9),
			0 4px 16px rgba(255, 195, 85, 1);
	}
</style>
