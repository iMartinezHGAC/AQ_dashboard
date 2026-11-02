<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
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

	const HOUSTON_CENTER: [number, number] = [-95.3698, 29.7604];
	const HOUSTON_ZOOM = 9;

	const SVG_NS = 'http://www.w3.org/2000/svg';

	// Shape encodes data source, not pollutant capability: TCEQ (EPA/AirNow feed) = circle,
	// Harris County Pollution Control (HCPCS feed) = triangle.
	// Built as real SVG shapes rather than a CSS clip-path: clip-path cuts the
	// element's already-painted border along the new outline, but the border was only
	// ever drawn along the original (square) box edges, so a triangle's diagonal sides
	// came out with no stroke at all. An SVG stroke traces the actual path, evenly.
	function buildMarkerEl(monitor: Monitor, isSelected: boolean): HTMLDivElement {
		const style = styleForAqi(dominantReading(monitor).aqi);
		const size = isSelected ? 22 : 16;
		const strokeWidth = isSelected ? 2.25 : 1.5;
		const inset = strokeWidth / 2;

		const wrapper = document.createElement('div');
		wrapper.setAttribute('role', 'button');
		wrapper.setAttribute('aria-label', `${monitor.siteName}: ${style.category}`);
		wrapper.title = `${monitor.siteName} — ${style.category}`;
		wrapper.style.width = `${size}px`;
		wrapper.style.height = `${size}px`;
		wrapper.style.cursor = 'pointer';
		wrapper.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))';

		const svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('width', String(size));
		svg.setAttribute('height', String(size));
		svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

		const shape = document.createElementNS(
			SVG_NS,
			monitor.agencyGroup === 'HCPCS' ? 'polygon' : 'circle'
		);
		if (monitor.agencyGroup === 'HCPCS') {
			shape.setAttribute(
				'points',
				`${size / 2},${inset} ${inset},${size - inset} ${size - inset},${size - inset}`
			);
			shape.setAttribute('stroke-linejoin', 'round');
		} else {
			shape.setAttribute('cx', String(size / 2));
			shape.setAttribute('cy', String(size / 2));
			shape.setAttribute('r', String(size / 2 - inset));
		}
		shape.setAttribute('fill', style.color);
		shape.setAttribute('stroke', '#0b0b0b');
		shape.setAttribute('stroke-width', String(strokeWidth));
		svg.appendChild(shape);
		wrapper.appendChild(svg);

		wrapper.addEventListener('click', (e) => {
			e.stopPropagation();
			onselect(monitor.id);
		});
		return wrapper;
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
		MaplibreCtor.setWorkerUrl(maplibreWorkerUrl);
		map = new MaplibreCtor.Map({
			container,
			style: 'https://tiles.openfreemap.org/styles/liberty',
			center: HOUSTON_CENTER,
			zoom: HOUSTON_ZOOM
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
