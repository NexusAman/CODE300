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
};
