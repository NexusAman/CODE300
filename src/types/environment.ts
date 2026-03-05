// FIX: field names were wrong (pm25 → pm2_5, visibility → vis_km) and
// didn't match the actual WeatherAPI response shape. Now accurate and
// used as the return type for fetchEnvironmentalData.

export interface AirQuality {
  pm2_5?: number;
  pm10?: number;
  co?: number;
  no2?: number;
  o3?: number;
  so2?: number;
  "us-epa-index"?: number;
}

export interface CurrentWeather {
  temp_c: number;
  feelslike_c: number;
  uv: number;
  is_day: 0 | 1; // 1 = daytime, 0 = night — WeatherAPI always returns this
  vis_km: number;
  humidity: number;
  wind_kph: number;
  precip_mm: number;
  condition?: {
    text?: string;
  };
  air_quality: AirQuality;
}

export interface WeatherLocation {
  name?: string;
  region?: string;
}

export interface EnvironmentalData {
  current: CurrentWeather;
  location?: WeatherLocation;
}
