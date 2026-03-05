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
  generateId,
  getSavedLocations,
  removeLocation,
  SavedLocation,
  saveLocation,
} from "../../src/services/savedLocationsService";
import {
  fetchEnvironmentalData,
  searchLocations,
  WeatherSearchResult,
} from "../../src/services/weatherService";
import {
  calculateOverallAQI,
  getAQIColor,
  getAQILabelByValue,
} from "../../src/utils/aqi";

// ─── Saved Location Card ──────────────────────────────────────────────────────

type WeatherSummary = {
  aqi: number;
  temp: number;
  feelsLike: number;
  condition: string;
  uv: number;
  humidity: number;
  wind: number;
} | null;

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
    const loadWeather = async () => {
      try {
        const envData = await fetchEnvironmentalData(
          loc.latitude,
          loc.longitude,
        );
        const c = envData?.current;
        setWeather({
          aqi: c?.air_quality ? calculateOverallAQI(c.air_quality) : 0,
          temp: c?.temp_c ?? 0,
          feelsLike: c?.feelslike_c ?? c?.temp_c ?? 0,
          condition: c?.condition?.text ?? "",
          uv: c?.is_day === 0 ? 0 : (c?.uv ?? 0),
          humidity: c?.humidity ?? 0,
          wind: c?.wind_kph ?? 0,
        });
      } catch {
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };
    loadWeather();
  }, [loc.latitude, loc.longitude]);

  const aqiColor = weather ? getAQIColor(weather.aqi) : "#6B7280";
  const aqiPct = weather ? Math.min(weather.aqi / 500, 1) : 0;

  return (
    <View style={[cs.card, { borderColor: aqiColor + "25" }]}>
      {/* Top row: name + remove */}
      <View style={cs.topRow}>
        <View style={cs.nameBlock}>
          <Text style={cs.name}>{loc.name}</Text>
          <Text style={cs.subtitle}>{loc.subtitle}</Text>
        </View>
        <TouchableOpacity
          style={cs.removeBtn}
          onPress={() => onRemove(loc.id)}
          activeOpacity={0.7}
        >
          <Text style={cs.removeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator
          size="small"
          color="#6B7280"
          style={{ marginTop: 14 }}
        />
      ) : weather ? (
        <>
          {/* AQI row */}
          <View style={cs.aqiRow}>
            <Text style={[cs.aqiNum, { color: aqiColor }]}>{weather.aqi}</Text>
            <View style={cs.aqiMeta}>
              <Text style={[cs.aqiLbl, { color: aqiColor }]}>
                {getAQILabelByValue(weather.aqi)}
              </Text>
              <Text style={cs.conditionText}>{weather.condition}</Text>
            </View>
          </View>

          {/* AQI progress bar */}
          <View style={cs.barTrack}>
            <View
              style={[
                cs.barFill,
                { width: `${aqiPct * 100}%`, backgroundColor: aqiColor },
              ]}
            />
          </View>

          {/* Stats row */}
          <View style={cs.statsRow}>
            <View style={cs.stat}>
              <Text style={cs.statIcon}>🌡</Text>
              <Text style={cs.statVal}>{weather.temp}°C</Text>
              <Text style={cs.statLbl}>Temp</Text>
            </View>
            <View style={cs.statDiv} />
            <View style={cs.stat}>
              <Text style={cs.statIcon}>☀️</Text>
              <Text style={cs.statVal}>{weather.uv}</Text>
              <Text style={cs.statLbl}>UV</Text>
            </View>
            <View style={cs.statDiv} />
            <View style={cs.stat}>
              <Text style={cs.statIcon}>💧</Text>
              <Text style={cs.statVal}>{weather.humidity}%</Text>
              <Text style={cs.statLbl}>Humidity</Text>
            </View>
            <View style={cs.statDiv} />
            <View style={cs.stat}>
              <Text style={cs.statIcon}>💨</Text>
              <Text style={cs.statVal}>{weather.wind}</Text>
              <Text style={cs.statLbl}>km/h</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={cs.metaErr}>Could not load data</Text>
      )}
    </View>
  );
};

const cs = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  nameBlock: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: "700", color: "#F9FAFB" },
  subtitle: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  metaErr: { fontSize: 12, color: "#EF4444", marginTop: 10 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    marginLeft: 10,
  },
  removeText: { fontSize: 11, color: "#F87171", fontWeight: "700" },

  aqiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    marginBottom: 10,
  },
  aqiNum: { fontSize: 42, fontWeight: "800", letterSpacing: -1 },
  aqiMeta: { gap: 3 },
  aqiLbl: { fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  conditionText: { fontSize: 12, color: "#9CA3AF", fontWeight: "500" },

  barTrack: {
    width: "100%",
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginBottom: 16,
    overflow: "hidden",
  },
  barFill: { height: 5, borderRadius: 3, opacity: 0.85 },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statDiv: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  statIcon: { fontSize: 14 },
  statVal: { fontSize: 14, fontWeight: "700", color: "#F3F4F6" },
  statLbl: {
    fontSize: 9,
    color: "#6B7280",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});

// ─── Search Result Item ───────────────────────────────────────────────────────

const SearchResultItem = ({
  item,
  onAdd,
}: {
  item: WeatherSearchResult;
  onAdd: (item: WeatherSearchResult) => void;
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
  const [searchResults, setSearchResults] = useState<WeatherSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const locs = await getSavedLocations();
    setLocations(locs);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        const results = await searchLocations(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [query]);

  const handleAdd = async (item: WeatherSearchResult) => {
    // Prevent duplicate locations with same lat/lon
    const existing = await getSavedLocations();
    const isDuplicate = existing.some(
      (l) =>
        Math.abs(l.latitude - item.lat) < 0.001 &&
        Math.abs(l.longitude - item.lon) < 0.001,
    );
    if (isDuplicate) {
      setQuery("");
      setSearchResults([]);
      return;
    }

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
          {searchResults.map((item) => (
            <SearchResultItem
              key={`${item.lat},${item.lon}`}
              item={item}
              onAdd={handleAdd}
            />
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
