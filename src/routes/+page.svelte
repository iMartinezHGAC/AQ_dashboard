<script lang="ts">
	import type { Capability, Monitor } from '#lib/arcgis.ts';
	import Header from '#lib/components/Header.svelte';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import ChartsPanel from '#lib/components/ChartsPanel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let monitors: Monitor[] = $derived(data.monitors);

	let capabilityFilter = $state<Capability | 'All'>('All');
	let countyFilter = $state('All');
	let selectedId = $state<string | null>(null);

	let counties = $derived(
		[...new Set(monitors.map((m) => m.county).filter((c): c is string => !!c))].sort()
	);

	let filteredMonitors = $derived(
		monitors.filter((m) => {
			if (capabilityFilter !== 'All' && m.capabilities !== capabilityFilter) return false;
			if (countyFilter !== 'All' && m.county !== countyFilter) return false;
			return true;
		})
	);

	let selectedMonitor = $derived(monitors.find((m) => m.id === selectedId) ?? null);

	function selectMonitor(id: string) {
		selectedId = id;
	}
</script>

<div class="flex h-screen flex-col">
	<Header
		capability={capabilityFilter}
		county={countyFilter}
		{counties}
		oncapabilitychange={(v) => (capabilityFilter = v)}
		oncountychange={(v) => (countyFilter = v)}
	/>

	<div class="flex min-h-0 flex-1">
		<Sidebar monitors={filteredMonitors} {selectedId} onselect={selectMonitor} />

		<div class="flex min-w-0 flex-1 flex-col">
			<div class="min-h-0 flex-1">
				<MapView monitors={filteredMonitors} {selectedId} onselect={selectMonitor} />
			</div>
			<ChartsPanel monitor={selectedMonitor} />
		</div>
	</div>
</div>
