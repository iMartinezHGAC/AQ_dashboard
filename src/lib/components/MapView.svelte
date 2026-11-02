<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Map as MaplibreMap, Marker } from 'maplibre-gl';
	import type { Monitor } from '#lib/arcgis.ts';
	import { dominantReading, styleForAqi } from '#lib/aqi.ts';

	interface Props {
		monitors: Monitor[];
		selectedId: string | null;
		onselect: (id: string) => void;
	}

	let { monitors, selectedId, onselect }: Props = $props();

	let container: HTMLDivElement;
	let map: MaplibreMap | undefined;
	// Imperative bookkeeping for DOM markers, not template state -- doesn't need Svelte reactivity.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	let markers = new Map<string, Marker>();
	let MaplibreCtor: typeof import('maplibre-gl') | undefined;

	const HOUSTON_BOUNDS: [[number, number], [number, number]] = [
		[-96.8727, 28.381],
		[-94.3524, 31.0668]
	];

	// Shape encodes data source, not pollutant capability: TCEQ (EPA/AirNow feed) = circle,
	// Harris County Pollution Control (HCPCS feed) = triangle.
	function shapeClipPath(agencyGroup: Monitor['agencyGroup']): string {
		if (agencyGroup === 'HCPCS') return 'polygon(50% 0%, 0% 100%, 100% 100%)'; // triangle
		return 'circle(50% at 50% 50%)'; // circle (EPA/TCEQ)
	}

	function buildMarkerEl(monitor: Monitor, isSelected: boolean): HTMLDivElement {
		const style = styleForAqi(dominantReading(monitor).aqi);
		const el = document.createElement('div');
		el.setAttribute('role', 'button');
		el.setAttribute('aria-label', `${monitor.siteName}: ${style.category}`);
		el.title = `${monitor.siteName} — ${style.category}`;
		el.style.width = isSelected ? '22px' : '16px';
		el.style.height = isSelected ? '22px' : '16px';
		el.style.backgroundColor = style.color;
		el.style.clipPath = shapeClipPath(monitor.agencyGroup);
		el.style.cursor = 'pointer';
		el.style.boxShadow = isSelected
			? '0 0 0 2px #0b0b0b, 0 1px 3px rgba(0,0,0,0.4)'
			: '0 1px 3px rgba(0,0,0,0.4)';
		el.addEventListener('click', (e) => {
			e.stopPropagation();
			onselect(monitor.id);
		});
		return el;
	}

	function syncMarkers() {
		if (!map || !MaplibreCtor) return;

		const nextIds = new Set(monitors.map((m) => m.id));
		for (const [id, marker] of markers) {
			if (!nextIds.has(id)) {
				marker.remove();
				markers.delete(id);
			}
		}

		for (const monitor of monitors) {
			if (Number.isNaN(monitor.lon) || Number.isNaN(monitor.lat)) continue;
			const existing = markers.get(monitor.id);
			if (existing) existing.remove();
			const marker = new MaplibreCtor.Marker({
				element: buildMarkerEl(monitor, monitor.id === selectedId)
			})
				.setLngLat([monitor.lon, monitor.lat])
				.addTo(map);
			markers.set(monitor.id, marker);
		}
	}

	$effect(() => {
		syncMarkers();
	});

	onMount(async () => {
		MaplibreCtor = await import('maplibre-gl');
		map = new MaplibreCtor.Map({
			container,
			style: 'https://tiles.openfreemap.org/styles/liberty',
			bounds: HOUSTON_BOUNDS,
			fitBoundsOptions: { padding: 30 }
		});
		map.addControl(new MaplibreCtor.NavigationControl(), 'top-right');
		map.on('load', syncMarkers);
	});

	onDestroy(() => {
		for (const marker of markers.values()) marker.remove();
		map?.remove();
	});
</script>

<div bind:this={container} class="h-full w-full"></div>
