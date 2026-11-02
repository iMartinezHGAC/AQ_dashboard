<script lang="ts">
	import type { Monitor, ObservationPoint, TimeRange } from '#lib/arcgis.ts';
	import { fetchTrend } from '#lib/arcgis.ts';
	import TrendChart from './TrendChart.svelte';

	interface Props {
		monitor: Monitor | null;
	}

	let { monitor }: Props = $props();

	let range = $state<TimeRange>('24h');
	let ozoneData = $state<ObservationPoint[]>([]);
	let pm25Data = $state<ObservationPoint[]>([]);
	let loading = $state(false);

	const RANGE_TABS: { key: TimeRange; label: string }[] = [
		{ key: '24h', label: 'Past 24 Hours' },
		{ key: 'month', label: 'Past Month' },
		{ key: 'year', label: 'Past Year' }
	];

	function chartTitle(parameter: 'Ozone' | 'PM2.5'): string {
		if (range === '24h') return parameter;
		const grain = range === 'month' ? 'by Day' : 'by Month';
		return `Average ${parameter} ${grain}`;
	}

	$effect(() => {
		const current = monitor;
		const currentRange = range;
		if (!current) {
			ozoneData = [];
			pm25Data = [];
			return;
		}

		let cancelled = false;
		loading = true;

		(async () => {
			const wantsOzone = current.capabilities !== 'PM2.5';
			const wantsPm25 = current.capabilities !== 'Ozone';

			const [ozone, pm25] = await Promise.all([
				wantsOzone ? fetchTrend(current.id, 'Ozone', currentRange) : Promise.resolve([]),
				wantsPm25 ? fetchTrend(current.id, 'PM2.5', currentRange) : Promise.resolve([])
			]);

			if (cancelled) return;
			ozoneData = ozone;
			pm25Data = pm25;
			loading = false;
		})().catch((err) => {
			if (!cancelled) {
				console.error('Failed to load trend data', err);
				loading = false;
			}
		});

		return () => {
			cancelled = true;
		};
	});
</script>

<div class="border-t border-slate-200 bg-slate-50 p-4">
	{#if !monitor}
		<p class="text-sm text-slate-500">
			Select a monitor on the map or in the list to see its trends.
		</p>
	{:else}
		<div class="mb-3 flex gap-1">
			{#each RANGE_TABS as tab (tab.key)}
				<button
					type="button"
					class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
					class:bg-white={range === tab.key}
					class:shadow-sm={range === tab.key}
					class:text-slate-900={range === tab.key}
					class:text-slate-500={range !== tab.key}
					onclick={() => (range = tab.key)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			{#if monitor.capabilities !== 'PM2.5'}
				<TrendChart title={chartTitle('Ozone')} unit="ppb" data={ozoneData} {range} {loading} />
			{/if}
			{#if monitor.capabilities !== 'Ozone'}
				<TrendChart title={chartTitle('PM2.5')} unit="µg/m³" data={pm25Data} {range} {loading} />
			{/if}
		</div>
	{/if}
</div>
