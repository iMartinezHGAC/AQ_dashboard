"""
Air Quality Sync
----------------
Pulls current AirNow (EPA) and HCPCS (Harris County Pollution Control) monitor
readings, calculates AQI, and syncs monitors + observations to an ArcGIS
Online feature layer / table.
"""

import os
import math
import logging
import requests
import urllib3
import pandas as pd
from datetime import datetime, timedelta, timezone

from arcgis.gis import GIS
from arcgis.features import FeatureLayer, Feature, FeatureSet
from arcgis.geometry import Geometry
from arcgis.geometry.filters import intersects

# ===================================================================
# CONFIG
# Credentials are pulled from environment variables rather than being
# hardcoded. Set these in your environment (or a .env file loaded
# before this script runs):
#   GIS_API_KEY, AIRNOW_API_KEY, HCPCS_USERNAME, HCPCS_PASSWORD
# ===================================================================
GIS_API_KEY = os.environ["GIS_API_KEY"]
AIRNOW_API_KEY = os.environ["AIRNOW_API_KEY"]
HCPCS_USERNAME = os.environ["HCPCS_USERNAME"]
HCPCS_PASSWORD = os.environ["HCPCS_PASSWORD"]

COUNTY_LAYER_ID = "feb927e3ea064edfaf9b2bd8818cdd3b"
FEATURE_LAYER_ID = "31cf39eb669f410e834a22bbd623a00a"  # Air Now Monitors layer on ArcGIS Online

AIRNOW_URL = "https://www.airnowapi.org/aq/data/"
HCPCS_URL = "https://services.arcgis.com/su8ic9KbA7PYVxPS/ArcGIS/rest/services/AirMonitorLast31Days/FeatureServer/0/query"

LOOKBACK_HOURS = 3  # how far back to pull fresh readings each run

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)
logging.basicConfig(
    filename="AirQuality_Log.log",
    filemode="a",
    format="%(asctime)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)


# ===================================================================
# HELPER FUNCTIONS
# ===================================================================
def get_week_start(utc_value):
    """Return the Monday of the week for a given UTC value (as a datetime)."""
    if utc_value is None:
        return None
    try:
        if isinstance(utc_value, (int, float)):
            dt = datetime.fromtimestamp(utc_value / 1000.0, tz=timezone.utc)
        else:
            dt = pd.to_datetime(utc_value)
        if pd.isna(dt):
            return None
        return dt - timedelta(days=dt.weekday())
    except Exception:
        return None


def find_county(point, counties_lyr):
    """Return the county name whose polygon contains the given point, if any."""
    geom = Geometry(point)
    cfilter = intersects(geom, 4326)
    result = counties_lyr.query(geometry_filter=cfilter)
    if result.features:
        return result.features[0].attributes["NAME"]
    return None


def truncate_value(value, decimals):
    if value is None:
        return None
    factor = 10 ** decimals
    return math.trunc(value * factor) / factor


def calculate_aqi(parameter, concentration, unit=None, o3_duration="1hr"):
    """
    AQI calculator following EPA Table 6 / Equation 1.
    - Truncates first (O3 to 3 decimals, PM2.5 to 1 decimal)
    - Converts ppb -> ppm for ozone/VOC where the unit indicates ppb
    - Returns (aqi, category) or (None, None)

    NOTE: the ppb->ppm conversion falls back to a value-range heuristic
    (0.2 < conc < 1000) when no unit string is given. That heuristic will
    misfire for a genuine high ozone reading already in ppm (e.g. 0.3 ppm
    during a smoke event), incorrectly dividing it by 1000. Always pass an
    explicit `unit` when the source data provides one.
    """
    if concentration is None or concentration <= 0:
        return None, None

    param = str(parameter).upper().strip()
    conc = float(concentration)
    unit_str = str(unit or "").lower().strip()

    if param in ("OZONE", "O3", "VOC"):
        if "ppb" in unit_str or (unit_str == "" and 0.2 < conc < 1000):
            conc = conc / 1000.0
        conc = truncate_value(conc, 3)
    elif param == "PM2.5":
        conc = truncate_value(conc, 1)
    elif param == "PM10":
        conc = truncate_value(conc, 0)

    if param == "PM2.5":
        breakpoints = [
            (0.0, 9.0, 0, 50, "Good"),
            (9.1, 35.4, 51, 100, "Moderate"),
            (35.5, 55.4, 101, 150, "Unhealthy for Sensitive Groups"),
            (55.5, 125.4, 151, 200, "Unhealthy"),
            (125.5, 225.4, 201, 300, "Very Unhealthy"),
            (225.5, 325.4, 301, 500, "Hazardous"),
        ]
    elif param in ("OZONE", "O3", "VOC"):
        if o3_duration in ("1hr", "1-hour", "1hr_o3"):
            breakpoints = [
                (0.000, 0.054, 0, 50, "Good"),
                (0.055, 0.124, 51, 100, "Moderate"),
                (0.125, 0.164, 101, 150, "Unhealthy for Sensitive Groups"),
                (0.165, 0.204, 151, 200, "Unhealthy"),
                (0.205, 0.404, 201, 300, "Very Unhealthy"),
                (0.405, 0.604, 301, 500, "Hazardous"),
            ]
        else:
            breakpoints = [
                (0.000, 0.054, 0, 50, "Good"),
                (0.055, 0.070, 51, 100, "Moderate"),
                (0.071, 0.085, 101, 150, "Unhealthy for Sensitive Groups"),
                (0.086, 0.105, 151, 200, "Unhealthy"),
                (0.106, 0.200, 201, 300, "Very Unhealthy"),
            ]
    else:
        return None, None

    for c_low, c_high, i_low, i_high, cat in breakpoints:
        if c_low <= conc <= c_high:
            aqi_val = i_low + ((i_high - i_low) / (c_high - c_low)) * (conc - c_low)
            return round(aqi_val), cat

    if conc > breakpoints[-1][1]:
        return 500, "Hazardous"

    return None, None


# ===================================================================
# FETCH FUNCTIONS
# ===================================================================
def get_airnow_data():
    """
    NOTE: the original version of this call omitted `startDate`/`endDate`,
    which AirNow's /aq/data/ endpoint requires. Without them the API
    returns an error and no data is ever collected. Both are included here.
    """
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=LOOKBACK_HOURS)
    params = {
        "bbox": "-96.8727,28.381,-94.3524,31.0668",
        "parameters": "ozone,pm25",
        "datatype": "B",
        "startDate": start.strftime("%Y-%m-%dT%H"),
        "endDate": now.strftime("%Y-%m-%dT%H"),
        "format": "application/json",
        "api_key": AIRNOW_API_KEY,
        "verbose": 1,
    }
    try:
        response = requests.get(AIRNOW_URL, params=params, verify=False, timeout=30)
        logger.info(f"AirNow request: {response.url} -> {response.status_code}")
        if response.status_code == 200:
            return response.json()
        logger.error(f"AirNow returned {response.status_code}: {response.text[:500]}")
        return None
    except Exception as e:
        logger.error(f"AirNow request failed: {e}")
        return None


def get_hcpcs_data():
    try:
        start_time = (datetime.now() - timedelta(hours=LOOKBACK_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
        params = {
            "where": f"RecordedDate >= '{start_time}'",
            "outFields": "*",
            "f": "json",
            "returnGeometry": "false",
            "returnAllRecords": "true",
            "orderByFields": "RecordedDate DESC",
        }
        response = requests.get(
            HCPCS_URL, params=params, auth=(HCPCS_USERNAME, HCPCS_PASSWORD), verify=False, timeout=30
        )
        logger.info(f"HCPCS request: {response.url} -> {response.status_code}")
        if response.status_code == 200:
            features = response.json().get("features", [])
            logger.info(f"Retrieved {len(features)} HCPCS records")
            return features
        logger.error(f"HCPCS returned {response.status_code}: {response.text[:500]}")
        return []
    except Exception as e:
        logger.error(f"HCPCS request failed: {e}")
        return []


# ===================================================================
# TRANSFORM FUNCTIONS
# ===================================================================
def transform_airnow_data(airnow_data):
    result = []
    for row in airnow_data or []:
        value = row.get("Value")
        if value is None or value <= 0:
            continue
        aqi, cat = calculate_aqi(row["Parameter"], value, unit=row.get("Unit"))
        result.append(
            {
                "id": row["IntlAQSCode"],
                "agencyname": row["AgencyName"],
                "agencygroup": "EPA",
                "sitename": row["SiteName"],
                "latitude": row["Latitude"],
                "longitude": row["Longitude"],
                "parameter": row["Parameter"],
                "parameterunit": row["Unit"],
                "parametervalue": value,
                "aqi": aqi,
                "category": cat,
                "UTC": row["UTC"],
            }
        )
    return result


def transform_hcpcs_data(hcpcs_features):
    result = []
    skipped = 0
    for feat in hcpcs_features or []:
        row = feat.get("attributes", {})
        sitename = str(row.get("SensorName", "")).strip()
        if not sitename:
            continue
        lat, lon = row.get("Latitude"), row.get("Longitude")
        if lat is None or lon is None:
            continue

        base = {
            "id": sitename,
            "agencyname": "Harris County Pollution Control",
            "agencygroup": "HCPCS",
            "sitename": sitename,
            "latitude": float(lat),
            "longitude": float(lon),
            "UTC": row.get("RecordedDate"),
        }

        pm25 = row.get("PM2_5")
        if pm25 is not None and pm25 > 0:
            aqi, cat = calculate_aqi("PM2.5", pm25)
            result.append(
                {**base, "parameter": "PM2.5", "parameterunit": "\u00b5g/m\u00b3",
                 "parametervalue": float(pm25), "aqi": aqi, "category": cat}
            )
        else:
            skipped += 1

        voc = row.get("VOC")
        if voc is not None and voc > 0:
            aqi, cat = calculate_aqi("Ozone", voc, unit="ppb")
            result.append(
                {**base, "parameter": "Ozone", "parameterunit": "ppb",
                 "parametervalue": float(voc), "aqi": aqi, "category": cat}
            )
        else:
            skipped += 1

    logger.info(f"HCPCS: skipped {skipped} zero/invalid readings")
    return result


# ===================================================================
# MONITOR ADD / UPDATE
# ===================================================================
def build_monitor_adds(all_data, existing_ids, counties_lyr):
    """Create Feature objects for any monitor ids not already in the layer."""
    monitor_adds = []
    seen = set(existing_ids)
    for row in all_data:
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        geometry = {"x": row["longitude"], "y": row["latitude"], "spatialReference": {"wkid": 4326}}
        attributes = {
            "id": row["id"],
            "agencyname": row["agencyname"],
            "agencygroup": row["agencygroup"],
            "sitename": row["sitename"],
            "county": find_county(geometry, counties_lyr),
        }
        monitor_adds.append(Feature(attributes=attributes, geometry=geometry))
    return monitor_adds


def build_monitor_updates(all_data, monitor_lyr):
    """
    Query each affected monitor once, then apply all of that monitor's
    readings from this run to the same in-memory Feature object before
    queuing a single update per monitor.

    (The original version re-queried the layer fresh for every reading. If a
    monitor had both an ozone and a PM2.5 reading in the same run, the second
    query wouldn't see the first reading's in-memory change -- since neither
    had been posted to the server yet -- so it recomputed `capabilities` from
    stale data and the two queued edits clobbered each other. The result
    could be `capabilities` stuck at "Ozone" or "PM2.5" instead of "Both".)
    """
    ids = list({row["id"] for row in all_data})
    if not ids:
        return []

    id_list = "','".join(i.replace("'", "''") for i in ids)
    result = monitor_lyr.query(
        where=f"id IN ('{id_list}')",
        out_fields="id,capabilities,recent_ozone,recent_pm25",
    )
    monitors_by_id = {f.attributes["id"]: f for f in result.features}

    touched = set()
    for row in all_data:
        feature = monitors_by_id.get(row["id"])
        if feature is None:
            continue  # brand-new monitor not yet posted; will be updated next run
        param = row["parameter"].lower()
        current_cap = feature.attributes.get("capabilities", "")

        if param == "ozone":
            feature.attributes["recent_ozone"] = row["parametervalue"]
            feature.attributes["recent_ozone_aqi"] = row.get("aqi")
            feature.attributes["last_seen_ozone"] = row["UTC"]
            feature.attributes["capabilities"] = "Both" if current_cap in ("PM2.5", "Both") else "Ozone"
        elif param == "pm2.5":
            feature.attributes["recent_pm25"] = row["parametervalue"]
            feature.attributes["recent_pm25_aqi"] = row.get("aqi")
            feature.attributes["last_seen_pm25"] = row["UTC"]
            feature.attributes["capabilities"] = "Both" if current_cap in ("Ozone", "Both") else "PM2.5"
        else:
            continue

        touched.add(row["id"])

    return [monitors_by_id[i] for i in touched]


def remove_exact_duplicates(obs_table, new_records, hours=48):
    """
    Delete any existing observation rows that exactly match
    (monitor_id, parameter, UTC) for a record we're about to insert, so
    reruns don't create duplicate rows.
    """
    if not new_records:
        return 0

    deleted_count = 0
    for row in new_records:
        where = (
            f"monitor_id = '{row['id']}' AND parameter = '{row['parameter']}' "
            f"AND UTC = '{row['UTC']}'"
        )
        existing = obs_table.query(where=where, out_fields="OBJECTID")
        if existing.features:
            oids = [f.attributes["OBJECTID"] for f in existing.features]
            obs_table.edit_features(deletes=oids)
            deleted_count += len(oids)

    if deleted_count:
        logger.info(f"Removed {deleted_count} exact duplicate observations")
    return deleted_count


def build_obs_adds(all_data):
    obs_adds = []
    for row in all_data:
        val = row.get("parametervalue")
        if val is None or val <= 0:
            continue
        attributes = {
            "monitor_id": row["id"],
            "parameter": row["parameter"],
            "parameterunit": row["parameterunit"],
            "parametervalue": val,
            "aqi": row.get("aqi"),
            "category": row.get("category"),
            "UTC": row["UTC"],
            "week": get_week_start(row.get("UTC")),
            "sitename": row.get("sitename"),
        }
        obs_adds.append(Feature(attributes=attributes))
    return obs_adds


def print_summary_table(all_data):
    print(f"\n{'='*70}")
    print("PULLED MONITOR READINGS + AQI CALCULATIONS")
    print(f"{'='*70}")
    print(f"{'#':<4} {'ID / Site Name':<38} {'Param':<8} {'Value':>9} {'Unit':<10} {'AQI':>5} {'Category':<28} {'UTC':<19}")
    print("-" * 125)
    for idx, row in enumerate(all_data, 1):
        site = str(row.get("sitename", row.get("id", "N/A")))[:37]
        param = str(row.get("parameter", "N/A"))[:7]
        val = row.get("parametervalue")
        unit = str(row.get("parameterunit", ""))[:9]
        aqi = row.get("aqi")
        cat = str(row.get("category", ""))[:27]
        utc = str(row.get("UTC", ""))[:19]
        val_str = f"{val:>9.2f}" if isinstance(val, (int, float)) else f"{val:>9}"
        aqi_str = f"{aqi:>5}" if aqi is not None else "  N/A"
        print(f"{idx:<4} {site:<38} {param:<8} {val_str} {unit:<10} {aqi_str} {cat:<28} {utc:<19}")
    print("-" * 125)

    for label, keys in (("PM2.5", ("pm2.5",)), ("Ozone / VOC", ("ozone", "o3", "voc"))):
        obs = [r for r in all_data if str(r.get("parameter", "")).lower() in keys]
        print(f"  {label} readings: {len(obs)}")
        if obs:
            avg = sum(r["aqi"] or 0 for r in obs) / len(obs)
            print(f"    Average AQI: {avg:.1f}")


# ===================================================================
# MAIN
# ===================================================================
def main():
    logger.info("------ Script started ------")
    try:
        gis = GIS(api_key=GIS_API_KEY)
        item = gis.content.get(FEATURE_LAYER_ID)
        monitor_lyr = item.layers[0]
        obs_table = item.tables[0]
        counties_lyr = FeatureLayer.fromitem(gis.content.get(COUNTY_LAYER_ID), layer_id=0)
        print("\u2713 Target feature service loaded")

        airnow_data = transform_airnow_data(get_airnow_data())
        hcpcs_data = transform_hcpcs_data(get_hcpcs_data())
        all_data = airnow_data + hcpcs_data

        print(f"\nTotal combined observations pulled this run: {len(all_data)}")
        if not all_data:
            print("No data returned from either source this run.")

        # --- New monitors ---
        existing_ids = monitor_lyr.get_unique_values("id")
        monitor_adds = build_monitor_adds(all_data, existing_ids, counties_lyr)
        if monitor_adds:
            results = monitor_lyr.edit_features(adds=FeatureSet(monitor_adds))
            added = sum(1 for r in results["addResults"] if r["success"])
            print(f"\nAdded {added} new monitors:")
            for feat in monitor_adds:
                a = feat.attributes
                print(f"   - {a['id']} | {a['sitename']} | County: {a.get('county', 'N/A')} | Agency: {a['agencyname']}")
        else:
            print("\nNo new monitors detected.")

        # --- Update existing monitors with latest readings ---
        monitor_updates = build_monitor_updates(all_data, monitor_lyr)
        if monitor_updates:
            results = monitor_lyr.edit_features(updates=FeatureSet(monitor_updates))
            updated = sum(1 for r in results["updateResults"] if r["success"])
            print(f"Updated {updated} monitors with latest readings + AQI")

        print_summary_table(all_data)

        # --- Observations: dedupe, then append ---
        remove_exact_duplicates(obs_table, all_data)
        obs_adds = build_obs_adds(all_data)
        print(f"\nPrepared {len(obs_adds)} observations to add")
        if obs_adds:
            results = obs_table.edit_features(adds=FeatureSet(obs_adds))
            success = sum(1 for x in results.get("addResults", []) if x.get("success"))
            print(f"Successfully added {success} observations")
        else:
            print("No observations to add")

        print(f"\n{'='*70}")
        print("SCRIPT COMPLETE")
        print(f"{'='*70}\n")

    except Exception as e:
        logger.error(f"An error occurred: {e}", exc_info=True)
        print(f"Script failed: {e}")

    logger.info("------ Script finished ------")


if __name__ == "__main__":
    main()
