import { RISK_LIMITS } from "../utils/riskThresholds";

export interface RiskAlert {
  type: string; // unique key for deduplication in alertedTypesRef
  severity: "warning" | "severe" | "danger";
  message: string;
}

export const evaluateRisk = (data: any): RiskAlert[] => {
  const alerts: RiskAlert[] = [];

  const pm25 = data?.current?.air_quality?.pm2_5;
  const uv = data?.current?.uv;
  const temp = data?.current?.temp_c;
  const visibility = data?.current?.vis_km;
  const wind = data?.current?.wind_kph;

  if (pm25 == null || uv == null || temp == null || visibility == null) {
    return alerts;
  }

  // ─── Air Quality (PM2.5) ──────────────────────────────────────────────────
  // Only highest applicable tier fires — type includes tier for correct deduplication
  if (pm25 > RISK_LIMITS.PM25_DANGER) {
    alerts.push({
      type: "AirQuality_danger",
      severity: "danger",
      message: `🫁 Hazardous air — PM2.5 at ${pm25.toFixed(1)} µg/m³. Stay indoors, avoid all outdoor activity.`,
    });
  } else if (pm25 > RISK_LIMITS.PM25_SEVERE) {
    alerts.push({
      type: "AirQuality_severe",
      severity: "severe",
      message: `😷 Unhealthy air — PM2.5 at ${pm25.toFixed(1)} µg/m³. Wear a mask outdoors.`,
    });
  } else if (pm25 > RISK_LIMITS.PM25_WARNING) {
    alerts.push({
      type: "AirQuality_warning",
      severity: "warning",
      message: `⚠️ Air quality declining — PM2.5 at ${pm25.toFixed(1)} µg/m³. Sensitive groups should limit outdoor time.`,
    });
  }

  // ─── UV Index ─────────────────────────────────────────────────────────────
  if (uv > RISK_LIMITS.UV_DANGER) {
    alerts.push({
      type: "UV_danger",
      severity: "danger",
      message: `☀️ Extreme UV index (${uv}). Avoid direct sun, use SPF 50+.`,
    });
  } else if (uv > RISK_LIMITS.UV_WARNING) {
    alerts.push({
      type: "UV_warning",
      severity: "warning",
      message: `🌤 Moderate UV index (${uv}). Apply sunscreen before going out.`,
    });
  }

  // ─── Temperature ──────────────────────────────────────────────────────────
  if (temp > RISK_LIMITS.TEMP_DANGER) {
    alerts.push({
      type: "Temp_danger",
      severity: "danger",
      message: `🌡 Extreme heat — ${temp}°C. Risk of heatstroke. Stay hydrated and indoors.`,
    });
  } else if (temp > RISK_LIMITS.TEMP_WARNING) {
    alerts.push({
      type: "Temp_warning",
      severity: "warning",
      message: `🌡 High temperature — ${temp}°C. Stay hydrated and limit exertion.`,
    });
  }

  // ─── Visibility ───────────────────────────────────────────────────────────
  if (visibility < RISK_LIMITS.VISIBILITY_DANGER) {
    alerts.push({
      type: "Visibility_danger",
      severity: "danger",
      message: `🌫 Very poor visibility — ${visibility} km. Avoid driving if possible.`,
    });
  } else if (visibility < RISK_LIMITS.VISIBILITY_WARNING) {
    alerts.push({
      type: "Visibility_warning",
      severity: "warning",
      message: `🌫 Reduced visibility — ${visibility} km. Drive with caution.`,
    });
  }

  // ─── Wind ─────────────────────────────────────────────────────────────────
  if (wind != null) {
    if (wind > RISK_LIMITS.WIND_DANGER) {
      alerts.push({
        type: "Wind_danger",
        severity: "danger",
        message: `💨 Storm-level winds — ${wind} km/h. Avoid outdoor activity.`,
      });
    } else if (wind > RISK_LIMITS.WIND_WARNING) {
      alerts.push({
        type: "Wind_warning",
        severity: "warning",
        message: `💨 Strong winds — ${wind} km/h. Secure loose objects outdoors.`,
      });
    }
  }

  return alerts;
};
