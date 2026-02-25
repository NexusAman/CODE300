import { RISK_LIMITS } from "../utils/riskThresholds";

export interface RiskAlert {
  type: string;
  message: string;
}

export const evaluateRisk = (data: any): RiskAlert[] => {
  const alerts: RiskAlert[] = [];

  const pm25 = data.current.air_quality.pm2_5;
  const uv = data.current.uv;
  const temp = data.current.temp_c;
  const visibility = data.current.vis_km;

  if (pm25 > RISK_LIMITS.PM25_DANGER) {
    alerts.push({
      type: "Air Quality",
      message: `PM2.5 is ${pm25}. Air quality is hazardous.`,
    });
  }

  if (uv > RISK_LIMITS.UV_DANGER) {
    alerts.push({
      type: "UV",
      message: `UV index is ${uv}. Protection recommended.`,
    });
  }

  if (temp > RISK_LIMITS.TEMP_DANGER) {
    alerts.push({
      type: "Temperature",
      message: `Temperature is ${temp}°C. Extreme heat detected.`,
    });
  }

  if (visibility < RISK_LIMITS.VISIBILITY_DANGER) {
    alerts.push({
      type: "Visibility",
      message: `Visibility is ${visibility} km. Travel cautiously.`,
    });
  }

  return alerts;
};
