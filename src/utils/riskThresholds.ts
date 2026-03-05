export const RISK_LIMITS = {
  // ─── Overall AQI (NAQI / CPCB) ─────────────────────────────
  AQI_LIGHT_WARNING: 100, // Satisfactory → Moderate
  AQI_WARNING: 200, // Moderate → Poor
  AQI_SEVERE: 300, // Poor → Very Poor
  AQI_DANGER: 400, // Very Poor → Severe

  // ─── UV Index (IMD / WHO) ──────────────────────────────────
  UV_WARNING: 3,
  UV_SEVERE: 6,
  UV_DANGER: 8,

  // ─── Temperature °C (IMD Heatwave) ────────────────────────
  TEMP_WARNING: 36,
  TEMP_SEVERE: 40,
  TEMP_DANGER: 45,

  // ─── Visibility km (IMD Fog Classification) ───────────────
  VISIBILITY_WARNING: 3,
  VISIBILITY_SEVERE: 1,
  VISIBILITY_DANGER: 0.2,

  // ─── Wind km/h (IMD Wind Severity) ────────────────────────
  WIND_WARNING: 40,
  WIND_SEVERE: 60,
  WIND_DANGER: 80,

  // ─── PM2.5 µg/m³ (WHO / CPCB) ─────────────────────────────
  PM25_WARNING: 30, // Moderate
  PM25_SEVERE: 60, // Poor
  PM25_DANGER: 90, // Very Poor

  // ─── PM10 µg/m³ (WHO / CPCB) ──────────────────────────────
  PM10_WARNING: 50, // Moderate
  PM10_SEVERE: 100, // Poor
  PM10_DANGER: 250, // Very Poor

  // ─── Humidity % ───────────────────────────────────────────
  HUMIDITY_WARNING: 75, // Uncomfortable
  HUMIDITY_SEVERE: 85, // Very muggy
  HUMIDITY_DANGER: 95, // Oppressive

  // ─── Precipitation mm/hr (IMD) ─────────────────────────────
  PRECIP_WARNING: 2.5, // Light rain
  PRECIP_SEVERE: 7.5, // Moderate rain
  PRECIP_DANGER: 35.5, // Heavy rain
};
