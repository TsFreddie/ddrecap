<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<svelte:head>
	<title>NO WAY</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-zinc-800">
	<div class="max-w-md w-full space-y-8 p-8">
		<div>
			<h2 class="mt-6 text-center text-3xl font-extrabold text-zinc-300">
				You are early. Please come back later.
			</h2>
		</div>

		<form method="POST" use:enhance class="mt-8 space-y-6">
			<div class="flex space-x-2">
				<div class="flex-1">
					<label for="access" class="sr-only">Access</label>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="access"
						name="access"
						type="text"
						autocomplete="off"
						required
						class="text-center appearance-none relative block w-full px-3 py-2 border border-zinc-600 placeholder-zinc-500 text-zinc-300 bg-zinc-700 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10"
						placeholder=""
						autofocus
						style="-webkit-text-security: disc; -moz-text-security: disc; text-security: disc;"
					/>
				</div>
				<button
					type="submit"
					class="group relative flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="lucide lucide-chevron-right-icon lucide-chevron-right"
						><path d="m9 18 6-6-6-6" /></svg
					>
				</button>
			</div>

			{#if form?.missing}
				<div class="text-red-400 text-sm text-center">Access is required</div>
			{/if}

			{#if form?.incorrect}
				<div class="text-red-400 text-sm text-center">Incorrect access</div>
			{/if}
		</form>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}
</style>
