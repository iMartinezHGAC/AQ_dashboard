<script lang="ts">
	import { AQI_SCALE } from '#lib/aqi.ts';
</script>

<div class="border-b border-slate-200 p-4">
	<div class="flex h-2 w-full overflow-hidden rounded-full">
		{#each AQI_SCALE as band (band.category)}
			<span class="h-full flex-1" style:background-color={band.color} title={band.category}></span>
		{/each}
	</div>
	<div class="mt-1.5 flex justify-between text-xs text-slate-500">
		<span>Good</span>
		<span>Hazardous</span>
	</div>
</div>
