<script lang="ts">
	import type { Emoticon } from '#lib/aqi.ts';

	interface Props {
		type: Emoticon;
		class?: string;
	}

	let { type, class: className = '' }: Props = $props();
</script>

<svg
	class={className}
	width="48"
	height="48"
	viewBox="0 0 48 48"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
>
	<circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="3" />
	<ellipse cx="16" cy="20" rx="3" ry="4" fill="currentColor" />
	<ellipse cx="32" cy="20" rx="3" ry="4" fill="currentColor" />
	{#if type === 'happy'}
		<path
			d="M16 30 Q24 38 32 30"
			stroke="currentColor"
			stroke-width="3"
			fill="none"
			stroke-linecap="round"
		/>
	{:else if type === 'neutral'}
		<rect x="16" y="30" width="16" height="3" rx="1.5" fill="currentColor" />
	{:else}
		<path
			d="M16 36 Q24 28 32 36"
			stroke="currentColor"
			stroke-width="3"
			fill="none"
			stroke-linecap="round"
		/>
	{/if}
</svg>
