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
			<div class="rounded-md shadow-sm -space-y-px">
				<div>
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
