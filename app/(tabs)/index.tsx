import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import * as Notifications from "expo-notifications";

import { getUserLocation } from "../../src/services/locationService";
import { fetchEnvironmentalData } from "../../src/services/weatherService";
import { evaluateRisk } from "../../src/engine/riskEngine";
import { sendRiskNotification } from "../../src/notifications/notificationService";

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ------------------ AQI CATEGORY (1–6) ------------------
  const epaIndex = data?.current?.air_quality?.["us-epa-index"];

  const getAQILabel = (aqi: number | undefined) => {
    if (!aqi) return "Unknown";
    switch (aqi) {
      case 1:
        return "Good";
      case 2:
        return "Moderate";
      case 3:
        return "Unhealthy (Sensitive)";
      case 4:
        return "Unhealthy";
      case 5:
        return "Very Unhealthy";
      case 6:
        return "Hazardous";
      default:
        return "Unknown";
    }
  };

  // ------------------ REAL AQI (0–500) ------------------
  const calculateAQI = (pm25: number) => {
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

  const pm25 = data?.current?.air_quality?.pm2_5;
  const realAQI = pm25 ? calculateAQI(pm25) : null;

  // ------------------ EFFECT ------------------
  useEffect(() => {
    if (Platform.OS !== "web") {
      Notifications.requestPermissionsAsync();
    }
    checkEnvironment();
  }, []);

  // ------------------ MAIN CHECK FUNCTION ------------------
  const checkEnvironment = async () => {
    try {
      setLoading(true);
      setError(null);

      const coords = await getUserLocation();

      const envData = await fetchEnvironmentalData(
        coords.latitude,
        coords.longitude,
      );

      setData(envData);

      const detectedAlerts = evaluateRisk(envData);
      setAlerts(detectedAlerts);

      // 🔥 Practical notification rule
      if (realAQI && realAQI > 100 && Platform.OS !== "web") {
        await sendRiskNotification([
          `Air quality is unhealthy (AQI ${realAQI}). Limit outdoor activity.`,
        ]);
      }
    } catch (err) {
      console.log("Error:", err);
      setError("Failed to fetch environmental data.");
    } finally {
      setLoading(false);
    }
  };

  // ------------------ RISK STATUS ------------------
  const getRiskLevel = () => {
    if (!realAQI) return "UNKNOWN";

    if (realAQI <= 50) return "SAFE";
    if (realAQI <= 100) return "MODERATE";
    if (realAQI <= 200) return "UNHEALTHY";
    return "DANGEROUS";
  };

  const getRiskColor = () => {
    if (!realAQI) return "#9E9E9E";

    if (realAQI <= 50) return "#4CAF50";
    if (realAQI <= 100) return "#FFC107";
    if (realAQI <= 200) return "#F44336";
    return "#7E0023";
  };

  // ------------------ UI ------------------
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Environmental Risk Monitor</Text>

      {loading && <ActivityIndicator size="large" />}

      {error && <Text style={styles.error}>{error}</Text>}

      {data && (
        <>
          {/* STATUS CARD */}
          <View
            style={[styles.statusCard, { backgroundColor: getRiskColor() }]}
          >
            <Text style={styles.statusText}>{getRiskLevel()}</Text>
          </View>

          {/* WEATHER CARD */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current Conditions</Text>

            <View style={styles.row}>
              <Text style={styles.label}>🌡 Temperature</Text>
              <Text style={styles.value}>{data.current.temp_c}°C</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>🌫 PM2.5</Text>
              <Text style={styles.value}>{pm25}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>🌍 AQI (Real)</Text>
              <Text style={styles.value}>{realAQI ?? "-"}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>🌍 AQI (EPA Level)</Text>
              <Text style={styles.value}>
                {epaIndex} - {getAQILabel(epaIndex)}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>☀️ UV Index</Text>
              <Text style={styles.value}>{data.current.uv}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>👁 Visibility</Text>
              <Text style={styles.value}>{data.current.vis_km} km</Text>
            </View>
          </View>

          {/* ALERT CARD */}
          {alerts.length > 0 && (
            <View style={styles.alertCard}>
              <Text style={styles.alertTitle}>⚠ Risk Alerts</Text>
              {alerts.map((alert, index) => (
                <Text key={index} style={styles.alertText}>
                  • {alert.message}
                </Text>
              ))}
            </View>
          )}
        </>
      )}

      <View style={{ marginTop: 20 }}>
        <Button title="Check Now" onPress={checkEnvironment} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f4f6f8",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  statusCard: {
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  statusText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18,
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    elevation: 3,
  },
  cardTitle: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
  },
  value: {
    fontWeight: "bold",
  },
  alertCard: {
    backgroundColor: "#fff3f3",
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 5,
    borderLeftColor: "#F44336",
  },
  alertTitle: {
    fontWeight: "bold",
    marginBottom: 8,
    color: "#F44336",
  },
  alertText: {
    color: "#d32f2f",
    marginBottom: 5,
  },
  error: {
    color: "red",
    marginBottom: 10,
  },
});
