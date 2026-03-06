import AsyncStorage from "@react-native-async-storage/async-storage";
import { calculateOverallAQIFromAvg } from "../utils/aqi";

const STORAGE_KEY = "pm_readings_v1";
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface HistoryPoint {
  /** Timestamp in ms */
  time: number;
  /** AQI value */
  aqi: number;
}

interface PMReading {
  /** Unix timestamp in ms */
  t: number;
  /** PM2.5 µg/m³ */
  p25: number;
  /** PM10 µg/m³ */
  p10: number;
}

let cache: PMReading[] | null = null;

/** Load readings from disk (once per app session). */
const loadReadings = async (): Promise<PMReading[]> => {
  if (cache !== null) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  return cache!;
};

/** Remove entries older than 24 hours and persist. */
const pruneAndPersist = async (readings: PMReading[]): Promise<void> => {
  const cutoff = Date.now() - WINDOW_MS;
  const pruned = readings.filter((r) => r.t > cutoff);
  cache = pruned;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
};

/**
 * Record a new PM reading. Call this every time fresh data arrives from the API.
 */
export const recordPMReading = async (
  pm25: number,
  pm10: number,
): Promise<void> => {
  const readings = await loadReadings();
  readings.push({ t: Date.now(), p25: pm25, p10: pm10 });
  await pruneAndPersist(readings);
};

export interface RollingAverage {
  pm25Avg: number;
  pm10Avg: number;
  /** Number of readings used to compute the average. */
  sampleCount: number;
  /** Span of readings in hours (0 = single reading). */
  spanHours: number;
}

/**
 * Compute the rolling 24-hour average of stored readings.
 * Returns `null` when no readings have been recorded yet.
 */
export const getRollingAverage = async (): Promise<RollingAverage | null> => {
  const readings = await loadReadings();
  const cutoff = Date.now() - WINDOW_MS;
  const recent = readings.filter((r) => r.t > cutoff);

  if (recent.length === 0) return null;

  const sum25 = recent.reduce((s, r) => s + r.p25, 0);
  const sum10 = recent.reduce((s, r) => s + r.p10, 0);
  const count = recent.length;

  const oldest = Math.min(...recent.map((r) => r.t));
  const spanHours = (Date.now() - oldest) / (60 * 60 * 1000);

  return {
    pm25Avg: sum25 / count,
    pm10Avg: sum10 / count,
    sampleCount: count,
    spanHours: Math.round(spanHours * 10) / 10, // 1 decimal
  };
};

/**
 * Inject a synthetic reading from the server (used for Hybrid Sync).
 * This fills the gap when the app was closed and the server was monitoring in the background.
 */
export const injectServerEMA = async (
  pm25: number,
  pm10: number,
): Promise<void> => {
  const readings = await loadReadings();
  // We insert it with the current timestamp
  readings.push({ t: Date.now(), p25: pm25, p10: pm10 });
  await pruneAndPersist(readings);
};

/**
 * Clear all stored readings (e.g. when user moves to a new location).
 */
export const clearPMReadings = async (): Promise<void> => {
  cache = [];
  await AsyncStorage.removeItem(STORAGE_KEY);
};

/**
 * Get 24 data points (one per hour) representing the last 24 hours of AQI.
 * Used to render the Trend Chart.
 */
export const getHourlyHistory = async (): Promise<HistoryPoint[]> => {
  const readings = await loadReadings();
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const recent = readings.filter((r) => r.t > cutoff);

  // Pre-initialize bins for the last 24 hours
  const bins: { sum25: number; sum10: number; count: number }[] = Array.from(
    { length: 24 },
    () => ({ sum25: 0, sum10: 0, count: 0 }),
  );

  // Group readings into bins in a single pass O(n)
  for (const r of recent) {
    const hoursAgo = Math.floor((now - r.t) / (60 * 60 * 1000));
    if (hoursAgo >= 0 && hoursAgo < 24) {
      bins[hoursAgo].sum25 += r.p25;
      bins[hoursAgo].sum10 += r.p10;
      bins[hoursAgo].count++;
    }
  }

  const history: HistoryPoint[] = [];
  // For each of the last 24 hours (most recent last)
  for (let i = 23; i >= 0; i--) {
    const binStart = now - (i + 1) * 60 * 60 * 1000;
    const bin = bins[i];

    if (bin.count > 0) {
      const avg25 = bin.sum25 / bin.count;
      const avg10 = bin.sum10 / bin.count;
      history.push({
        time: binStart,
        aqi: Math.round(calculateOverallAQIFromAvg(avg25, avg10)),
      });
    } else {
      // If no data for this bin, we'll return 0 so the chart sits on the floor.
      history.push({ time: binStart, aqi: 0 });
    }
  }
  return history;
};
