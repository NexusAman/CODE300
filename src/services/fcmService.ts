import axios from "axios";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

// Your Render.com server URL.
// EXPO_PUBLIC_SERVER_URL in your .env / EAS secrets takes priority.
// Falls back to the real production URL so the app works even without the env var set.
const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || "https://enviro-server.onrender.com";

// Only block if still the original placeholder — never block the real server URL.
const IS_PLACEHOLDER_URL = SERVER_URL === "https://your-app.onrender.com";

// ─── Token cache — avoid calling getExpoPushTokenAsync() repeatedly ──────────
// getExpoPushTokenAsync() can fail on rapid app opens — cache it after first success
let cachedToken: string | null = null;

// ─── Get FCM token from Expo ──────────────────────────────────────────────────
export const getFCMToken = async (): Promise<string | null> => {
  // Return cached token immediately if available
  if (cachedToken) return cachedToken;

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

    cachedToken = tokenData.data; // ← cache it
    return cachedToken;
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
  if (IS_PLACEHOLDER_URL) {
    // Throw so the caller (checkEnvironment) can show a visible error
    // instead of silently swallowing the failure. This is the #1 reason
    // users don't appear in the backend dashboard.
    throw new Error(
      "SERVER_URL is still the placeholder. Set EXPO_PUBLIC_SERVER_URL in your .env file or EAS secrets and rebuild the app.",
    );
  }

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
    throw err; // re-throw so caller can surface it in UI
  }
};

// ─── Update location on server when it changes ───────────────────────────────
// appOpen: true  → server will SKIP push (app handles locally)
// appOpen: false → server will SEND push (app is closed)
export const updateLocationOnServer = async (
  latitude: number,
  longitude: number,
  appOpen: boolean = false,
): Promise<void> => {
  if (IS_PLACEHOLDER_URL) return; // silently skip — registerDeviceWithServer already warned

  try {
    const token = await getFCMToken();
    if (!token) return;

    await axios.post(`${SERVER_URL}/update-location`, {
      fcmToken: token,
      latitude,
      longitude,
      appOpen,
    });
  } catch (err) {
    // Fail silently — not critical
    console.warn("Failed to update location on server:", err);
  }
};
