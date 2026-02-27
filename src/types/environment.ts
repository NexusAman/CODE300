// FIX: field names were wrong (pm25 → pm2_5, visibility → vis_km) and
// didn't match the actual WeatherAPI response shape. Now accurate and
// used as the return type for fetchEnvironmentalData.

export interface AirQuality {
  pm2_5: number;
  "us-epa-index": number;
}

export interface CurrentWeather {
  temp_c: number;
  feelslike_c: number;
  uv: number;
  vis_km: number;
  humidity: number;
  wind_kph: number;
  precip_mm: number;
  air_quality: AirQuality;
}

export interface EnvironmentalData {
  current: CurrentWeather;
}
