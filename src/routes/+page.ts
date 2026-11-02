import { fetchMonitors } from '#lib/arcgis.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const monitors = await fetchMonitors(fetch);
	return { monitors };
};
