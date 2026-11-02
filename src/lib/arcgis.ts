const FEATURE_SERVER =
	'https://services1.arcgis.com/Z6SBWLWGRRejblAA/arcgis/rest/services/Air_Now_Monitors/FeatureServer';

export type Capability = 'Ozone' | 'PM2.5' | 'Both';
export type Parameter = 'Ozone' | 'PM2.5';

export interface Monitor {
	objectId: number;
	id: string;
	agencyName: string;
	agencyGroup: string;
	siteName: string;
	capabilities: Capability;
	recentOzone: number | null;
	recentOzoneAqi: number | null;
	lastSeenOzone: number | null;
	recentPm25: number | null;
	recentPm25Aqi: number | null;
	lastSeenPm25: number | null;
	county: string | null;
	lon: number;
	lat: number;
}

export interface ObservationPoint {
	t: number; // epoch ms
	v: number;
}

interface EsriAttributes {
	[key: string]: unknown;
}

interface EsriFeature {
	attributes: EsriAttributes;
	geometry?: { x: number; y: number };
}

interface EsriFeatureSetResponse {
	features: EsriFeature[];
	exceededTransferLimit?: boolean;
	error?: { message: string };
}

function escapeSqlLiteral(value: string): string {
	return value.replace(/'/g, "''");
}

function monitorFromFeature(feature: EsriFeature): Monitor {
	const a = feature.attributes;
	return {
		objectId: a.OBJECTID as number,
		id: a.id as string,
		agencyName: a.agencyname as string,
		agencyGroup: a.agencygroup as string,
		siteName: a.sitename as string,
		capabilities: a.capabilities as Capability,
		recentOzone: a.recent_ozone as number | null,
		recentOzoneAqi: a.recent_ozone_aqi as number | null,
		lastSeenOzone: a.last_seen_ozone as number | null,
		recentPm25: a.recent_pm25 as number | null,
		recentPm25Aqi: a.recent_pm25_aqi as number | null,
		lastSeenPm25: a.last_seen_pm25 as number | null,
		county: a.county as string | null,
		lon: feature.geometry?.x ?? NaN,
		lat: feature.geometry?.y ?? NaN
	};
}

export async function fetchMonitors(fetchFn: typeof fetch = fetch): Promise<Monitor[]> {
	const url = `${FEATURE_SERVER}/0/query?where=1%3D1&outFields=*&outSR=4326&f=json`;
	const res = await fetchFn(url);
	if (!res.ok) throw new Error(`Failed to fetch monitors: ${res.status}`);
	const data = (await res.json()) as EsriFeatureSetResponse;
	if (data.error) throw new Error(`ArcGIS error: ${data.error.message}`);
	return data.features.map(monitorFromFeature);
}

export type TimeRange = '24h' | 'month' | 'year';

const RANGE_LOOKBACK_MS: Record<TimeRange, number> = {
	'24h': 24 * 3_600_000,
	month: 31 * 24 * 3_600_000,
	year: 366 * 24 * 3_600_000
};

const PAGE_SIZE = 2000;

// This service's query engine rejects raw epoch-ms comparisons on date fields
// (400 "Invalid query parameters") -- it requires a SQL TIMESTAMP literal.
function toSqlTimestamp(ms: number): string {
	return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

async function fetchRawObservations(
	monitorId: string,
	parameter: Parameter,
	sinceMs: number,
	fetchFn: typeof fetch
): Promise<ObservationPoint[]> {
	const where = `monitor_id='${escapeSqlLiteral(monitorId)}' AND parameter='${escapeSqlLiteral(parameter)}' AND UTC >= TIMESTAMP '${toSqlTimestamp(sinceMs)}'`;
	const all: ObservationPoint[] = [];
	let offset = 0;

	while (true) {
		const url =
			`${FEATURE_SERVER}/1/query?where=${encodeURIComponent(where)}` +
			`&outFields=parametervalue,UTC&orderByFields=UTC+ASC` +
			`&resultOffset=${offset}&resultRecordCount=${PAGE_SIZE}&f=json`;
		const res = await fetchFn(url);
		if (!res.ok) throw new Error(`Failed to fetch observations: ${res.status}`);
		const data = (await res.json()) as EsriFeatureSetResponse;
		if (data.error) throw new Error(`ArcGIS error: ${data.error.message}`);

		const batch = data.features.map((f) => ({
			t: f.attributes.UTC as number,
			v: f.attributes.parametervalue as number
		}));
		all.push(...batch);

		if (batch.length < PAGE_SIZE) break;
		offset += PAGE_SIZE;
	}

	return all;
}

function dayKey(t: number): number {
	const d = new Date(t);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function monthKey(t: number): number {
	const d = new Date(t);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function aggregate(points: ObservationPoint[], keyFn: (t: number) => number): ObservationPoint[] {
	const buckets = new Map<number, { sum: number; count: number }>();
	for (const p of points) {
		const key = keyFn(p.t);
		const bucket = buckets.get(key);
		if (bucket) {
			bucket.sum += p.v;
			bucket.count += 1;
		} else {
			buckets.set(key, { sum: p.v, count: 1 });
		}
	}
	return [...buckets.entries()]
		.sort(([a], [b]) => a - b)
		.map(([t, { sum, count }]) => ({ t, v: sum / count }));
}

/**
 * 24h: raw hourly readings. month: daily averages. year: monthly averages.
 * Matches the original dashboard's "Average X by Day/Month" chart titles.
 */
export async function fetchTrend(
	monitorId: string,
	parameter: Parameter,
	range: TimeRange,
	fetchFn: typeof fetch = fetch
): Promise<ObservationPoint[]> {
	const since = Date.now() - RANGE_LOOKBACK_MS[range];
	const raw = await fetchRawObservations(monitorId, parameter, since, fetchFn);
	if (range === '24h') return raw;
	if (range === 'month') return aggregate(raw, dayKey);
	return aggregate(raw, monthKey);
}
