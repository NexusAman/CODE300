import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  AppStateStatus,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { evaluateRisk } from "../../src/engine/riskEngine";
import { sendRiskNotification } from "../../src/notifications/notificationService";
import {
  getFCMToken,
  registerDeviceWithServer,
  updateLocationOnServer,
} from "../../src/services/fcmService";
import { getUserLocation } from "../../src/services/locationService";
import { fetchEnvironmentalData } from "../../src/services/weatherService";

const { width } = Dimensions.get("window");

// ─── AQI Helpers ─────────────────────────────────────────────────────────────

const getAQILabel = (aqi: number | undefined) => {
  if (!aqi) return "Unknown";
  const labels = [
    "",
    "Good",
    "Moderate",
    "Unhealthy (Sensitive)",
    "Unhealthy",
    "Very Unhealthy",
    "Hazardous",
  ];
  return labels[aqi] ?? "Unknown";
};

const calculateAQI = (pm25: number): number => {
  if (pm25 <= 12) return Math.round((50 / 12) * pm25);
  if (pm25 <= 35.4)
    return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51);
  if (pm25 <= 55.4)
    return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101);
  if (pm25 <= 150.4)
    return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151);
  if (pm25 <= 250.4)
    return Math.round(((300 - 201) / (250.4 - 150.5)) * (pm25 - 150.5) + 201);
  return Math.round(((500 - 301) / (500.4 - 250.5)) * (pm25 - 250.5) + 301);
};

// ─── Risk Config ──────────────────────────────────────────────────────────────

type RiskConfig = {
  level: string;
  color: string;
  glow: string;
  icon: string;
  bg: string;
  advice: string;
};

const getRiskConfig = (realAQI: number | null): RiskConfig => {
  if (!realAQI)
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
      level: "SAFE",
      color: "#34D399",
      glow: "#34D39920",
      icon: "✦",
      bg: "#060f0a",
      advice: "Air quality is ideal. Enjoy outdoor activities.",
    };
  if (realAQI <= 100)
    return {
      level: "MODERATE",
      color: "#FBBF24",
      glow: "#FBBF2420",
      icon: "◈",
      bg: "#0f0c00",
      advice: "Sensitive groups should limit prolonged exertion.",
    };
  if (realAQI <= 200)
    return {
      level: "UNHEALTHY",
      color: "#F87171",
      glow: "#F8717120",
      icon: "⚠",
      bg: "#0f0505",
      advice: "Limit outdoor activity. Wear a mask if going out.",
    };
  return {
    level: "DANGEROUS",
    color: "#E879F9",
    glow: "#E879F920",
    icon: "☣",
    bg: "#0d0010",
    advice: "Stay indoors. Serious health risk.",
  };
};

// ─── AQI Gauge ────────────────────────────────────────────────────────────────

const AQIGauge = ({ aqi, color }: { aqi: number | null; color: string }) => {
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: Math.min((aqi ?? 0) / 500, 1),
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [aqi]);

  const barWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={gaugeS.wrapper}>
      <View style={gaugeS.track}>
        {["#34D399", "#A3E635", "#FBBF24", "#FB923C", "#F87171", "#E879F9"].map(
          (c, i) => (
            <View key={i} style={[gaugeS.seg, { backgroundColor: c + "28" }]} />
          ),
        )}
        <Animated.View
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

// ─── Stat Chip ────────────────────────────────────────────────────────────────

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
  <View style={chipS.chip}>
    <Text style={chipS.icon}>{icon}</Text>
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
  icon: { fontSize: 20 },
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
      <Text style={mS.icon}>{icon}</Text>
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
  icon: { fontSize: 15, width: 22, textAlign: "center" },
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
  index,
}: {
  message: string;
  time: string;
  severity?: "warning" | "severe" | "danger";
  index: number;
}) => {
  const cfg = severityConfig[severity ?? "severe"];
  return (
    <View
      style={[ahS.row, { borderLeftColor: cfg.color, backgroundColor: cfg.bg }]}
    >
      <View style={ahS.topRow}>
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
const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const APPSTATE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
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
  const [trend, setTrend] = useState<"up" | "down" | "stable" | null>(null);

  // ⏱ Last fetch timestamp — used for AppState cooldown only
  // Prevents spam API calls when user rapidly switches apps
  const lastFetchedAt = useRef<number | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  // FIX: Load persisted alerted types from storage on app start
  // Prevents duplicate alerts/history when app is closed and reopened
  useEffect(() => {
    const loadPersistedAlerts = async () => {
      try {
        const stored = await AsyncStorage.getItem("alertedTypes");
        if (stored) alertedTypesRef.current = JSON.parse(stored);
        const storedHistory = await AsyncStorage.getItem("alertHistory");
        if (storedHistory) setAlertHistory(JSON.parse(storedHistory));
      } catch {
        // fail silently — not critical
      }
      setAlertsLoaded(true); // ← signal ready AFTER loading
    };
    loadPersistedAlerts();
  }, []);

  const epaIndex = data?.current?.air_quality?.["us-epa-index"];
  const pm25 = data?.current?.air_quality?.pm2_5;
  const realAQI = pm25 ? calculateAQI(pm25) : null;
  const risk = getRiskConfig(realAQI);

  // Animation
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.14,
          duration: 2400,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2400,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    if (data) {
      fadeAnim.setValue(0);
      slideAnim.setValue(24);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [data]);

  // FIX: Only run initial check AFTER AsyncStorage has loaded
  // Prevents race condition where checkEnvironment runs before
  // alertedTypesRef is populated → causing duplicate notifications
  useEffect(() => {
    if (!alertsLoaded) return;
    const init = async () => {
      if (Platform.OS !== "web") {
        await Notifications.requestPermissionsAsync();
      }
      await checkEnvironment();
    };
    init();
  }, [alertsLoaded]);

  // FIX: Changed from 60s to 2 minutes — sweet spot for weather app.
  // Frequent enough to feel live, responsible enough to save API quota.
  useEffect(() => {
    const interval = setInterval(() => {
      checkEnvironment(true); // ref lock prevents overlap
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
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
        // Tell server app is now open → skip push
        updateLocationOnServer(
          coords?.latitude ?? 0,
          coords?.longitude ?? 0,
          true,
        );
      } else if (nextState === "background") {
        // App went to background — tell server to resume push
        updateLocationOnServer(
          coords?.latitude ?? 0,
          coords?.longitude ?? 0,
          false,
        );
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [coords]);

  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });

      if (res?.length) {
        const p = res[0];
        const parts = [p.city || p.district, p.region].filter(Boolean);
        setLocationName(
          parts.join(", ") ||
            p.country ||
            `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
        );
      }
    } catch {
      setLocationName(`${lat.toFixed(3)}°, ${lon.toFixed(3)}°`);
    }
  };

  // FIX: removed unused currentAQI param; now uses alertedTypesRef to avoid stale closure
  const handleRiskNotification = async (riskAlerts: any[]) => {
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
        severeAndAbove.forEach((a) => {
          setAlertHistory((prev) => {
            const updated = [
              {
                message: a.message,
                time: new Date().toLocaleTimeString(),
                severity: a.severity,
              },
              ...prev.slice(0, 9),
            ];
            // FIX: Persist history so it survives app restarts
            AsyncStorage.setItem("alertHistory", JSON.stringify(updated)).catch(
              () => {},
            );
            return updated;
          });
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
    // ⛔ Prevent overlapping executions
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      // silent=true for background/interval checks — no spinner shown
      if (!silent) setLoading(true);
      setError(null);

      const userCoords = await getUserLocation();
      setCoords(userCoords);

      if (!silent) {
        await reverseGeocode(userCoords.latitude, userCoords.longitude);
      }

      // Register/update device with server for background push notifications
      if (!silent) {
        const token = await getFCMToken();

        if (!token) {
          setError(
            "⚠️ Enable notifications in Settings to receive background alerts.",
          );
        } else {
          await registerDeviceWithServer(
            userCoords.latitude,
            userCoords.longitude,
          );

          // Tell server app is open → skip push (local handles it)
          updateLocationOnServer(
            userCoords.latitude,
            userCoords.longitude,
            true,
          );
        }
      } else {
        // fire and forget — not critical
        updateLocationOnServer(userCoords.latitude, userCoords.longitude);
      }

      const envData = await fetchEnvironmentalData(
        userCoords.latitude,
        userCoords.longitude,
      );

      setData(envData);
      setUpdatedAt(new Date());

      const riskAlerts = evaluateRisk(envData);
      setAlerts(riskAlerts);

      const pm25Value = envData?.current?.air_quality?.pm2_5;
      const calculatedAQI = pm25Value ? calculateAQI(pm25Value) : null;

      // 📈 Trend logic
      if (calculatedAQI !== null && previousAQIRef.current !== null) {
        if (calculatedAQI > previousAQIRef.current + 5) {
          setTrend("up");
        } else if (calculatedAQI < previousAQIRef.current - 5) {
          setTrend("down");
        } else {
          setTrend("stable");
        }
      }

      previousAQIRef.current = calculatedAQI;

      if (calculatedAQI === null) {
        setTrend(null);
      }

      // ⏱ Save fetch timestamp
      lastFetchedAt.current = Date.now();

      await handleRiskNotification(riskAlerts);
    } catch {
      if (!silent) {
        setError("Could not fetch environmental data. Check your connection.");
      }
    } finally {
      // 🔓 Always release lock
      isCheckingRef.current = false;

      if (!silent) {
        setLoading(false);
      }
    }
  };

  return (
    <ScrollView
      style={[s.root, { backgroundColor: risk.bg }]}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* ══ TOP BAR ══ */}
      <View style={s.topBar}>
        <View style={s.topLeft}>
          <Text style={s.appLabel}>ENVIRO MONITOR</Text>
          <View style={s.locationRow}>
            {locationName ? (
              <>
                <Text style={s.pinIcon}>📍</Text>
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

        {coords && (
          <View style={s.coordBadge}>
            <Text style={s.coordLine}>{coords.latitude.toFixed(3)}° N</Text>
            <Text style={s.coordLine}>{coords.longitude.toFixed(3)}° E</Text>
          </View>
        )}
      </View>

      {/* ══ ORB ══ */}
      <View style={s.orbSection}>
        <Animated.View
          style={[
            s.ring3,
            {
              borderColor: risk.color + "0e",
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
        <Animated.View
          style={[
            s.ring2,
            {
              borderColor: risk.color + "20",
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
        <Animated.View
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
          <Text style={[s.orbLevel, { color: risk.color }]}>{risk.level}</Text>
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
                        ? "#F8717118"
                        : trend === "down"
                          ? "#34D39918"
                          : "#6B728018",
                    borderColor:
                      trend === "up"
                        ? "#F8717140"
                        : trend === "down"
                          ? "#34D39940"
                          : "#6B728040",
                  },
                ]}
              >
                <Text style={[s.trendIcon]}>
                  {trend === "up" ? "▲" : trend === "down" ? "▼" : "●"}
                </Text>
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
                    ? "Rising"
                    : trend === "down"
                      ? "Improving"
                      : "Stable"}
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
      {loading && (
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
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
            width: "100%",
          }}
        >
          {/* Gauge card */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardLabel}>AQI GAUGE</Text>
              <Text style={[s.cardAccent, { color: risk.color }]}>
                {realAQI ?? "–"} / 500
              </Text>
            </View>
            <AQIGauge aqi={realAQI} color={risk.color} />
          </View>

          {/* Chips */}
          <View style={s.chips}>
            <StatChip
              icon="🌡"
              label="TEMP"
              value={`${data.current.temp_c}°C`}
              accent="#60A5FA"
            />
            <StatChip
              icon="☀️"
              label="UV IDX"
              value={String(data.current.uv ?? "–")}
              accent="#FBBF24"
            />
            <StatChip
              icon="👁"
              label="VIS KM"
              value={`${data.current.vis_km ?? "–"}`}
              accent="#34D399"
            />
            <StatChip
              icon="💧"
              label="HUMIDITY"
              value={`${data.current.humidity ?? "–"}%`}
              accent="#818CF8"
            />
          </View>

          {/* Detail readings */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardLabel}>READINGS</Text>
              <View style={[s.liveDot, { backgroundColor: risk.color }]} />
            </View>
            <MetricRow
              icon="🌫"
              label="PM2.5 Particles"
              value={`${pm25 ?? "–"} µg/m³`}
              accent={realAQI && realAQI > 100 ? "#F87171" : undefined}
            />
            <MetricRow
              icon="📊"
              label="Real AQI (0–500)"
              value={realAQI !== null ? String(realAQI) : "–"}
              accent={risk.color}
            />
            <MetricRow
              icon="🏛"
              label="EPA Category"
              value={epaIndex ? `${epaIndex} · ${getAQILabel(epaIndex)}` : "–"}
            />
            <MetricRow
              icon="🌡"
              label="Feels Like"
              value={`${data.current.feelslike_c ?? data.current.temp_c}°C`}
            />
            <MetricRow
              icon="💨"
              label="Wind Speed"
              value={`${data.current.wind_kph ?? "–"} km/h`}
            />
            <MetricRow
              icon="🌧"
              label="Precipitation"
              value={`${data.current.precip_mm ?? "–"} mm`}
              last
            />
          </View>

          {/* Alerts */}
          {alerts.length > 0 && (
            <View style={s.alertCard}>
              <View style={s.cardHead}>
                <Text style={s.alertLabel}>⚠ ACTIVE ALERTS</Text>
                <View style={s.badge}>
                  <Text style={s.badgeText}>{alerts.length}</Text>
                </View>
              </View>

              {alerts.map((a, i) => (
                <View key={i} style={s.alertRow}>
                  <View
                    style={[
                      s.alertDot,
                      {
                        backgroundColor:
                          a.severity === "danger"
                            ? "#E879F9"
                            : a.severity === "severe"
                              ? "#F87171"
                              : "#FBBF24",
                      },
                    ]}
                  />
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
            <View style={s.historyCard}>
              <View style={s.cardHead}>
                <View style={s.historyTitleRow}>
                  <Text style={s.historyIcon}>🕓</Text>
                  <Text style={s.historyCardLabel}>ALERT HISTORY</Text>
                </View>
                <View style={s.historyBadge}>
                  <Text style={s.historyBadgeText}>{alertHistory.length}</Text>
                </View>
              </View>

              {alertHistory.map((item, i) => (
                <AlertHistoryItem
                  key={i}
                  message={item.message}
                  time={item.time}
                  severity={item.severity}
                  index={i}
                />
              ))}
            </View>
          )}
        </Animated.View>
      )}

      {/* ══ BUTTON ══ */}
      <TouchableOpacity
        style={[s.btn, { borderColor: risk.color + "80" }]}
        onPress={() => checkEnvironment()}
        activeOpacity={0.7}
        disabled={loading}
      >
        <View style={[s.btnInner, { backgroundColor: risk.color + "12" }]}>
          {loading ? (
            <View style={s.btnLoadRow}>
              <ActivityIndicator size="small" color={risk.color} />
              <Text style={[s.btnText, { color: risk.color }]}>Scanning…</Text>
            </View>
          ) : (
            <Text style={[s.btnText, { color: risk.color }]}>
              ↺ Refresh Data
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* ══ FOOTER ══ */}
      <View style={s.footer}>
        {updatedAt && (
          <Text style={s.footerText}>
            Updated ·{" "}
            {updatedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        )}
        {coords && (
          <Text style={s.footerText}>
            {coords.latitude.toFixed(5)}°, {coords.longitude.toFixed(5)}°
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: 20,
    paddingTop: 58,
    alignItems: "center",
    paddingBottom: 56,
  },

  topBar: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 44,
  },
  topLeft: { gap: 6 },
  appLabel: {
    fontSize: 9,
    letterSpacing: 3.5,
    color: "#4B5563",
    fontWeight: "800",
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  pinIcon: { fontSize: 14 },
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
    fontWeight: "600",
    letterSpacing: 0.8,
  },

  orbSection: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  ring3: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
  },
  ring2: {
    position: "absolute",
    width: 206,
    height: 206,
    borderRadius: 103,
    borderWidth: 1,
  },
  ring1: {
    position: "absolute",
    width: 178,
    height: 178,
    borderRadius: 89,
    borderWidth: 1.5,
  },
  orb: {
    width: 154,
    height: 154,
    borderRadius: 77,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  orbIcon: { fontSize: 34, marginBottom: 2 },
  orbLevel: { fontSize: 13, fontWeight: "900", letterSpacing: 3.5 },
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
    borderWidth: 1,
  },
  trendIcon: {
    fontSize: 8,
    color: "#9CA3AF",
  },
  trendText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
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
  errBox: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
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
    borderColor: "rgba(255,255,255,0.07)",
    padding: 18,
    marginBottom: 12,
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
  alertDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#F87171",
    marginTop: 6,
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
    borderColor: "rgba(255,255,255,0.07)",
    padding: 18,
    marginBottom: 12,
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyIcon: {
    fontSize: 12,
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

  btn: {
    marginTop: 8,
    borderWidth: 1.5,
    borderRadius: 50,
    overflow: "hidden",
    width: "68%",
  },
  btnInner: { paddingVertical: 16, alignItems: "center" },
  btnText: { fontSize: 12, fontWeight: "800", letterSpacing: 2.5 },
  btnLoadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  footer: { marginTop: 24, alignItems: "center", gap: 4 },
  footerText: {
    fontSize: 10,
    color: "#4B5563",
    letterSpacing: 1,
    fontWeight: "600",
  },
});
