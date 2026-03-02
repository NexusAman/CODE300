import axios from "axios";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  SavedLocation,
  generateId,
  getSavedLocations,
  removeLocation,
  saveLocation,
} from "../../src/services/savedLocationsService";

const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const calculateAQI = (pm25: number): number => {
  if (pm25 <= 12) return Math.round((50 / 12) * pm25);
  if (pm25 <= 35.4)
    return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51);
  if (pm25 <= 55.4)
    return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101);
  if (pm25 <= 150.4)
    return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151);
  return Math.round(((300 - 201) / (250.4 - 150.5)) * (pm25 - 150.5) + 201);
};

const getAQIColor = (aqi: number) => {
  if (aqi <= 50) return "#34D399";
  if (aqi <= 100) return "#FBBF24";
  if (aqi <= 150) return "#FB923C";
  if (aqi <= 200) return "#F87171";
  return "#E879F9";
};

// ─── Saved Location Card ──────────────────────────────────────────────────────

type WeatherSummary = { aqi: number; temp: number; condition: string } | null;

const LocationCard = ({
  loc,
  onRemove,
}: {
  loc: SavedLocation;
  onRemove: (id: string) => void;
}) => {
  const [weather, setWeather] = useState<WeatherSummary>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(
          "https://api.weatherapi.com/v1/current.json",
          {
            params: {
              key: API_KEY,
              q: `${loc.latitude},${loc.longitude}`,
              aqi: "yes",
            },
          },
        );
        const pm25 = res.data?.current?.air_quality?.pm2_5;
        setWeather({
          aqi: pm25 ? calculateAQI(pm25) : 0,
          temp: res.data?.current?.temp_c,
          condition: res.data?.current?.condition?.text ?? "",
        });
      } catch {
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [loc.latitude, loc.longitude]);

  const aqiColor = weather ? getAQIColor(weather.aqi) : "#6B7280";

  return (
    <View style={cs.card}>
      <View style={cs.left}>
        <Text style={cs.name}>{loc.name}</Text>
        <Text style={cs.subtitle}>{loc.subtitle}</Text>
        {loading ? (
          <ActivityIndicator
            size="small"
            color="#6B7280"
            style={{ marginTop: 6 }}
          />
        ) : weather ? (
          <Text style={cs.meta}>
            {weather.condition} · {weather.temp}°C
          </Text>
        ) : (
          <Text style={cs.metaErr}>Could not load data</Text>
        )}
      </View>
      <View style={cs.right}>
        {weather && !loading && (
          <View
            style={[
              cs.aqiBadge,
              {
                borderColor: aqiColor + "50",
                backgroundColor: aqiColor + "15",
              },
            ]}
          >
            <Text style={[cs.aqiLabel, { color: aqiColor }]}>AQI</Text>
            <Text style={[cs.aqiValue, { color: aqiColor }]}>
              {weather.aqi}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={cs.removeBtn}
          onPress={() => onRemove(loc.id)}
          activeOpacity={0.7}
        >
          <Text style={cs.removeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const cs = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  left: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "700", color: "#F9FAFB" },
  subtitle: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  meta: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  metaErr: { fontSize: 12, color: "#EF4444", marginTop: 4 },
  right: { alignItems: "center", gap: 10, marginLeft: 12 },
  aqiBadge: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 1,
  },
  aqiLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 1.5 },
  aqiValue: { fontSize: 18, fontWeight: "800" },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  removeText: { fontSize: 11, color: "#F87171", fontWeight: "700" },
});

// ─── Search Result Item ───────────────────────────────────────────────────────

const SearchResultItem = ({
  item,
  onAdd,
}: {
  item: any;
  onAdd: (item: any) => void;
}) => (
  <TouchableOpacity
    style={sr.row}
    onPress={() => onAdd(item)}
    activeOpacity={0.7}
  >
    <View style={sr.info}>
      <Text style={sr.name}>{item.name}</Text>
      <Text style={sr.sub}>
        {[item.region, item.country].filter(Boolean).join(", ")}
      </Text>
    </View>
    <Text style={sr.add}>+ Add</Text>
  </TouchableOpacity>
);

const sr = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  info: { flex: 1 },
  name: { fontSize: 14, color: "#F3F4F6", fontWeight: "600" },
  sub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  add: { fontSize: 13, color: "#34D399", fontWeight: "700", marginLeft: 12 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SavedLocationsScreen() {
  const router = useRouter();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const locs = await getSavedLocations();
    setLocations(locs);
  }, []);

  useEffect(() => {
    load();
  }, []);

  // Debounced search — calls WeatherAPI's search endpoint
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim() || query.length < 3) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(
          "https://api.weatherapi.com/v1/search.json",
          { params: { key: API_KEY, q: query } },
        );
        setSearchResults(res.data ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  }, [query]);

  const handleAdd = async (item: any) => {
    const loc: SavedLocation = {
      id: generateId(),
      name: item.name,
      subtitle: [item.region, item.country].filter(Boolean).join(", "),
      latitude: item.lat,
      longitude: item.lon,
    };
    await saveLocation(loc);
    setQuery("");
    setSearchResults([]);
    load();
  };

  const handleRemove = async (id: string) => {
    await removeLocation(id);
    load();
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>SAVED LOCATIONS</Text>
      </View>

      {/* Search bar */}
      <View style={s.searchRow}>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search city or region…"
          placeholderTextColor="#4B5563"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && (
          <ActivityIndicator color="#34D399" style={{ marginLeft: 10 }} />
        )}
      </View>

      {/* Search results */}
      {searchResults.length > 0 && (
        <View style={s.resultsBox}>
          {searchResults.map((item, i) => (
            <SearchResultItem key={i} item={item} onAdd={handleAdd} />
          ))}
        </View>
      )}

      {/* Saved list */}
      {locations.length === 0 && !query ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📍</Text>
          <Text style={s.emptyText}>No saved locations yet.</Text>
          <Text style={s.emptyHint}>
            Search for a city above to add it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => (
            <LocationCard loc={item} onRemove={handleRemove} />
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0d0d14",
    paddingHorizontal: 20,
    paddingTop: 58,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 16,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  backText: { fontSize: 13, color: "#9CA3AF", fontWeight: "600" },
  title: {
    fontSize: 10,
    letterSpacing: 3,
    color: "#4B5563",
    fontWeight: "800",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#F3F4F6",
    fontWeight: "500",
  },
  resultsBox: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 16, color: "#9CA3AF", fontWeight: "600" },
  emptyHint: {
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    fontWeight: "500",
  },
});
