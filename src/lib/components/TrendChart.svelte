<script lang="ts">
	import type { ObservationPoint, TimeRange } from '#lib/arcgis.ts';

	interface Props {
		title: string;
		unit: string;
		data: ObservationPoint[];
		range: TimeRange;
		loading: boolean;
	}

	let { title, unit, data, range, loading }: Props = $props();

	const WIDTH = 600;
	const HEIGHT = 240;
	const MARGIN = { top: 12, right: 16, bottom: 28, left: 40 };
	const plotW = WIDTH - MARGIN.left - MARGIN.right;
	const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

	let showTable = $state(false);
	let hoverIndex = $state<number | null>(null);
	let svgEl: SVGSVGElement = $state()!;

	let xDomain = $derived.by((): [number, number] => {
		if (data.length === 0) return [0, 1];
		return [data[0].t, data[data.length - 1].t];
	});

	let yDomain = $derived.by((): [number, number] => {
		if (data.length === 0) return [0, 1];
		const values = data.map((d) => d.v);
		const min = Math.min(0, ...values);
		const max = Math.max(...values);
		return max === min ? [min, min + 1] : [min, max];
	});

	function xScale(t: number): number {
		const [d0, d1] = xDomain;
		if (d1 === d0) return MARGIN.left;
		return MARGIN.left + ((t - d0) / (d1 - d0)) * plotW;
	}

	function yScale(v: number): number {
		const [d0, d1] = yDomain;
		if (d1 === d0) return MARGIN.top + plotH;
		return MARGIN.top + plotH - ((v - d0) / (d1 - d0)) * plotH;
	}

	let linePath = $derived(
		data.length === 0
			? ''
			: data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.t)},${yScale(d.v)}`).join(' ')
	);

	let areaPath = $derived(
		data.length === 0
			? ''
			: `${linePath} L${xScale(data[data.length - 1].t)},${MARGIN.top + plotH} L${xScale(data[0].t)},${MARGIN.top + plotH} Z`
	);

	let yTicks = $derived.by(() => {
		const [d0, d1] = yDomain;
		const count = 4;
		return Array.from({ length: count + 1 }, (_, i) => d0 + ((d1 - d0) * i) / count);
	});

	// Day/month buckets are UTC calendar boundaries, not specific instants -- format them
	// in UTC so a day/month name never shifts across the viewer's local timezone offset.
	function formatTick(t: number): string {
		const date = new Date(t);
		if (range === '24h') {
			return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		}
		if (range === 'month') {
			return date.toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				timeZone: 'UTC'
			});
		}
		return date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
	}

	function formatFull(t: number): string {
		const date = new Date(t);
		if (range === '24h') return date.toLocaleString();
		if (range === 'month') {
			return date.toLocaleDateString(undefined, {
				month: 'long',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC'
			});
		}
		return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
	}

	let xTicks = $derived.by(() => {
		if (data.length === 0) return [];
		const count = Math.min(5, data.length);
		return Array.from({ length: count }, (_, i) => {
			const idx = Math.round((i / Math.max(1, count - 1)) * (data.length - 1));
			return data[idx];
		});
	});

	function handlePointerMove(e: PointerEvent) {
		if (data.length === 0) return;
		const rect = svgEl.getBoundingClientRect();
		const scaleX = WIDTH / rect.width;
		const px = (e.clientX - rect.left) * scaleX;
		let nearest = 0;
		let nearestDist = Infinity;
		for (let i = 0; i < data.length; i++) {
			const dist = Math.abs(xScale(data[i].t) - px);
			if (dist < nearestDist) {
				nearestDist = dist;
				nearest = i;
			}
		}
		hoverIndex = nearest;
	}

	function handlePointerLeave() {
		hoverIndex = null;
	}

	let hovered = $derived(hoverIndex != null ? data[hoverIndex] : null);
</script>

<div class="viz-root rounded-lg border border-slate-200 bg-white p-4">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold text-slate-700">{title}</h3>
		<button
			type="button"
			class="text-xs text-slate-500 underline hover:text-slate-700"
			onclick={() => (showTable = !showTable)}
		>
			{showTable ? 'Show chart' : 'View as table'}
		</button>
	</div>

	{#if loading}
		<div class="flex h-[240px] items-center justify-center text-sm text-slate-400">Loading…</div>
	{:else if data.length === 0}
		<div class="flex h-[240px] items-center justify-center text-sm text-slate-400">
			No data for this period
		</div>
	{:else if showTable}
		<div class="mt-2 max-h-[240px] overflow-y-auto">
			<table class="w-full text-left text-xs">
				<thead class="sticky top-0 bg-white text-slate-500">
					<tr><th class="py-1">Time</th><th class="py-1">Value ({unit})</th></tr>
				</thead>
				<tbody>
					{#each data as d (d.t)}
						<tr class="border-t border-slate-100">
							<td class="py-1">{formatFull(d.t)}</td>
							<td class="py-1 tabular-nums">{d.v.toFixed(1)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<svg
			bind:this={svgEl}
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			class="mt-1 w-full touch-none"
			role="img"
			aria-label={`${title} trend chart`}
			onpointermove={handlePointerMove}
			onpointerleave={handlePointerLeave}
		>
			{#each yTicks as tick (tick)}
				<line
					x1={MARGIN.left}
					x2={WIDTH - MARGIN.right}
					y1={yScale(tick)}
					y2={yScale(tick)}
					stroke="var(--gridline)"
					stroke-width="1"
				/>
				<text
					x={MARGIN.left - 8}
					y={yScale(tick)}
					text-anchor="end"
					dominant-baseline="middle"
					class="axis-label"
				>
					{Math.round(tick)}
				</text>
			{/each}

			{#each xTicks as d (d.t)}
				<text x={xScale(d.t)} y={HEIGHT - 8} text-anchor="middle" class="axis-label">
					{formatTick(d.t)}
				</text>
			{/each}

			<path d={areaPath} fill="var(--series-1)" opacity="0.1" />
			<path
				d={linePath}
				fill="none"
				stroke="var(--series-1)"
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>

			{#if hovered}
				<line
					x1={xScale(hovered.t)}
					x2={xScale(hovered.t)}
					y1={MARGIN.top}
					y2={MARGIN.top + plotH}
					stroke="var(--baseline)"
					stroke-width="1"
				/>
				<circle
					cx={xScale(hovered.t)}
					cy={yScale(hovered.v)}
					r="4"
					fill="var(--series-1)"
					stroke="white"
					stroke-width="2"
				/>
			{/if}
		</svg>

		{#if hovered}
			<div class="pointer-events-none mt-1 text-xs text-slate-600">
				<span class="font-semibold text-slate-900 tabular-nums">{hovered.v.toFixed(1)} {unit}</span>
				<span class="ml-2 text-slate-500">{formatFull(hovered.t)}</span>
			</div>
		{/if}
	{/if}
</div>

<style>
	.viz-root {
		--series-1: #2a78d6;
		--gridline: #e1e0d9;
		--baseline: #c3c2b7;
	}
	@media (prefers-color-scheme: dark) {
		.viz-root {
			--series-1: #3987e5;
			--gridline: #2c2c2a;
			--baseline: #383835;
		}
	}
	.axis-label {
		font-size: 10px;
		fill: #898781;
	}
</style>
