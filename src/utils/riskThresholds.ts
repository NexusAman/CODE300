export const RISK_LIMITS = {
  // Air Quality — PM2.5 (µg/m³)
  PM25_WARNING: 12, // Above WHO safe limit
  PM25_SEVERE: 35, // Unhealthy for sensitive groups
  PM25_DANGER: 55, // Unhealthy for everyone

  // UV Index
  UV_WARNING: 3, // Moderate — protection recommended
  UV_DANGER: 6, // High — harmful without protection

  // Temperature (°C)
  TEMP_WARNING: 35, // Hot — limit exertion
  TEMP_DANGER: 40, // Dangerous heat

  // Visibility (km)
  VISIBILITY_WARNING: 5, // Reduced — caution needed
  VISIBILITY_DANGER: 2, // Very poor — dangerous

  // Wind (km/h)
  WIND_WARNING: 40, // Strong — affects movement
  WIND_DANGER: 70, // Storm-level — dangerous
};
