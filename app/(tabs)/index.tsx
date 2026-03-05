import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
  RefreshControl,
  Animated as RNAnimated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { evaluateRisk, RiskAlert } from "../../src/engine/riskEngine";
import { sendRiskNotification } from "../../src/notifications/notificationService";
import {
  getFCMToken,
  registerDeviceWithServer,
  updateLocationOnServer,
} from "../../src/services/fcmService";
import {
  getBackgroundLocationPermissionStatus,
  getUserLocation,
  isBackgroundLocationRunning,
  startBackgroundLocation,
} from "../../src/services/locationService";
import { fetchEnvironmentalData } from "../../src/services/weatherService";
import { EnvironmentalData } from "../../src/types/environment";
import { calculateOverallAQI, getAQILabelByValue } from "../../src/utils/aqi";
import { METRIC_COLORS } from "../../src/utils/metricColors";
import { RISK_LIMITS } from "../../src/utils/riskThresholds";

// ─── AQI Helpers ─────────────────────────────────────────────────────────────

// ─── Risk Config ──────────────────────────────────────────────────────────────

type RiskConfig = {
  level: string;
  color: string;
  glow: string;
  icon: string;
  bg: string;
  advice: string;
};

// ─── NAQI Risk Tiers (CPCB India) ──────────────────────────────────────────
const getRiskConfig = (realAQI: number | null): RiskConfig => {
  if (realAQI == null)
    return {
      level: "UNKNOWN",
      color: "#6B7280",
      glow: "#6B728020",
      icon: "◎",
      bg: "#0d0d14",
      advice: "Awaiting sensor data…",
    };
  if (realAQI <= 50)
    return {
      level: "GOOD",
      color: "#22C55E",
      glow: "#22C55E20",
      icon: "✦",
      bg: "#060f0a",
      advice: "Air quality is ideal. Enjoy outdoor activities.",
    };
  if (realAQI <= 100)
    return {
      level: "SATISFACTORY",
      color: "#A3E635",
      glow: "#A3E63520",
      icon: "✦",
      bg: "#080f04",
      advice: "Minor discomfort possible for very sensitive people.",
    };
  if (realAQI <= 200)
    return {
      level: "MODERATE",
      color: "#FBBF24",
      glow: "#FBBF2420",
      icon: "◈",
      bg: "#0f0c00",
      advice: "May cause discomfort to people with asthma or heart disease.",
    };
  if (realAQI <= 300)
    return {
      level: "POOR",
      color: "#FB923C",
      glow: "#FB923C20",
      icon: "⚠",
      bg: "#0f0800",
      advice: "Discomfort on prolonged exposure. Avoid outdoor exertion.",
    };
  if (realAQI <= 400)
    return {
      level: "VERY POOR",
      color: "#F87171",
      glow: "#F8717120",
      icon: "⚠",
      bg: "#0f0505",
      advice: "May cause respiratory illness. Limit outdoor activity.",
    };
  return {
    level: "SEVERE",
    color: "#E879F9",
    glow: "#E879F920",
    icon: "☣",
    bg: "#0d0010",
    advice: "Health emergency. Stay indoors, use air purifier.",
  };
};

// ─── Relative Time Helper ────────────────────────────────────────────────────────────
const getRelativeTime = (date: Date): string => {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  return `${diffHours} hours ago`;
};

// ─── AQI Gauge ────────────────────────────────────────────────────────────────

const AQIGauge = ({ aqi, color }: { aqi: number | null; color: string }) => {
  const widthAnim = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.timing(widthAnim, {
      toValue: Math.min((aqi ?? 0) / 500, 1),
      duration: 1000,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aqi]);

  const barWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={gaugeS.wrapper}>
      <View style={gaugeS.track}>
        {["#22C55E", "#A3E635", "#FBBF24", "#FB923C", "#F87171", "#E879F9"].map(
          (c, i) => (
            <View key={i} style={[gaugeS.seg, { backgroundColor: c + "28" }]} />
          ),
        )}
        <RNAnimated.View
          style={[gaugeS.fill, { width: barWidth, backgroundColor: color }]}
        />
      </View>
      <View style={gaugeS.ticks}>
        {["0", "100", "200", "300", "400", "500"].map((t) => (
          <Text key={t} style={gaugeS.tick}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
};

const gaugeS = StyleSheet.create({
  wrapper: { width: "100%", marginTop: 6 },
  track: {
    height: 10,
    borderRadius: 5,
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    position: "relative",
  },
  seg: { flex: 1, height: 10 },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 10,
    borderRadius: 5,
    opacity: 0.9,
  },
  ticks: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  tick: { fontSize: 9, color: "#4B5563", fontWeight: "600" },
});

const StatChip = ({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
}) => (
  <View style={[chipS.chip, { backgroundColor: accent + "15" }]}>
    <Text style={{ fontSize: 20 }}>{icon}</Text>
    <Text style={[chipS.value, { color: accent }]}>{value}</Text>
    <Text style={chipS.label}>{label}</Text>
  </View>
);

const chipS = StyleSheet.create({
  chip: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 6,
    gap: 4,
  },
  value: { fontSize: 17, fontWeight: "800", letterSpacing: 0.2 },
  label: { fontSize: 9, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1 },
});

// ─── Metric Row ───────────────────────────────────────────────────────────────

const MetricRow = ({
  icon,
  label,
  value,
  accent,
  last,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: string;
  last?: boolean;
}) => (
  <View style={[mS.row, last && { borderBottomWidth: 0, paddingBottom: 0 }]}>
    <View style={mS.left}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text style={mS.label}>{label}</Text>
    </View>
    <Text style={[mS.value, accent ? { color: accent } : {}]}>{value}</Text>
  </View>
);

const mS = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontSize: 13, color: "#9CA3AF", letterSpacing: 0.2 },
  value: { fontSize: 13, color: "#F9FAFB", fontWeight: "700" },
});

// ─── Alert History Item ───────────────────────────────────────────────────────

const severityConfig = {
  danger: {
    color: "#E879F9",
    bg: "#E879F910",
    border: "#E879F930",
    label: "DANGER",
  },
  severe: {
    color: "#F87171",
    bg: "#F8717110",
    border: "#F8717130",
    label: "SEVERE",
  },
  warning: {
    color: "#FBBF24",
    bg: "#FBBF2410",
    border: "#FBBF2430",
    label: "WARN",
  },
};

const AlertHistoryItem = ({
  message,
  time,
  severity,
}: {
  message: string;
  time: string;
  severity?: "warning" | "severe" | "danger";
}) => {
  const cfg = severityConfig[severity ?? "severe"];
  return (
    <View
      style={[ahS.row, { borderLeftColor: cfg.color, backgroundColor: cfg.bg }]}
    >
      <View style={ahS.topRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={[
              ahS.severityBadge,
              { backgroundColor: cfg.bg, borderColor: cfg.border },
            ]}
          >
            <Text style={[ahS.severityLabel, { color: cfg.color }]}>
              {cfg.label}
            </Text>
          </View>
        </View>
        <Text style={ahS.time}>{time}</Text>
      </View>
      <Text style={ahS.msg}>{message}</Text>
    </View>
  );
};

const ahS = StyleSheet.create({
  row: {
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 6,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  severityLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  time: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "600",
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  msg: {
    fontSize: 12,
    color: "#D1D5DB",
    lineHeight: 18,
    fontWeight: "500",
  },
});

// ─── Refresh Interval & AppState Cooldown ────────────────────────────────────
// FIX: 2 min interval — frequent enough for live weather feel,
// responsible enough to not burn API quota.
// AppState cooldown — prevents spam calls when user rapidly switches apps.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — matches server cron, saves battery + API quota
const APPSTATE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ─── Main Component ───────────────────────────────────────────────────────────

// We export context so the root layout can color the StatusBar dynamically
export const RiskContext = React.createContext<{ bg: string; color?: string }>({
  bg: "#000000",
});

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EnvironmentalData | null>(null);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // FIX: Gate to prevent checkEnvironment running before AsyncStorage loads
  const [alertsLoaded, setAlertsLoaded] = useState(false);

  // 🔔 Alert control
  // FIX: was useState — stale closure meant alertedTypes was always [] inside handleRiskNotification,
  // causing every alert to re-trigger a notification on every refresh.
  const alertedTypesRef = useRef<string[]>([]);
  const [alertHistory, setAlertHistory] = useState<
    {
      message: string;
      time: string;
      severity: "warning" | "severe" | "danger";
    }[]
  >([]);

  // 📈 AQI Trend
  // FIX: was useState — stale closure meant previousAQI was always null inside checkEnvironment,
  // so trend was never computed.
  const previousAQIRef = useRef<number | null>(null);
  const isCheckingRef = useRef(false); // ⛔ prevents overlapping checks
  const [refreshing, setRefreshing] = useState(false);
  const [trend, setTrend] = useState<"up" | "down" | "stable" | null>(null);
  const hasCachedDataRef = useRef(false); // tracks if cached data was restored

  // 🔕 null = not yet checked, false = ok, true = denied
  // Starting as null prevents the banner from flashing on first render
  // before the permission check has actually completed.
  const [bgLocationDenied, setBgLocationDenied] = useState<boolean | null>(
    null,
  );
  const hasAnimatedRef = useRef(false);

  // ⏱ Last fetch timestamp — used for AppState cooldown only
  // Prevents spam API calls when user rapidly switches apps
  const lastFetchedAt = useRef<number | null>(null);

  // 🔐 Background permission tracking — prevents redundant checks & starts
  const lastPermissionCheckRef = useRef<number>(0);
  const backgroundLocationStartedRef = useRef<boolean>(false);
  const PERMISSION_CHECK_COOLDOWN_MS = 60 * 1000; // Check at most every 60 seconds
  const nextRegistrationAllowedAtRef = useRef<number>(0);
  const REGISTRATION_FAILURE_BACKOFF_MS = 30 * 1000;

  //  Relative time — updates every 30s automatically
  const [relativeTime, setRelativeTime] = useState<string | null>(null);
  useEffect(() => {
    if (!updatedAt) {
      setRelativeTime(null);
      return;
    }
    const update = () => setRelativeTime(getRelativeTime(updatedAt));
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [updatedAt]);

  // 📈 Trend Animation Value
  const trendAnim = useSharedValue(0);
  useEffect(() => {
    trendAnim.value = 0;
    if (trend === "up" || trend === "down") {
      trendAnim.value = withRepeat(
        withTiming(1, { duration: 2400 }),
        -1,
        false,
      );
    } else if (trend === "stable") {
      trendAnim.value = withRepeat(withTiming(1, { duration: 2400 }), -1, true);
    }
  }, [trend, trendAnim]);

  const trendIconStyle = useAnimatedStyle(() => {
    if (trend === "up") {
      return {
        transform: [
          { translateY: -2 - trendAnim.value * 6 },
          { scale: 0.8 + (1 - trendAnim.value) * 0.4 },
        ],
        opacity: 1 - trendAnim.value,
      };
    }
    if (trend === "down") {
      return {
        transform: [
          { translateY: -6 + trendAnim.value * 6 },
          { scale: 0.8 + (1 - trendAnim.value) * 0.4 },
        ],
        opacity: 1 - trendAnim.value,
      };
    }
    if (trend === "stable") {
      return {
        transform: [{ scale: 0.9 + trendAnim.value * 0.2 }],
        opacity: 0.6 + trendAnim.value * 0.4,
      };
    }
    return {};
  });

  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const fadeAnim = useRef(new RNAnimated.Value(0)).current;
  const slideAnim = useRef(new RNAnimated.Value(24)).current;

  // 📍 Check background location permission status and sync with server
  const checkBackgroundPermission = async (
    coordsForSync?: {
      latitude: number;
      longitude: number;
    },
    force: boolean = false,
  ) => {
    // Debounce: prevent checking too frequently (causes notification flicker)
    const now = Date.now();
    if (
      !force &&
      now - lastPermissionCheckRef.current < PERMISSION_CHECK_COOLDOWN_MS
    ) {
      return;
    }
    lastPermissionCheckRef.current = now;

    try {
      const status = await getBackgroundLocationPermissionStatus();
      const hasPermission = status === "granted";

      const running = await isBackgroundLocationRunning();
      if (running) {
        backgroundLocationStartedRef.current = true;
        setBgLocationDenied((prev) => (prev !== false ? false : prev));
        return;
      }

      if (!backgroundLocationStartedRef.current || !hasPermission) {
        try {
          await startBackgroundLocation();
          backgroundLocationStartedRef.current = true;
          setBgLocationDenied((prev) => (prev !== false ? false : prev));
          if (coordsForSync) {
            updateLocationOnServer(
              coordsForSync.latitude,
              coordsForSync.longitude,
              true,
              alertedTypesRef.current,
            ).catch(() => {});
          }
        } catch (err) {
          setBgLocationDenied((prev) => (prev !== true ? true : prev));
          console.warn("⚠️ Background location start failed:", err);
          backgroundLocationStartedRef.current = false;
        }
      }
    } catch (error) {
      console.error("❌ Permission check error:", error);
      // Keep previous banner state to avoid flicker on transient API failures
    }
  };

  const attemptDeviceRegistration = async (
    latitude: number,
    longitude: number,
    showUiErrors: boolean,
  ) => {
    const now = Date.now();
    if (now < nextRegistrationAllowedAtRef.current) {
      return;
    }

    let token = await getFCMToken();
    if (!token) {
      token = await getFCMToken({ forceRefresh: true });
    }

    if (!token) {
      if (showUiErrors) {
        setError(
          "⚠️ Enable notifications in Settings to receive background alerts.",
        );
      }
      nextRegistrationAllowedAtRef.current =
        now + REGISTRATION_FAILURE_BACKOFF_MS;
      return;
    }

    try {
      await registerDeviceWithServer(latitude, longitude);
      updateLocationOnServer(
        latitude,
        longitude,
        true,
        alertedTypesRef.current,
      );
      nextRegistrationAllowedAtRef.current = 0;
    } catch (regErr: unknown) {
      const authMismatch =
        typeof regErr === "object" &&
        regErr !== null &&
        "response" in regErr &&
        (regErr as { response?: { status?: number } }).response?.status === 401;

      if (showUiErrors) {
        const message = authMismatch
          ? "Client key mismatch. Ensure EXPO_PUBLIC_CLIENT_API_KEY equals server CLIENT_API_KEY."
          : regErr instanceof Error
            ? regErr.message
            : "Check your EXPO_PUBLIC_SERVER_URL.";
        setError(`⚠️ Server registration failed: ${message}`);
      }
      nextRegistrationAllowedAtRef.current =
        Date.now() + REGISTRATION_FAILURE_BACKOFF_MS;
    }
  };

  // 📍 Background location — initial check is deferred to checkEnvironment
  // so real coords are available when the server is updated (atomic sync).
  // No mount-level call here — avoids burning the 60s cooldown before coords exist,
  // which would silently skip the coordinated server update inside checkEnvironment.

  // FIX: Load persisted alerted types from storage on app start
  // Prevents duplicate alerts/history when app is closed and reopened
  // FIX 2: Also restore last-known location/data so the app renders
  // immediately on cold-start instead of showing a blank loading screen.
  useEffect(() => {
    const loadPersistedAlerts = async () => {
      try {
        const stored = await AsyncStorage.getItem("alertedTypes");
        if (stored) alertedTypesRef.current = JSON.parse(stored);
        const storedHistory = await AsyncStorage.getItem("alertHistory");
        if (storedHistory) setAlertHistory(JSON.parse(storedHistory));

        // Restore last known state — renders stale data instantly while
        // the background refresh (triggered below) fetches fresh data.
        const cachedCoords = await AsyncStorage.getItem("lastCoords");
        const cachedLocationName =
          await AsyncStorage.getItem("lastLocationName");
        const cachedEnvData = await AsyncStorage.getItem("lastEnvData");
        const cachedUpdatedAt = await AsyncStorage.getItem("lastUpdatedAt");
        const cachedTrend = await AsyncStorage.getItem("lastTrend");

        if (cachedCoords) setCoords(JSON.parse(cachedCoords));
        if (cachedLocationName) setLocationName(cachedLocationName);
        if (cachedEnvData) {
          const parsedEnv = JSON.parse(cachedEnvData);
          setData(parsedEnv);
          hasCachedDataRef.current = true;

          const aqData = parsedEnv?.current?.air_quality;
          if (aqData) {
            previousAQIRef.current = calculateOverallAQI(aqData);
          }
        }
        if (cachedUpdatedAt) setUpdatedAt(new Date(cachedUpdatedAt));
        if (cachedTrend) setTrend(cachedTrend as "up" | "down" | "stable");
      } catch {
        // fail silently — not critical
      }
      setAlertsLoaded(true); // ← signal ready AFTER loading
    };
    loadPersistedAlerts();
  }, []);

  const aqData = data?.current?.air_quality;
  const pm25 = aqData?.pm2_5;
  const realAQI = aqData ? calculateOverallAQI(aqData) : null;
  const risk = getRiskConfig(realAQI);

  // Animation
  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, {
          toValue: 1.14,
          duration: 2400,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulseAnim, {
          toValue: 1,
          duration: 2400,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🎬 Entry Animation Logic — Gated to prevent refresh shifts
  useEffect(() => {
    if (data && !hasAnimatedRef.current) {
      fadeAnim.setValue(0);
      slideAnim.setValue(24);
      RNAnimated.parallel([
        RNAnimated.timing(fadeAnim, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        RNAnimated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        hasAnimatedRef.current = true;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // FIX: Only run initial check AFTER AsyncStorage has loaded
  // Prevents race condition where checkEnvironment runs before
  // alertedTypesRef is populated → causing duplicate notifications
  // NOTE: If cached data was restored above, checkEnvironment runs silently
  // (no loading spinner) and just refreshes data in the background.
  useEffect(() => {
    if (!alertsLoaded) return;
    const init = async () => {
      // If we have recent cached data (< 5 min old), skip the fetch entirely.
      // On first install there's no cache, so it always fetches.
      if (hasCachedDataRef.current && updatedAt) {
        const ageMs = Date.now() - updatedAt.getTime();
        if (ageMs < REFRESH_INTERVAL_MS) {
          // Data is still fresh — don't waste an API call
          return;
        }
      }

      // No cache (first install) or stale data → fetch
      await checkEnvironment(!hasCachedDataRef.current);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertsLoaded]);

  // FIX: Changed from 60s to 2 minutes — sweet spot for weather app.
  // Frequent enough to feel live, responsible enough to save API quota.
  useEffect(() => {
    const interval = setInterval(() => {
      checkEnvironment(true); // ref lock prevents overlap
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIX: Tell server when app goes background/foreground
  // → server skips push when app is open (prevents duplicates)
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        // App came to foreground — tell server app is open
        const elapsed = Date.now() - (lastFetchedAt.current ?? 0);
        if (elapsed > APPSTATE_COOLDOWN_MS) {
          checkEnvironment(true);
        }
        // Re-check background permission on every foreground transition.
        // Force bypass cooldown to catch Settings revocations immediately.
        checkBackgroundPermission(coords ?? undefined, true);
        // Guard: only update if we have real coordinates — never send 0,0
        if (coords) {
          updateLocationOnServer(
            coords.latitude,
            coords.longitude,
            true,
            alertedTypesRef.current,
          );
        }
      } else if (nextState === "background") {
        // App went to background — tell server to resume push
        // Guard: only update if we have real coordinates — never send 0,0
        if (coords) {
          updateLocationOnServer(
            coords.latitude,
            coords.longitude,
            false,
            alertedTypesRef.current,
          );
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, bgLocationDenied]);

  const reverseGeocode = async (
    lat: number,
    lon: number,
    fallbackLocation?: { name?: string; region?: string },
  ): Promise<string> => {
    try {
      const res = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });

      if (res?.length) {
        const p = res[0];

        const parts = [p.city || p.subregion || p.district, p.region].filter(
          Boolean,
        );

        if (parts.length > 0) {
          const name = parts.join(", ");
          setLocationName(name);
          return name;
        }
      }

      // 🔁 Fallback to WeatherAPI location
      if (fallbackLocation?.name) {
        const name = fallbackLocation.region
          ? `${fallbackLocation.name}, ${fallbackLocation.region}`
          : fallbackLocation.name;
        setLocationName(name);
        return name;
      }

      // 🧭 Final fallback
      const name = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
      setLocationName(name);
      return name;
    } catch {
      if (fallbackLocation?.name) {
        const name = fallbackLocation.region
          ? `${fallbackLocation.name}, ${fallbackLocation.region}`
          : fallbackLocation.name;
        setLocationName(name);
        return name;
      }
      const name = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
      setLocationName(name);
      return name;
    }
  };

  // FIX: removed unused currentAQI param; now uses alertedTypesRef to avoid stale closure
  const handleRiskNotification = async (riskAlerts: RiskAlert[]) => {
    if (Platform.OS === "web") return;

    const newAlerts = riskAlerts.filter(
      (alert) => !alertedTypesRef.current.includes(alert.type),
    );

    if (newAlerts.length > 0) {
      // Send push notifications — service filters to severe/danger only
      await sendRiskNotification(newAlerts);

      alertedTypesRef.current = [
        ...alertedTypesRef.current,
        ...newAlerts.map((a) => a.type),
      ];

      // FIX: Persist to AsyncStorage so duplicates don't fire on app restart
      AsyncStorage.setItem(
        "alertedTypes",
        JSON.stringify(alertedTypesRef.current),
      ).catch(() => {});

      // 📜 Save only severe/danger to history — warnings show in UI only
      const severeAndAbove = newAlerts.filter(
        (a) => a.severity === "severe" || a.severity === "danger",
      );
      if (severeAndAbove.length > 0) {
        setAlertHistory((prev) => {
          const newItems = severeAndAbove.map((a) => ({
            message: a.message,
            time: new Date().toLocaleTimeString(),
            severity: a.severity,
          }));
          const updated = [...newItems, ...prev].slice(0, 10);
          AsyncStorage.setItem("alertHistory", JSON.stringify(updated)).catch(
            () => {},
          );
          return updated;
        });
      }
    }

    // Remove types that are no longer active
    alertedTypesRef.current = alertedTypesRef.current.filter((type) =>
      riskAlerts.some((alert) => alert.type === type),
    );
    // FIX: Persist cleared state too
    AsyncStorage.setItem(
      "alertedTypes",
      JSON.stringify(alertedTypesRef.current),
    ).catch(() => {});
  };

  const checkEnvironment = async (silent = false) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      if (!silent) setLoading(true);
      setError(null);

      const userCoords = await getUserLocation();
      setCoords(userCoords);

      const envData = await fetchEnvironmentalData(
        userCoords.latitude,
        userCoords.longitude,
      );

      // ✅ Always resolve location safely
      const resolvedLocationName = await reverseGeocode(
        userCoords.latitude,
        userCoords.longitude,
        envData.location,
      );

      await attemptDeviceRegistration(
        userCoords.latitude,
        userCoords.longitude,
        !silent,
      );

      // silent = true means app is open (interval or AppState foreground)
      // → pass appOpen: true so server skips push (app handles it locally)
      if (silent) {
        updateLocationOnServer(
          userCoords.latitude,
          userCoords.longitude,
          true,
          alertedTypesRef.current,
        );
      }

      setData(envData);
      const now = new Date();
      setUpdatedAt(now);

      // Persist last-known state so cold-starts show data immediately
      AsyncStorage.setItem("lastCoords", JSON.stringify(userCoords)).catch(
        () => {},
      );
      AsyncStorage.setItem("lastLocationName", resolvedLocationName).catch(
        () => {},
      );
      AsyncStorage.setItem("lastEnvData", JSON.stringify(envData)).catch(
        () => {},
      );
      AsyncStorage.setItem("lastUpdatedAt", now.toISOString()).catch(() => {});

      // Keep permission state synchronized even after prior success.
      // Cooldown inside checkBackgroundPermission prevents thrashing.
      checkBackgroundPermission(userCoords);

      const riskAlerts = evaluateRisk(envData);
      setAlerts(riskAlerts);

      const aqData = envData?.current?.air_quality;
      const calculatedAQI = aqData ? calculateOverallAQI(aqData) : null;

      if (calculatedAQI !== null && previousAQIRef.current !== null) {
        let newTrend: "up" | "down" | "stable" = "stable";
        if (calculatedAQI > previousAQIRef.current + 5) {
          newTrend = "up";
        } else if (calculatedAQI < previousAQIRef.current - 5) {
          newTrend = "down";
        }

        setTrend(newTrend);
        AsyncStorage.setItem("lastTrend", newTrend).catch(() => {});
      }

      previousAQIRef.current = calculatedAQI;

      if (calculatedAQI === null) {
        setTrend(null);
        AsyncStorage.removeItem("lastTrend").catch(() => {});
      }

      lastFetchedAt.current = Date.now();

      await handleRiskNotification(riskAlerts);
    } catch (err: unknown) {
      // Even if weather fails, show coordinates instead of infinite loading
      if (!locationName && coords) {
        setLocationName(
          `${coords.latitude.toFixed(2)}°, ${coords.longitude.toFixed(2)}°`,
        );
      }

      if (!silent) {
        // Show the correct message — location denial vs network failure are very different
        const message = err instanceof Error ? err.message.toLowerCase() : "";
        if (message.includes("location permission")) {
          setError(
            "📍 Location access denied. Please enable it in Settings → Apps → Enviro Monitor → Permissions.",
          );
        } else {
          setError(
            "Could not fetch environmental data. Check your connection.",
          );
        }
      }
    } finally {
      isCheckingRef.current = false;
      if (!silent) setLoading(false);
      setRefreshing(false); // Always stop the pull-to-refresh spinner
    }
  };

  const onRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await checkEnvironment(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <RiskContext.Provider value={{ bg: risk.bg, color: risk.color }}>
      <ScrollView
        style={[s.root, { backgroundColor: risk.bg }]}
        contentContainerStyle={[
          s.scroll,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={risk.color}
            colors={[risk.color || "#10B981"]} // Android support
          />
        }
      >
        {/* ══ TOP BAR ══ */}
        <View style={s.topBar}>
          <View style={s.topLeft}>
            <Text style={s.appLabel}>ENVIRO MONITOR</Text>
            <View style={s.locationRow}>
              {locationName ? (
                <>
                  <Ionicons name="location-sharp" size={14} color="#EF4444" />
                  <Text style={s.locationText}>{locationName}</Text>
                </>
              ) : (
                <>
                  <ActivityIndicator size="small" color="#6B7280" />
                  <Text style={s.locationMuted}>Locating…</Text>
                </>
              )}
            </View>
          </View>

          <View style={s.topRight}>
            {coords && (
              <View style={s.coordBadge}>
                <Text style={s.coordLine}>{coords.latitude.toFixed(3)}° N</Text>
                <Text style={s.coordLine}>
                  {coords.longitude.toFixed(3)}° E
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={s.savedBtn}
              onPress={() => router.push("/(tabs)/saved")}
              activeOpacity={0.7}
            >
              <Ionicons name="bookmark" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ══ ORB ══ */}
        <View style={s.orbSection}>
          <RNAnimated.View
            style={[
              s.ring3,
              {
                borderColor: risk.color + "0e",
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
          <RNAnimated.View
            style={[
              s.ring2,
              {
                borderColor: risk.color + "20",
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
          <RNAnimated.View
            style={[
              s.ring1,
              {
                borderColor: risk.color + "40",
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
          <View
            style={[
              s.orb,
              { borderColor: risk.color + "70", backgroundColor: risk.glow },
            ]}
          >
            <Text style={[s.orbIcon, { color: risk.color }]}>{risk.icon}</Text>
            <Text style={[s.orbLevel, { color: risk.color }]}>
              {risk.level}
            </Text>
            <Text style={s.orbAQI}>
              {realAQI !== null ? `AQI  ${realAQI}` : "No data"}
            </Text>
            {trend && (
              <View style={s.trendRow}>
                <View
                  style={[
                    s.trendPill,
                    {
                      backgroundColor:
                        trend === "up"
                          ? "rgba(248, 113, 113, 0.22)"
                          : trend === "down"
                            ? "rgba(52, 211, 153, 0.22)"
                            : "rgba(107, 114, 128, 0.22)",
                      borderColor:
                        trend === "up"
                          ? "rgba(248, 113, 113, 0.5)"
                          : trend === "down"
                            ? "rgba(52, 211, 153, 0.5)"
                            : "rgba(107, 114, 128, 0.5)",
                      shadowColor:
                        trend === "up"
                          ? "#F87171"
                          : trend === "down"
                            ? "#34D399"
                            : "#9CA3AF",
                    },
                  ]}
                >
                  <Animated.View
                    style={[
                      trendIconStyle,
                      { alignItems: "center", justifyContent: "center" },
                    ]}
                  >
                    <Text
                      style={[
                        s.trendIcon,
                        {
                          color:
                            trend === "up"
                              ? "#F87171"
                              : trend === "down"
                                ? "#34D399"
                                : "#9CA3AF",
                        },
                      ]}
                    >
                      {trend === "up" ? "▲" : trend === "down" ? "▼" : "●"}
                    </Text>
                  </Animated.View>
                  <Text
                    style={[
                      s.trendText,
                      {
                        color:
                          trend === "up"
                            ? "#F87171"
                            : trend === "down"
                              ? "#34D399"
                              : "#9CA3AF",
                      },
                    ]}
                  >
                    {trend === "up"
                      ? "RISING"
                      : trend === "down"
                        ? "IMPROVING"
                        : "STABLE"}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Advice */}
        <View
          style={[
            s.pill,
            {
              borderColor: risk.color + "50",
              backgroundColor: risk.color + "10",
            },
          ]}
        >
          <Text style={[s.pillText, { color: risk.color }]}>{risk.advice}</Text>
        </View>

        {/* ══ FEEDBACK ══ */}
        {bgLocationDenied === true && (
          <View style={s.warnBox}>
            <Text style={s.warnText}>
              🔕 Background alerts disabled — grant Allow all the time location
              access in Settings for notifications when app is closed.
            </Text>
          </View>
        )}
        {loading && !data && (
          <View style={s.loadRow}>
            <ActivityIndicator color={risk.color} size="small" />
            <Text style={[s.loadText, { color: risk.color }]}>
              Scanning environment…
            </Text>
          </View>
        )}
        {error && (
          <View style={s.errBox}>
            <Text style={s.errText}>⚡ {error}</Text>
          </View>
        )}

        {/* ══ DATA ══ */}
        {data && (
          <RNAnimated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              width: "100%",
            }}
          >
            {/* Gauge card */}
            <View
              style={[
                s.card,
                {
                  borderLeftColor: risk.color,
                  backgroundColor: risk.color + "0D",
                },
              ]}
            >
              <View style={s.cardHead}>
                <Text style={s.cardLabel}>AQI GAUGE</Text>
                <Text style={[s.cardAccent, { color: risk.color }]}>
                  {realAQI ?? "–"} / 500
                </Text>
              </View>
              <AQIGauge aqi={realAQI} color={risk.color} />
            </View>

            {/* Chips */}
            {(() => {
              const tempColor =
                data.current.temp_c >= RISK_LIMITS.TEMP_DANGER
                  ? METRIC_COLORS.TEMP.danger
                  : data.current.temp_c >= RISK_LIMITS.TEMP_SEVERE
                    ? METRIC_COLORS.TEMP.severe
                    : data.current.temp_c >= RISK_LIMITS.TEMP_WARNING
                      ? METRIC_COLORS.TEMP.warning
                      : METRIC_COLORS.TEMP.normal;

              const uvVal = data.current.uv ?? 0;
              const uvColor =
                uvVal >= RISK_LIMITS.UV_DANGER
                  ? METRIC_COLORS.UV.danger
                  : uvVal >= RISK_LIMITS.UV_SEVERE
                    ? METRIC_COLORS.UV.severe
                    : uvVal >= RISK_LIMITS.UV_WARNING
                      ? METRIC_COLORS.UV.warning
                      : METRIC_COLORS.UV.normal;

              const visVal = data.current.vis_km ?? 99;
              const visColor =
                visVal <= RISK_LIMITS.VISIBILITY_DANGER
                  ? METRIC_COLORS.VISIBILITY.danger
                  : visVal <= RISK_LIMITS.VISIBILITY_SEVERE
                    ? METRIC_COLORS.VISIBILITY.severe
                    : visVal <= RISK_LIMITS.VISIBILITY_WARNING
                      ? METRIC_COLORS.VISIBILITY.warning
                      : METRIC_COLORS.VISIBILITY.normal;

              const humVal = data.current.humidity ?? 0;
              const humColor =
                humVal >= RISK_LIMITS.HUMIDITY_DANGER
                  ? METRIC_COLORS.HUMIDITY.danger
                  : humVal >= RISK_LIMITS.HUMIDITY_SEVERE
                    ? METRIC_COLORS.HUMIDITY.severe
                    : humVal >= RISK_LIMITS.HUMIDITY_WARNING
                      ? METRIC_COLORS.HUMIDITY.warning
                      : METRIC_COLORS.HUMIDITY.normal;

              return (
                <View style={s.chips}>
                  <View style={[s.chipWrapper, { borderLeftColor: tempColor }]}>
                    <StatChip
                      icon="🌡️"
                      label="TEMP"
                      value={`${data.current.temp_c}°C`}
                      accent={tempColor}
                    />
                  </View>
                  <View style={[s.chipWrapper, { borderLeftColor: uvColor }]}>
                    <StatChip
                      icon="☀️"
                      label="UV IDX"
                      value={String(data.current.uv ?? "–")}
                      accent={uvColor}
                    />
                  </View>
                  <View style={[s.chipWrapper, { borderLeftColor: visColor }]}>
                    <StatChip
                      icon="👁️"
                      label="VIS KM"
                      value={`${data.current.vis_km ?? "–"}`}
                      accent={visColor}
                    />
                  </View>
                  <View style={[s.chipWrapper, { borderLeftColor: humColor }]}>
                    <StatChip
                      icon="💧"
                      label="HUMIDITY"
                      value={`${data.current.humidity ?? "–"}%`}
                      accent={humColor}
                    />
                  </View>
                </View>
              );
            })()}

            {/* Detail readings */}
            <View
              style={[
                s.card,
                {
                  borderLeftColor: risk.color,
                  backgroundColor: risk.color + "0D",
                },
              ]}
            >
              <View style={s.cardHead}>
                <Text style={s.cardLabel}>READINGS</Text>
                <View style={[s.liveDot, { backgroundColor: risk.color }]} />
              </View>
              <MetricRow
                icon="📊"
                label="NAQI"
                value={
                  realAQI !== null
                    ? `${realAQI} · ${getAQILabelByValue(realAQI)}`
                    : "–"
                }
                accent={risk.color}
              />
              <MetricRow
                icon="☁️"
                label="PM2.5"
                value={`${pm25 ?? "–"} µg/m³`}
                accent={
                  pm25 == null
                    ? "#64748B"
                    : pm25 >= RISK_LIMITS.PM25_DANGER
                      ? METRIC_COLORS.POLLUTION.severe
                      : pm25 >= RISK_LIMITS.PM25_SEVERE
                        ? METRIC_COLORS.POLLUTION.veryPoor
                        : pm25 >= RISK_LIMITS.PM25_WARNING
                          ? METRIC_COLORS.POLLUTION.poor
                          : METRIC_COLORS.POLLUTION.good
                }
              />
              <MetricRow
                icon="🍃"
                label="PM10"
                value={`${aqData?.pm10 ?? "–"} µg/m³`}
                accent={
                  aqData?.pm10 == null
                    ? "#64748B"
                    : aqData.pm10 >= RISK_LIMITS.PM10_DANGER
                      ? METRIC_COLORS.POLLUTION.severe
                      : aqData.pm10 >= RISK_LIMITS.PM10_SEVERE
                        ? METRIC_COLORS.POLLUTION.veryPoor
                        : aqData.pm10 >= RISK_LIMITS.PM10_WARNING
                          ? METRIC_COLORS.POLLUTION.poor
                          : METRIC_COLORS.POLLUTION.good
                }
              />
              <MetricRow
                icon="🌡️"
                label="Feels Like"
                value={`${data.current.feelslike_c ?? data.current.temp_c}°C`}
                accent={
                  (data.current.feelslike_c ?? data.current.temp_c) >=
                  RISK_LIMITS.TEMP_DANGER
                    ? METRIC_COLORS.TEMP.danger
                    : (data.current.feelslike_c ?? data.current.temp_c) >=
                        RISK_LIMITS.TEMP_SEVERE
                      ? METRIC_COLORS.TEMP.severe
                      : (data.current.feelslike_c ?? data.current.temp_c) >=
                          RISK_LIMITS.TEMP_WARNING
                        ? METRIC_COLORS.TEMP.warning
                        : METRIC_COLORS.TEMP.normal
                }
              />
              <MetricRow
                icon="🧭"
                label="Wind"
                value={`${data.current.wind_kph ?? "–"} km/h`}
                accent={
                  data.current.wind_kph == null
                    ? "#64748B"
                    : data.current.wind_kph >= RISK_LIMITS.WIND_DANGER
                      ? METRIC_COLORS.WIND.danger
                      : data.current.wind_kph >= RISK_LIMITS.WIND_SEVERE
                        ? METRIC_COLORS.WIND.severe
                        : data.current.wind_kph >= RISK_LIMITS.WIND_WARNING
                          ? METRIC_COLORS.WIND.warning
                          : METRIC_COLORS.WIND.normal
                }
              />
              <MetricRow
                icon="🌧️"
                label="Precipitation"
                value={`${data.current.precip_mm ?? "0"} mm`}
                accent={
                  (data.current.precip_mm ?? 0) >= RISK_LIMITS.PRECIP_DANGER
                    ? METRIC_COLORS.PRECIPITATION.danger
                    : (data.current.precip_mm ?? 0) >= RISK_LIMITS.PRECIP_SEVERE
                      ? METRIC_COLORS.PRECIPITATION.severe
                      : (data.current.precip_mm ?? 0) >=
                          RISK_LIMITS.PRECIP_WARNING
                        ? METRIC_COLORS.PRECIPITATION.warning
                        : METRIC_COLORS.PRECIPITATION.normal
                }
                last
              />
            </View>

            {/* Alerts */}
            {alerts.length > 0 && (
              <View style={[s.alertCard, { borderLeftColor: "#F87171" }]}>
                <View style={s.cardHead}>
                  <Text style={s.alertLabel}>⚠ ACTIVE ALERTS</Text>
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{alerts.length}</Text>
                  </View>
                </View>

                {alerts.map((a, i) => (
                  <View key={i} style={s.alertRow}>
                    <Text
                      style={[
                        s.alertText,
                        {
                          color:
                            a.severity === "danger"
                              ? "#F0ABFC"
                              : a.severity === "severe"
                                ? "#FCA5A5"
                                : "#FDE68A",
                        },
                      ]}
                    >
                      {a.message}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Alert History */}
            {alertHistory.length > 0 && (
              <View style={[s.historyCard, { borderLeftColor: "#9CA3AF" }]}>
                <View style={s.cardHead}>
                  <View style={s.historyTitleRow}>
                    <Text style={{ fontSize: 16 }}>🕐</Text>
                    <Text style={s.historyCardLabel}>ALERT HISTORY</Text>
                  </View>
                  <View style={s.historyBadge}>
                    <Text style={s.historyBadgeText}>
                      {alertHistory.length}
                    </Text>
                  </View>
                </View>

                {alertHistory.map((item, i) => (
                  <AlertHistoryItem
                    key={i}
                    message={item.message}
                    time={item.time}
                    severity={item.severity}
                  />
                ))}
              </View>
            )}
          </RNAnimated.View>
        )}

        {/* ══ UNIFIED FOOTER ══ */}
        <View style={s.unifiedFooter}>
          <View style={s.footerGroup}>
            {updatedAt && (
              <View style={s.footerMetaItem}>
                <PulsingDot color="#10B981" />
                <Text style={s.footerMetaText}>
                  LIVE ·{" "}
                  {relativeTime ??
                    updatedAt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </Text>
              </View>
            )}
            {coords && (
              <View style={s.footerMetaItem}>
                <Text style={s.footerMetaText}>
                  POS: {coords.latitude.toFixed(4)} N,{" "}
                  {coords.longitude.toFixed(4)} E
                </Text>
              </View>
            )}
          </View>
          <View style={s.footerDivider} />
          <Text
            style={[
              s.brandText,
              {
                color: risk.color + "99",
                textShadowColor: risk.color + "40",
                textShadowRadius: 4,
                textShadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            © {new Date().getFullYear()} All Rights Reserved · Built by Elite
            Executors
          </Text>
        </View>
      </ScrollView>
    </RiskContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: 20,
    paddingTop: 58,
    alignItems: "center",
  },

  topBar: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 44,
  },
  topLeft: { gap: 6, flex: 1 },
  topRight: { flexDirection: "column", alignItems: "flex-end", gap: 6 },
  savedBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  appLabel: {
    fontSize: 9,
    letterSpacing: 3.5,
    color: "#4B5563",
    fontWeight: "800",
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  locationText: {
    fontSize: 16,
    color: "#F3F4F6",
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  locationMuted: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    marginLeft: 4,
  },
  coordBadge: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "flex-end",
    gap: 3,
  },
  coordLine: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "700",
    letterSpacing: 0.5,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },

  orbSection: {
    width: 264,
    height: 264,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  ring3: {
    position: "absolute",
    width: 264,
    height: 264,
    borderRadius: 132,
    borderWidth: 1,
  },
  ring2: {
    position: "absolute",
    width: 228,
    height: 228,
    borderRadius: 114,
    borderWidth: 1,
  },
  ring1: {
    position: "absolute",
    width: 198,
    height: 198,
    borderRadius: 99,
    borderWidth: 1.5,
  },
  orb: {
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  orbIcon: { fontSize: 36, marginBottom: 2 },
  orbLevel: { fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
  orbAQI: { fontSize: 11, color: "#9CA3AF", letterSpacing: 2, marginTop: 2 },

  trendRow: {
    marginTop: 8,
    alignItems: "center",
  },
  trendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  trendIcon: {
    fontSize: 8,
  },
  trendText: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textTransform: "uppercase",
  },

  pill: {
    borderWidth: 1,
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 32,
    maxWidth: "88%",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
  },

  loadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  loadText: { fontSize: 12, letterSpacing: 1, fontWeight: "600" },
  warnBox: {
    backgroundColor: "rgba(251,191,36,0.08)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: "rgba(251,191,36,0.22)",
    borderLeftColor: "#FBBF24",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    width: "100%",
  },
  warnText: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  errBox: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: "rgba(239,68,68,0.22)",
    borderLeftColor: "#F87171",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    width: "100%",
  },
  errText: { color: "#F87171", fontSize: 13, fontWeight: "600" },

  card: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 22,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 18,
    marginBottom: 12,
  },
  chipWrapper: {
    flex: 1,
    borderLeftWidth: 3,
    borderRadius: 18,
    overflow: "hidden",
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  cardLabel: {
    fontSize: 9,
    letterSpacing: 3,
    color: "#6B7280",
    fontWeight: "800",
  },
  cardAccent: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },

  chips: { flexDirection: "row", gap: 8, width: "100%", marginBottom: 12 },

  alertCard: {
    width: "100%",
    backgroundColor: "rgba(248,113,113,0.06)",
    borderRadius: 22,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: "rgba(248,113,113,0.16)",
    padding: 18,
    marginBottom: 12,
  },
  alertLabel: {
    fontSize: 9,
    letterSpacing: 3,
    color: "#F87171",
    fontWeight: "800",
  },
  badge: {
    backgroundColor: "rgba(248,113,113,0.2)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, color: "#F87171", fontWeight: "700" },
  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  alertText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
  },

  historyCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 22,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 18,
    marginBottom: 12,
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyCardLabel: {
    fontSize: 9,
    letterSpacing: 3,
    color: "#6B7280",
    fontWeight: "800",
  },
  historyBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  historyBadgeText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "700",
  },

  unifiedFooter: {
    marginTop: 16,
    marginBottom: 0,
    alignItems: "center",
    width: "100%",
  },
  footerGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 10,
  },
  footerMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  footerMetaText: {
    fontSize: 8.5,
    color: "#4B5563",
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  footerDivider: {
    width: 24,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 12,
  },
  brandText: {
    fontSize: 8,
    color: "#374151",
    letterSpacing: 1.5,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});

const PulsingDot = ({ color }: { color: string }) => {
  const sv = useSharedValue(1);
  useEffect(() => {
    sv.value = withRepeat(withTiming(0.4, { duration: 1000 }), -1, true);
  }, [sv]);

  const style = useAnimatedStyle(() => ({
    opacity: sv.value,
  }));

  return (
    <Animated.View
      style={[s.liveIndicator, { backgroundColor: color }, style]}
    />
  );
};
