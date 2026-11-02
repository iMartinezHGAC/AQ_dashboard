<script lang="ts">
	import type { Monitor } from '#lib/arcgis.ts';
	import AqiLegend from './AqiLegend.svelte';
	import MonitorCard from './MonitorCard.svelte';

	interface Props {
		monitors: Monitor[];
		selectedId: string | null;
		onselect: (id: string) => void;
	}

	let { monitors, selectedId, onselect }: Props = $props();
</script>

<aside class="flex w-full max-w-sm flex-col border-r border-slate-200 bg-white">
	<AqiLegend />
	<div class="flex-1 space-y-3 overflow-y-auto p-4">
		{#if monitors.length === 0}
			<p class="text-sm text-slate-500">No monitors match the current filters.</p>
		{/if}
		{#each monitors as monitor (monitor.id)}
			<MonitorCard {monitor} selected={monitor.id === selectedId} {onselect} />
		{/each}
	</div>
</aside>
