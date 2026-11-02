<script lang="ts">
	import type { Capability } from '#lib/arcgis.ts';

	interface Props {
		capability: Capability | 'All';
		county: string;
		counties: string[];
		oncapabilitychange: (value: Capability | 'All') => void;
		oncountychange: (value: string) => void;
	}

	let { capability, county, counties, oncapabilitychange, oncountychange }: Props = $props();

	const CAPABILITY_OPTIONS: (Capability | 'All')[] = ['All', 'Ozone', 'PM2.5', 'Both'];
</script>

<header class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
	<h1 class="text-xl font-semibold text-slate-900">Air Quality Resource Hub</h1>
	<div class="flex gap-6">
		<label class="text-sm">
			<span class="block text-slate-500">Monitor Capability</span>
			<select
				class="mt-0.5 border-0 bg-transparent p-0 font-medium text-slate-900 focus:ring-0"
				value={capability}
				onchange={(e) => oncapabilitychange(e.currentTarget.value as Capability | 'All')}
			>
				{#each CAPABILITY_OPTIONS as opt (opt)}
					<option value={opt}>{opt}</option>
				{/each}
			</select>
		</label>
		<label class="text-sm">
			<span class="block text-slate-500">County</span>
			<select
				class="mt-0.5 border-0 bg-transparent p-0 font-medium text-slate-900 focus:ring-0"
				value={county}
				onchange={(e) => oncountychange(e.currentTarget.value)}
			>
				<option value="All">All</option>
				{#each counties as c (c)}
					<option value={c}>{c}</option>
				{/each}
			</select>
		</label>
	</div>
</header>
