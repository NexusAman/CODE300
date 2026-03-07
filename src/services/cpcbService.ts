import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { calculatePM10AQI, calculatePM25AQI } from "../utils/aqi";

const API_KEY = process.env.EXPO_PUBLIC_CPCB_API_KEY;

const CPCB_URL =
  "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";

const MAX_DISTANCE_KM = 50;
const CPCB_TIMEOUT_MS = 12000; // 12s timeout — government APIs can be slow
const CPCB_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — CPCB updates hourly, no need to re-fetch sooner
const CPCB_FRESHNESS_HOURS = 6; // Data older than 6 hours is considered stale
const RECORDS_PER_PAGE = 1000; // API max per request
const MAX_PAGES = 5; // Safety cap — prevents runaway pagination

const CACHE_KEY = "cpcb_cache_v2";

/* ───────── Types ───────── */

interface CPCBApiRecord {
  station?: string;
  city?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
  pollutant_id?: string;
  avg_value?: string;
  last_update?: string;
}

interface StationData {
  station: string;
  city: string;
  latitude: number;
  longitude: number;
  pollutants: {
    pm25?: number;
    pm10?: number;
    no2?: number;
    so2?: number;
    co?: number;
    o3?: number;
    nh3?: number;
  };
  lastUpdated?: string;
}

// Structured to match what index.tsx expects — nested station object
// with stationName, aqi, distanceKm, and a top-level isFresh flag.
export interface CPCBResult {
  station: {
    stationName: string;
    city: string;
    distanceKm: number;
    aqi: number | null;
    pm25?: number;
    pm10?: number;
  };
  isFresh: boolean;
  source: "CPCB";
}

/* ───────── In-Memory Cache ───────── */

let cachedStations: StationData[] | null = null;
let cachedAt = 0;

/* ───────── Distance Function ───────── */

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ───────── Timestamp Freshness ───────── */

/**
 * Parse CPCB's "DD-MM-YYYY HH:mm:ss" format and check if it's recent.
 * Returns true if data is within CPCB_FRESHNESS_HOURS hours.
 */
function isTimestampFresh(lastUpdate?: string): boolean {
  if (!lastUpdate) return false;

  // CPCB format: "06-03-2026 10:00:00"
  const parts = lastUpdate.match(
    /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!parts) return false;

  const [, dd, mm, yyyy, hh, min, ss] = parts;
  // Build ISO string: "YYYY-MM-DDTHH:mm:ss+05:30" (CPCB always reports IST)
  const isoStr = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`;
  const timestamp = Date.parse(isoStr);
  if (!Number.isFinite(timestamp)) return false;

  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= CPCB_FRESHNESS_HOURS * 60 * 60 * 1000;
}

/* ───────── Fetch CPCB Data (with pagination) ───────── */

const cpcbApi = axios.create({ timeout: CPCB_TIMEOUT_MS });

async function fetchAllCPCBRecords(): Promise<CPCBApiRecord[]> {
  if (!API_KEY) {
    console.warn("CPCB_API_KEY is not set — skipping CPCB fetch.");
    return [];
  }

  const allRecords: CPCBApiRecord[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await cpcbApi.get(CPCB_URL, {
      params: {
        "api-key": API_KEY,
        format: "json",
        limit: RECORDS_PER_PAGE,
        offset,
      },
    });

    const records: CPCBApiRecord[] = res.data.records || [];
    allRecords.push(...records);

    // If we got fewer records than the page size, we've reached the end
    if (records.length < RECORDS_PER_PAGE) break;

    offset += RECORDS_PER_PAGE;
  }

  return allRecords;
}

/* ───────── Group Records into Stations ───────── */

function groupIntoStations(records: CPCBApiRecord[]): StationData[] {
  const stationMap: Record<string, StationData> = {};

  for (const r of records) {
    if (!r.station) continue;
    const latVal = parseFloat(r.latitude ?? "");
    const lonVal = parseFloat(r.longitude ?? "");
    if (isNaN(latVal) || isNaN(lonVal)) continue;

    if (!stationMap[r.station]) {
      stationMap[r.station] = {
        station: r.station,
        city: r.city ?? "",
        latitude: latVal,
        longitude: lonVal,
        pollutants: {},
        lastUpdated: r.last_update,
      };
    }

    const pollutant = r.pollutant_id?.toUpperCase();
    const value = parseFloat(r.avg_value ?? "");
    if (isNaN(value)) continue;

    switch (pollutant) {
      case "PM2.5":
      case "PM25":
        stationMap[r.station].pollutants.pm25 = value;
        break;
      case "PM10":
        stationMap[r.station].pollutants.pm10 = value;
        break;
      case "NO2":
        stationMap[r.station].pollutants.no2 = value;
        break;
      case "SO2":
        stationMap[r.station].pollutants.so2 = value;
        break;
      case "CO":
        stationMap[r.station].pollutants.co = value;
        break;
      case "OZONE":
      case "O3":
        stationMap[r.station].pollutants.o3 = value;
        break;
      case "NH3":
        stationMap[r.station].pollutants.nh3 = value;
        break;
    }
  }

  return Object.values(stationMap);
}

/* ───────── Get Stations (with 2-layer cache) ───────── */

async function getStations(): Promise<StationData[]> {
  // Layer 1: In-memory cache (survives within app session)
  if (cachedStations && Date.now() - cachedAt < CPCB_CACHE_TTL_MS) {
    return cachedStations;
  }

  // Layer 2: AsyncStorage cache (survives across app restarts)
  try {
    const stored = await AsyncStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.cachedAt && Date.now() - parsed.cachedAt < CPCB_CACHE_TTL_MS) {
        cachedStations = parsed.stations;
        cachedAt = parsed.cachedAt;
        return cachedStations!;
      }
    }
  } catch {}

  // Cache miss — fetch fresh data
  const records = await fetchAllCPCBRecords();
  const stations = groupIntoStations(records);

  // Populate both cache layers
  cachedStations = stations;
  cachedAt = Date.now();
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ stations, cachedAt })).catch(
    () => {},
  );

  return stations;
}

/* ───────── Find Nearest Station ───────── */

function findNearestStation(
  userLat: number,
  userLon: number,
  stations: StationData[],
): CPCBResult | null {
  let nearest: StationData | null = null;
  let minDist = Infinity;

  for (const s of stations) {
    if (!s.pollutants.pm25 && !s.pollutants.pm10) continue;

    const dist = haversine(userLat, userLon, s.latitude, s.longitude);

    if (dist > MAX_DISTANCE_KM) continue;

    if (dist < minDist) {
      minDist = dist;
      nearest = s;
    }
  }

  if (!nearest) return null;

  // Compute AQI from CPCB PM values (already 24-hr averaged by the station)
  const subIndices: number[] = [];
  if (nearest.pollutants.pm25 != null)
    subIndices.push(calculatePM25AQI(nearest.pollutants.pm25));
  if (nearest.pollutants.pm10 != null)
    subIndices.push(calculatePM10AQI(nearest.pollutants.pm10));
  const aqi = subIndices.length > 0 ? Math.max(...subIndices) : null;

  // isFresh = has PM data + AQI computed + timestamp is recent
  const hasPMData =
    nearest.pollutants.pm25 != null || nearest.pollutants.pm10 != null;
  const timestampFresh = isTimestampFresh(nearest.lastUpdated);

  return {
    station: {
      stationName: nearest.station,
      city: nearest.city,
      distanceKm: Math.round(minDist * 10) / 10,
      aqi,
      pm25: nearest.pollutants.pm25,
      pm10: nearest.pollutants.pm10,
    },
    isFresh: hasPMData && aqi != null && timestampFresh,
    source: "CPCB",
  };
}

/* ───────── Main Function ───────── */

export async function fetchNearestCPCBStation(
  lat: number,
  lon: number,
): Promise<CPCBResult | null> {
  try {
    const stations = await getStations();
    return findNearestStation(lat, lon, stations);
  } catch {
    console.warn("CPCB API failed");
    return null;
  }
}
