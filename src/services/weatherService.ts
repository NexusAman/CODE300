import axios from "axios";

// FIX: API key was hardcoded in source — anyone with repo access could use your quota.
// Move it to a .env file at your project root:
//   EXPO_PUBLIC_WEATHER_API_KEY=your_key_here
// Expo automatically exposes EXPO_PUBLIC_* vars to the client bundle.
const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

export const fetchEnvironmentalData = async (lat: number, lon: number) => {
  if (!API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_WEATHER_API_KEY in environment");
  }

  const response = await axios.get(
    "https://api.weatherapi.com/v1/current.json",
    {
      params: {
        key: API_KEY,
        q: `${lat},${lon}`,
        aqi: "yes",
      },
    },
  );

  return response.data;
};
