<script lang="ts">
	import { navigating } from '$app/state';
	import '../app.css';

	let { children } = $props();
</script>

<div
	class="max-w-svw flex min-h-svh flex-col overflow-x-hidden bg-slate-800 text-slate-300 {navigating.to
		? 'opacity-60'
		: 'opacity-100'}"
	style={navigating.to ? 'transition: opacity 0.1s ease-in-out 0.1s;' : ''}
>
	{@render children()}
</div>
