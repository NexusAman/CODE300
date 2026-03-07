// ─── Indian National Air Quality Index (NAQI) — CPCB Standard ───────────────
// Breakpoints sourced from Central Pollution Control Board (India)
// AQI Categories: 0-50 Good, 51-100 Satisfactory, 101-200 Moderate,
//                 201-300 Poor, 301-400 Very Poor, 401-500 Severe

import { AirQuality } from "../types/environment";

const interpolate = (
  c: number,
  cLow: number,
  cHigh: number,
  iLow: number,
  iHigh: number,
): number => {
  return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow);
};

// ─── PM2.5 (µg/m³, 24-hr avg) ──────────────────────────────────────────────
export const calculatePM25AQI = (pm25: number): number => {
  if (pm25 <= 30) return interpolate(pm25, 0, 30, 0, 50);
  if (pm25 <= 60) return interpolate(pm25, 30.01, 60, 51, 100);
  if (pm25 <= 90) return interpolate(pm25, 60.01, 90, 101, 200);
  if (pm25 <= 120) return interpolate(pm25, 90.01, 120, 201, 300);
  if (pm25 <= 250) return interpolate(pm25, 120.01, 250, 301, 400);
  return interpolate(Math.min(pm25, 500), 250.01, 500, 401, 500);
};

// ─── PM10 (µg/m³, 24-hr avg) ───────────────────────────────────────────────
export const calculatePM10AQI = (pm10: number): number => {
  if (pm10 <= 50) return interpolate(pm10, 0, 50, 0, 50);
  if (pm10 <= 100) return interpolate(pm10, 50.01, 100, 51, 100);
  if (pm10 <= 250) return interpolate(pm10, 100.01, 250, 101, 200);
  if (pm10 <= 350) return interpolate(pm10, 250.01, 350, 201, 300);
  if (pm10 <= 430) return interpolate(pm10, 350.01, 430, 301, 400);
  return interpolate(Math.min(pm10, 600), 430.01, 600, 401, 500);
};

// ─── O3 — Ozone (µg/m³, 8-hr avg) ─────────────────────────────────────────
// WeatherAPI provides O3 in µg/m³ which matches CPCB units directly
export const calculateO3AQI = (o3: number): number => {
  if (o3 <= 50) return interpolate(o3, 0, 50, 0, 50);
  if (o3 <= 100) return interpolate(o3, 50.01, 100, 51, 100);
  if (o3 <= 168) return interpolate(o3, 100.01, 168, 101, 200);
  if (o3 <= 208) return interpolate(o3, 168.01, 208, 201, 300);
  if (o3 <= 748) return interpolate(o3, 208.01, 748, 301, 400);
  return 500;
};

// ─── CO — Carbon Monoxide (µg/m³ from API → mg/m³ for CPCB) ────────────────
export const calculateCOAQI = (co: number): number => {
  const mgm3 = co / 1000; // WeatherAPI gives µg/m³, CPCB uses mg/m³
  if (mgm3 <= 1) return interpolate(mgm3, 0, 1, 0, 50);
  if (mgm3 <= 2) return interpolate(mgm3, 1.01, 2, 51, 100);
  if (mgm3 <= 10) return interpolate(mgm3, 2.01, 10, 101, 200);
  if (mgm3 <= 17) return interpolate(mgm3, 10.01, 17, 201, 300);
  if (mgm3 <= 34) return interpolate(mgm3, 17.01, 34, 301, 400);
  return 500;
};

// ─── NO2 — Nitrogen Dioxide (µg/m³) ────────────────────────────────────────
export const calculateNO2AQI = (no2: number): number => {
  if (no2 <= 40) return interpolate(no2, 0, 40, 0, 50);
  if (no2 <= 80) return interpolate(no2, 40.01, 80, 51, 100);
  if (no2 <= 180) return interpolate(no2, 80.01, 180, 101, 200);
  if (no2 <= 280) return interpolate(no2, 180.01, 280, 201, 300);
  if (no2 <= 400) return interpolate(no2, 280.01, 400, 301, 400);
  return 500;
};

// ─── SO2 — Sulfur Dioxide (µg/m³) ──────────────────────────────────────────
export const calculateSO2AQI = (so2: number): number => {
  if (so2 <= 40) return interpolate(so2, 0, 40, 0, 50);
  if (so2 <= 80) return interpolate(so2, 40.01, 80, 51, 100);
  if (so2 <= 380) return interpolate(so2, 80.01, 380, 101, 200);
  if (so2 <= 800) return interpolate(so2, 380.01, 800, 201, 300);
  if (so2 <= 1600) return interpolate(so2, 800.01, 1600, 301, 400);
  return 500;
};

// ─── Overall NAQI = MAX of PM2.5 and PM10 sub-indices ───────────────────────
// Note: We exclude Gases (O3, CO, SO2, NO2) from the overall AQI because
// WeatherAPI provides real-time instant values, but CPCB standards require
// 8-hour/24-hour averages for gases. Using real-time gas spikes causes
// massive artificial inflation of AQI compared to official monitors.
export const calculateOverallAQI = (aq: AirQuality): number => {
  // 1️⃣ Server-side CPCB Override (Highest Priority)
  if (aq._cpcbAqi != null) return aq._cpcbAqi;

  const subIndices: number[] = [];

  // 2️⃣ Server-side EMA Override (Smoothed 24-hr average)
  if (aq._emaPM25 != null || aq._emaPM10 != null) {
    if (aq._emaPM25 != null) subIndices.push(calculatePM25AQI(aq._emaPM25));
    if (aq._emaPM10 != null) subIndices.push(calculatePM10AQI(aq._emaPM10));
  } else {
    // 3️⃣ Real-time WeatherAPI values
    if (aq.pm2_5 != null) subIndices.push(calculatePM25AQI(aq.pm2_5));
    if (aq.pm10 != null) subIndices.push(calculatePM10AQI(aq.pm10));
  }

  return subIndices.length > 0 ? Math.max(...subIndices) : 0;
};

// ─── AQI from 24-hour rolling averages (CPCB-accurate) ─────────────────────
// Use this when a rolling average is available for more accurate results.
export const calculateOverallAQIFromAvg = (
  pm25Avg: number,
  pm10Avg: number,
): number => {
  return Math.max(calculatePM25AQI(pm25Avg), calculatePM10AQI(pm10Avg));
};

// Backward compat alias
export const calculateAQI = (pm25: number): number => calculatePM25AQI(pm25);

// ─── NAQI Colors (CPCB official palette) ────────────────────────────────────
export const getAQIColor = (aqi: number) => {
  if (aqi <= 50) return "#22C55E"; // Good — green
  if (aqi <= 100) return "#A3E635"; // Satisfactory — lime
  if (aqi <= 200) return "#FBBF24"; // Moderate — yellow
  if (aqi <= 300) return "#FB923C"; // Poor — orange
  if (aqi <= 400) return "#F87171"; // Very Poor — red
  return "#E879F9"; // Severe — purple
};

// ─── NAQI Labels (CPCB categories) ──────────────────────────────────────────
export const getAQILabelByValue = (aqi: number) => {
  if (aqi <= 50) return "GOOD";
  if (aqi <= 100) return "SATISFACTORY";
  if (aqi <= 200) return "MODERATE";
  if (aqi <= 300) return "POOR";
  if (aqi <= 400) return "VERY POOR";
  return "SEVERE";
};
