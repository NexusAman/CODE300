import { EnvironmentalData } from "../types/environment";
import { calculateOverallAQI } from "../utils/aqi";
import { RISK_LIMITS } from "../utils/riskThresholds";

export interface RiskAlert {
  type: string; // unique key for deduplication in alertedTypesRef
  severity: "warning" | "severe" | "danger";
  message: string;
}

export const evaluateRisk = (
  data: EnvironmentalData | null | undefined,
): RiskAlert[] => {
  const alerts: RiskAlert[] = [];

  const aq = data?.current?.air_quality;
  const uv = data?.current?.uv;
  const temp = data?.current?.temp_c;
  const visibility = data?.current?.vis_km;
  const wind = data?.current?.wind_kph;

  if (aq) {
    const aqi = calculateOverallAQI(aq);

    if (aqi >= RISK_LIMITS.AQI_DANGER) {
      alerts.push({
        type: "AQI_danger",
        severity: "danger",
        message: `☠️ Severe air quality — AQI ${aqi}. Serious health impact, stay indoors.`,
      });
    } else if (aqi >= RISK_LIMITS.AQI_SEVERE) {
      alerts.push({
        type: "AQI_severe",
        severity: "severe",
        message: `🚨 Very poor air — AQI ${aqi}. Respiratory illness risk, avoid outdoors.`,
      });
    } else if (aqi >= RISK_LIMITS.AQI_WARNING) {
      alerts.push({
        type: "AQI_warning",
        severity: "warning",
        message: `⚠️ Poor air quality — AQI ${aqi}. Health discomfort possible.`,
      });
    } else if (aqi >= RISK_LIMITS.AQI_LIGHT_WARNING) {
      alerts.push({
        type: "AQI_light_warning",
        severity: "warning",
        message: `💨 Moderate air — AQI ${aqi}. Sensitive groups should take caution.`,
      });
    }
  }

  // ─── UV Index (IMD / WHO) ─────────────────────────────────────────────
  if (uv != null) {
    if (uv >= RISK_LIMITS.UV_DANGER) {
      alerts.push({
        type: "UV_danger",
        severity: "danger",
        message: `☀️ Extreme UV index (${uv}). Avoid sun exposure, use SPF 50+.`,
      });
    } else if (uv >= RISK_LIMITS.UV_SEVERE) {
      alerts.push({
        type: "UV_severe",
        severity: "severe",
        message: `☀️ Very high UV index (${uv}). Limit midday sun, wear protective clothing.`,
      });
    } else if (uv >= RISK_LIMITS.UV_WARNING) {
      alerts.push({
        type: "UV_warning",
        severity: "warning",
        message: `🌤 Moderate UV index (${uv}). Apply sunscreen before going out.`,
      });
    }
  }

  // ─── Temperature (IMD Heatwave) ───────────────────────────────────────
  if (temp != null) {
    if (temp >= RISK_LIMITS.TEMP_DANGER) {
      alerts.push({
        type: "Temp_danger",
        severity: "danger",
        message: `🌡 Extreme heat — ${temp}°C. Life-threatening, stay indoors with cooling.`,
      });
    } else if (temp >= RISK_LIMITS.TEMP_SEVERE) {
      alerts.push({
        type: "Temp_severe",
        severity: "severe",
        message: `🌡 Severe heat — ${temp}°C. Risk of heatstroke, stay hydrated and indoors.`,
      });
    } else if (temp >= RISK_LIMITS.TEMP_WARNING) {
      alerts.push({
        type: "Temp_warning",
        severity: "warning",
        message: `🌡 High temperature — ${temp}°C. Stay hydrated and limit exertion.`,
      });
    }
  }

  // ─── Visibility (IMD Fog Classification) ──────────────────────────────
  if (visibility != null) {
    if (visibility <= RISK_LIMITS.VISIBILITY_DANGER) {
      alerts.push({
        type: "Visibility_danger",
        severity: "danger",
        message: `🌫 Dense fog — ${visibility} km visibility. Do not drive.`,
      });
    } else if (visibility <= RISK_LIMITS.VISIBILITY_SEVERE) {
      alerts.push({
        type: "Visibility_severe",
        severity: "severe",
        message: `🌫 Very poor visibility — ${visibility} km. Avoid driving if possible.`,
      });
    } else if (visibility <= RISK_LIMITS.VISIBILITY_WARNING) {
      alerts.push({
        type: "Visibility_warning",
        severity: "warning",
        message: `🌫 Reduced visibility — ${visibility} km. Drive with caution.`,
      });
    }
  }

  // ─── Wind Speed (IMD Wind Severity) ───────────────────────────────────
  if (wind != null) {
    if (wind >= RISK_LIMITS.WIND_DANGER) {
      alerts.push({
        type: "Wind_danger",
        severity: "danger",
        message: `💨 Cyclonic winds — ${wind} km/h. Stay indoors, avoid all outdoor activity.`,
      });
    } else if (wind >= RISK_LIMITS.WIND_SEVERE) {
      alerts.push({
        type: "Wind_severe",
        severity: "severe",
        message: `💨 Storm-level winds — ${wind} km/h. Avoid outdoor activity.`,
      });
    } else if (wind >= RISK_LIMITS.WIND_WARNING) {
      alerts.push({
        type: "Wind_warning",
        severity: "warning",
        message: `💨 Strong winds — ${wind} km/h. Secure loose objects outdoors.`,
      });
    }
  }

  return alerts;
};
