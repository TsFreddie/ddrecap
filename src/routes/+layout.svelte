<script lang="ts">
	import { navigating } from '$app/state';
	import '../app.css';
	import favicon from '$lib/assets/favicon.png';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>DDRecap</title>
</svelte:head>

<div
	class="max-w-svw flex min-h-svh flex-col overflow-x-hidden bg-slate-800 text-slate-300 {navigating.to
		? 'opacity-60'
		: 'opacity-100'}"
	style={navigating.to ? 'transition: opacity 0.1s ease-in-out 0.1s;' : ''}
>
	{@render children()}
</div>
