<script lang="ts">
	import TeeRender from '$lib/components/TeeRender.svelte';
	import { genPose } from '$lib/pose';

	let angle = $state(270);
	let randomValue = $state(0.5);

	const pose = $derived(genPose(angle, randomValue));
</script>

<div class="container">
	<h1>Pose Generator Test</h1>

	<div class="controls">
		<label>
			Angle: {angle}°
			<input type="range" bind:value={angle} min="0" max="360" step="1" />
		</label>

		<label>
			Random Value: {randomValue.toFixed(2)}
			<input type="range" bind:value={randomValue} min="0" max="1" step="0.01" />
		</label>
	</div>

	<div class="tee-container">
		<TeeRender useDefault {pose} />
	</div>
</div>

<div class="preCont">
	<pre class="w-full">{JSON.stringify(pose, null, 2)}</pre>
</div>

<style>
	.container {
		padding: 2rem;
		max-width: 800px;
		margin: 0 auto;
	}

	.preCont {
		padding: 2rem;
		max-width: 1000px;
		margin: 0 auto;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.controls label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.controls input[type='range'] {
		width: 100%;
	}

	.tee-container {
		width: 128px;
		height: 128px;
		margin: 2rem auto;
		border: 1px solid #ccc;
	}

	.tee-container :global(.tee-render) {
		width: 100%;
		height: 100%;
	}

	pre {
		background: #000000;
		padding: 1rem;
		border-radius: 4px;
		overflow-x: auto;
	}
</style>
