<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { encodeAsciiURIComponent } from '$lib/link';
	import { fade } from 'svelte/transition';
	import { uaIsMobile } from '$lib/helpers';
	import * as qrcode from 'qrcode';
	import { encode } from 'msgpackr';
	import { encodeBase64Url } from '$lib/base64url';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import TeeRender from '$lib/components/TeeRender.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { YearlyData } from '$lib/query-engine.worker';
	import QueryWorker from '$lib/query-engine.worker?worker';
	import { DateTime } from 'luxon';
	import { generateCards, type CardData } from '$lib/cards';

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

	let timer: NodeJS.Timeout | null = null;

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
			loadingProgress = 0.1;

			// process player data
			const result = await new Promise<{
				db: Uint8Array;
				data: Partial<YearlyData>;
			}>((resolve) => {
				let queryWorker = new QueryWorker();
				queryWorker.postMessage({ maps, name, year: data.year, tz: data.tz });
				queryWorker.onmessage = (e) => {
					if (e.data.type == 'progress') {
						loadingProgress = 0.05 + (e.data.progress / 100) * 0.95;
					} else if (e.data.type == 'result') {
						resolve(e.data.result);
					}
				};
			});

			// download the blob
			// const blob = new Blob([result.db as any], { type: 'application/x-sqlite3' });
			// const url = URL.createObjectURL(blob);
			// const a = document.createElement('a');
			// a.href = url;
			// a.download = `${name}.sqlite`;
			// a.click();
			// URL.revokeObjectURL(url);

			d = result.data;
			totalCards = await generateCards(maps!, data, d, m);
		} catch (e) {
			error = true;
			console.error(e);
		}

		const code = encodeBase64Url(encode({ n: data.name, y: data.year, t: data.tz }) as any);
		const url = new URL(window.location.href);
		url.search = `?code=${code}`;
		replaceState(url.toString(), page.state);
		shareableUrl = url.toString();
		shareableQRCode = await qrcode.toDataURL(url.toString());

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
			const timezone = DateTime.local().zoneName;
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
</script>

<div></div>
<svelte:window onresize={onResize} />

<svelte:head>
	{#if data.name}
		<title>{data.name} - {m.ddnet_recap()} {data.year}</title>
	{:else}
		<title>{m.ddnet_recap()} {data.year}</title>
	{/if}
</svelte:head>

{#snippet cardSnippet(id: number, card: CardData, format: CardFormat)}
	<div
		id="card-{id}"
		class="card relative mx-auto my-8 aspect-square max-w-full text-[7svw] transition-[scale] select-none sm:h-[70%] sm:text-[4svh]"
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
				class="absolute right-[5%] bottom-[-5%] left-[5%] flex flex-row flex-nowrap text-[0.6em]"
			>
				{#each card.titles as title, i}
					<div
						class="m-[1%] rounded-3xl border border-white/50 px-[4%] py-[1%] text-center font-semibold text-nowrap"
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
		class="motion-delay-700 flex h-full w-full items-center justify-center text-[0.8em] transition-[backdrop-filter]"
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
					class="motion-duration-500 motion-delay-700 absolute left-[-12.5%] h-[20%] w-[20%]"
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
						pose={leftTeePose}
					/>
				</div>
			{/if}
			{#if card.rightTeeSkin}
				<div
					class="motion-duration-500 motion-delay-700 absolute right-[-12.5%] h-[20%] w-[20%]"
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
		class="motion-delay-700 flex h-full w-full items-center justify-center text-[0.8em]"
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
			class="absolute top-[2%] right-[2%] bottom-[2%] left-[2%] flex flex-col items-center justify-center gap-[3%]"
		>
			<div
				class="absolute top-0 right-0 bottom-[35%] left-0 flex grow items-center justify-center rounded-xl border-[0.25em] border-sky-200/60 bg-sky-100/90 pt-[7%]"
			>
				<div class="flex w-full flex-row flex-wrap items-center justify-center">
					{#if totalCards?.titles}
						{#each totalCards.titles as title}
							<span
								class="m-[1%] rounded-3xl border border-black/50 px-[2%] py-[0.25%] text-center font-semibold text-nowrap"
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
				class="motion-duration-500 motion-delay-1500 absolute bottom-[2.5%] left-[7%] flex h-[30%] w-[55%] flex-row items-center justify-center"
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
			<div class="absolute right-[5%] bottom-[2.5%] flex h-[30%] w-[30%]">
				<div
					class="h-full w-full rounded-lg bg-white bg-cover bg-center"
					style="background-image: url({shareableQRCode});"
				></div>
			</div>
		</div>
	</div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
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
		<div class="absolute top-0 right-0 left-[5%] z-20 flex flex-row space-x-2">
			{#if data.player}
				<div class="rounded-b-xl bg-blue-600 px-4 py-2 font-semibold">
					{m.ddnet_recap_for({ year: data.year, player: data.player.name })}
				</div>
			{/if}
		</div>
		<div class="absolute right-0 bottom-0 left-0 z-20 flex flex-row space-y-2">
			{#if data.tz}
				<div class="absolute right-0 bottom-0 rounded-tl-xl bg-blue-500 px-4 py-2 font-semibold">
					Timezone: {data.tz}
				</div>
			{/if}
			<a
				data-sveltekit-replacestate
				href="/"
				class="motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-300 rounded-tr bg-slate-600 px-4 py-2 text-white hover:bg-slate-700"
			>
				Change name
			</a>
		</div>
		{#if currentCard == 0 && !startAnimation}
			<div
				class="absolute right-0 bottom-[5%] left-0 z-20 flex items-center justify-center text-[7svw] sm:text-[4svh]"
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
						class="motion-translate-x-loop-[800%] motion-duration-5000 absolute h-[150%] w-16 translate-x-[-400%] rotate-12 bg-slate-200/10"
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
							<div class="motion-scale-loop-[110%] motion-duration-2000 w-full text-red-300">
								{m.happy_new_year()}
							</div>
							{m.ddnet_recap()}
							{data.year}
							<div class="text-sm">
								{m.powered_by()}
								<a class="text-orange-400 hover:text-orange-300" href="https://teeworlds.cn"
									>teeworlds.cn</a
								>
							</div>
						</div>
					{/if}
				</div>
				<div class="h-full max-h-[calc(100svh-20rem)] space-y-3 p-4">
					{#if error}
						<div class="flex h-40 w-full flex-col items-center justify-center gap-4">
							<div class="flex flex-col space-y-2">
								<button
									class="motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-200 rounded bg-blue-500 px-4 py-2 text-nowrap text-white hover:bg-blue-600"
									onclick={() => goto(``)}
								>
									Re-enter name
								</button>
							</div>
						</div>
					{:else if data.player}
						{#if loadingProgress >= 0}
							<div
								class="flex h-40 w-full flex-col items-center justify-center gap-4"
								out:fade
								in:fade
							>
								<div class="font-bold">
									{m.ddnet_recap_for({ year: data.year, player: data.name })}
								</div>
								<div class="flex flex-row items-center justify-center gap-2">
									<div>{m.loading()}</div>
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
										class="motion-translate-x-in-[-200%] motion-rotate-in-12 motion-duration-1000 motion-delay-100 flex flex-row items-center justify-center gap-8"
									>
										<TeeRender
											className="relative h-20 w-20"
											name={data.skin?.n}
											body={data.skin?.b}
											feet={data.skin?.f}
										/>
										<div class="flex flex-col">
											<div class="font-semibold text-slate-300">{data.player.name}</div>
											<div>{m.points_info({ points: `${data.player.points}pts` })}</div>
										</div>
									</div>
									<div class="flex flex-col space-y-2">
										<button
											class="motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-200 mt-2 rounded bg-blue-500 px-4 py-2 text-nowrap text-white hover:bg-blue-600"
											onclick={startProcess}
										>
											{m.start_recap()}
										</button>
									</div>
									<div class="absolute right-0 bottom-0 left-0 flex flex-row space-y-2">
										<a
											data-sveltekit-replacestate
											href="/"
											class="motion-translate-x-in-[-200%] motion-duration-1000 motion-delay-300 rounded-tr bg-slate-800 px-4 py-2 text-white hover:bg-slate-900"
										>
											{m.change_name()}
										</a>
									</div>
								</div>
							{/key}
						{/if}
					{:else}
						{#key 'entry'}
							<div class="flex flex-col space-y-2">
								<div class="text-sm text-slate-300">
									{m.enter_player_name()}
									{#if data.error}
										<span class="motion-text-loop-red-400 text-red-500">
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
									{m.go()}
								</button>
							</div>
						{/key}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
