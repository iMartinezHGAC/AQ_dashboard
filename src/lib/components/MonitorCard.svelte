<script lang="ts">
	import type { Monitor } from '#lib/arcgis.ts';
	import { dominantReading, styleForAqi, minutesAgo, formatAge } from '#lib/aqi.ts';
	import Emoticon from './Emoticon.svelte';

	interface Props {
		monitor: Monitor;
		selected: boolean;
		onselect: (id: string) => void;
	}

	let { monitor, selected, onselect }: Props = $props();

	let reading = $derived(dominantReading(monitor));
	let style = $derived(styleForAqi(reading.aqi));

	interface PollutantDetail {
		label: string;
		aqi: number | null;
		value: number | null;
		unit: string;
		age: number | null;
	}

	let pollutants = $derived(
		[
			monitor.capabilities !== 'PM2.5'
				? ({
						label: 'Ozone',
						aqi: monitor.recentOzoneAqi,
						value: monitor.recentOzone,
						unit: 'ppb',
						age: minutesAgo(monitor.lastSeenOzone)
					} satisfies PollutantDetail)
				: null,
			monitor.capabilities !== 'Ozone'
				? ({
						label: 'PM2.5',
						aqi: monitor.recentPm25Aqi,
						value: monitor.recentPm25,
						unit: 'µg/m³',
						age: minutesAgo(monitor.lastSeenPm25)
					} satisfies PollutantDetail)
				: null
		].filter((p): p is PollutantDetail => p !== null)
	);
</script>

<button
	type="button"
	class="block w-full rounded-lg border-2 p-4 text-left shadow-sm transition-shadow hover:shadow-md"
	style:background-color={style.color}
	style:color={style.textColor}
	style:border-color={selected ? style.textColor : 'transparent'}
	onclick={() => onselect(monitor.id)}
>
	<div class="flex items-center gap-3">
		<Emoticon type={style.emoticon} class="h-10 w-10 shrink-0" />
		<div>
			<div class="font-bold">{monitor.siteName}</div>
			<div class="text-sm opacity-90">Air Quality: {style.category}</div>
		</div>
	</div>

	<div class="mt-3 grid gap-2" style:grid-template-columns={`repeat(${pollutants.length}, 1fr)`}>
		{#each pollutants as p (p.label)}
			<div class="rounded-md bg-white/60 p-2 text-xs">
				<div class="flex justify-between font-semibold">
					<span>{p.label}</span>
				</div>
				<div class="mt-1 flex justify-between">
					<span>AQI:</span>
					<span>{p.aqi ?? '—'}</span>
				</div>
				<div class="flex justify-between">
					<span>Concentration:</span>
					<span>{p.value != null ? `${p.value} ${p.unit}` : '—'}</span>
				</div>
				<div class="mt-1 text-[0.65rem] opacity-80">{formatAge(p.age)}</div>
			</div>
		{/each}
	</div>

	<div class="mt-3 rounded-md bg-white/70 p-2 text-xs text-slate-800">
		<div class="font-semibold">Health Recommendations</div>
		<div class="mt-0.5">{style.recommendation}</div>
	</div>

	<div class="mt-2 text-[0.65rem] opacity-70">Source: {monitor.agencyName}</div>
</button>
