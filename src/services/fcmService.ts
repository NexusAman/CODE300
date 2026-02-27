import axios from "axios";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

// Your Render.com server URL — update this after deploying
const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || "https://enviro-server.onrender.com";

// ─── Get FCM token from Expo ──────────────────────────────────────────────────
export const getFCMToken = async (): Promise<string | null> => {
  try {
    // Push notifications only work on real devices
    if (!Device.isDevice) {
      console.warn("Push notifications require a real device.");
      return null;
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("Notification permission denied.");
      return null;
    }

    // Get Expo push token — works as FCM token via Expo's push service
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    });

    return tokenData.data;
  } catch (err) {
    console.warn("Failed to get FCM token:", err);
    return null;
  }
};

// ─── Register device with your server ────────────────────────────────────────
export const registerDeviceWithServer = async (
  latitude: number,
  longitude: number,
): Promise<void> => {
  try {
    const token = await getFCMToken();
    if (!token) return;

    await axios.post(`${SERVER_URL}/register`, {
      fcmToken: token,
      latitude,
      longitude,
    });

    console.log("✅ Device registered with server");
  } catch (err) {
    console.warn("Failed to register device with server:", err);
  }
};

// ─── Update location on server when it changes ───────────────────────────────
export const updateLocationOnServer = async (
  latitude: number,
  longitude: number,
): Promise<void> => {
  try {
    const token = await getFCMToken();
    if (!token) return;

    await axios.post(`${SERVER_URL}/update-location`, {
      fcmToken: token,
      latitude,
      longitude,
    });
  } catch (err) {
    // Fail silently — not critical
    console.warn("Failed to update location on server:", err);
  }
};
