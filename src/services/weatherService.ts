import axios from "axios";

const API_KEY = "85e5949baedc4d6685b55722262502";

export const fetchEnvironmentalData = async (lat: number, lon: number) => {
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
