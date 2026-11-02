import type { Monitor, Parameter } from './arcgis';

export type AqiCategory =
	| 'Good'
	| 'Moderate'
	| 'Unhealthy for Sensitive Groups'
	| 'Unhealthy'
	| 'Very Unhealthy'
	| 'Hazardous';

export type Emoticon = 'happy' | 'neutral' | 'sad';

export interface AqiStyle {
	category: AqiCategory;
	max: number; // upper (inclusive) AQI bound for this band
	color: string; // card background / marker fill
	textColor: string; // ink on top of `color`
	emoticon: Emoticon;
	recommendation: string;
}

// EPA AQI breakpoints (0-50/51-100/.../301+). Colors follow the family used in
// the original ArcGIS dashboard's Arcade expression, extended with the two
// bands its buggy category logic never actually reached.
export const AQI_SCALE: AqiStyle[] = [
	{
		category: 'Good',
		max: 50,
		color: '#9cd84e',
		textColor: '#1f3d0f',
		emoticon: 'happy',
		recommendation: 'It’s a great day to be active outside!'
	},
	{
		category: 'Moderate',
		max: 100,
		color: '#faeb37',
		textColor: '#4a4216',
		emoticon: 'neutral',
		recommendation:
			'Unusually sensitive people: consider making outdoor activities shorter and less intense. Watch for symptoms such as coughing or shortness of breath.'
	},
	{
		category: 'Unhealthy for Sensitive Groups',
		max: 150,
		color: '#f99049',
		textColor: '#4a2a0f',
		emoticon: 'neutral',
		recommendation:
			'Sensitive groups: make outdoor activities shorter and less intense, and take more breaks. Watch for symptoms such as coughing or shortness of breath.'
	},
	{
		category: 'Unhealthy',
		max: 200,
		color: '#f65e5f',
		textColor: '#450a0a',
		emoticon: 'sad',
		recommendation:
			'Sensitive groups should avoid long or intense outdoor activities. Everyone else should reduce long or intense activities and take more breaks.'
	},
	{
		category: 'Very Unhealthy',
		max: 300,
		color: '#a070b6',
		textColor: '#ffffff',
		emoticon: 'sad',
		recommendation:
			'Sensitive groups should avoid all physical activity outdoors. Everyone else should avoid long or intense activities.'
	},
	{
		category: 'Hazardous',
		max: Infinity,
		color: '#a06a7b',
		textColor: '#ffffff',
		emoticon: 'sad',
		recommendation:
			'Everyone should avoid all physical activity outdoors. Sensitive groups should remain indoors.'
	}
];

export function styleForAqi(aqi: number | null | undefined): AqiStyle {
	if (aqi == null) return AQI_SCALE[0];
	return AQI_SCALE.find((s) => aqi <= s.max) ?? AQI_SCALE[AQI_SCALE.length - 1];
}

export interface DominantReading {
	aqi: number | null;
	dominant: Parameter | null;
}

/** Mirrors the original popup's dominant-pollutant logic: higher AQI wins. */
export function dominantReading(monitor: Monitor): DominantReading {
	const { recentOzoneAqi: o, recentPm25Aqi: p } = monitor;
	if (o == null && p == null) return { aqi: null, dominant: null };
	if (o == null) return { aqi: p, dominant: 'PM2.5' };
	if (p == null) return { aqi: o, dominant: 'Ozone' };
	return o >= p ? { aqi: o, dominant: 'Ozone' } : { aqi: p, dominant: 'PM2.5' };
}

export function minutesAgo(timestamp: number | null): number | null {
	if (timestamp == null) return null;
	return Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
}

export function formatAge(minutes: number | null): string {
	if (minutes == null) return 'No data';
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = minutes / 60;
	if (hours < 24) return `${trimDecimal(hours)} hour${roundsToOne(hours) ? '' : 's'} ago`;
	const days = hours / 24;
	if (days < 7) return `${trimDecimal(days)} day${roundsToOne(days) ? '' : 's'} ago`;
	const weeks = days / 7;
	return `${trimDecimal(weeks)} week${roundsToOne(weeks) ? '' : 's'} ago`;
}

function roundsToOne(n: number): boolean {
	return Math.round(n * 10) / 10 === 1;
}

function trimDecimal(n: number): string {
	return (Math.round(n * 10) / 10).toString();
}
