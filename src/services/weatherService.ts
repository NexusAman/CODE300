import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { EnvironmentalData } from "../types/environment";

// FIX: API key was hardcoded in source — anyone with repo access could use your quota.
// Move it to a .env file at your project root:
//   EXPO_PUBLIC_WEATHER_API_KEY=your_key_here
// Expo automatically exposes EXPO_PUBLIC_* vars to the client bundle.
const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
const API_TIMEOUT_MS = 10000;
const API_RETRY_COUNT = 2;

const weatherApi = axios.create({
  timeout: API_TIMEOUT_MS,
});

const isRetriableAxiosError = (error: unknown): boolean => {
  const axiosError = error as AxiosError;
  const status = axiosError.response?.status;
  if (status != null) {
    return status >= 500 || status === 429;
  }
  return axiosError.code === "ECONNABORTED" || !axiosError.response;
};

const requestWithRetry = async <T>(
  config: AxiosRequestConfig,
  retries = API_RETRY_COUNT,
): Promise<AxiosResponse<T>> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await weatherApi.request<T>(config);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetriableAxiosError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  throw lastError;
};

export type WeatherSearchResult = {
  name: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
};

export const fetchEnvironmentalData = async (
  lat: number,
  lon: number,
): Promise<EnvironmentalData> => {
  if (!API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_WEATHER_API_KEY in environment");
  }

  const response = await requestWithRetry<EnvironmentalData>({
    method: "GET",
    url: "https://api.weatherapi.com/v1/current.json",
    params: {
      key: API_KEY,
      q: `${lat},${lon}`,
      aqi: "yes",
    },
  });

  return response.data;
};

export const searchLocations = async (
  query: string,
): Promise<WeatherSearchResult[]> => {
  if (!API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_WEATHER_API_KEY in environment");
  }

  const response = await requestWithRetry<WeatherSearchResult[]>({
    method: "GET",
    url: "https://api.weatherapi.com/v1/search.json",
    params: { key: API_KEY, q: query },
  });

  return response.data ?? [];
};
