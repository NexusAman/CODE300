import axios, { AxiosError } from "axios";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

// Your Render.com server URL.
// EXPO_PUBLIC_SERVER_URL in your .env / EAS secrets takes priority.
// Falls back to the real production URL so the app works even without the env var set.
const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || "https://enviro-server.onrender.com";
const CLIENT_API_KEY = process.env.EXPO_PUBLIC_CLIENT_API_KEY;

// Only block if still the original placeholder — never block the real server URL.
const IS_PLACEHOLDER_URL = SERVER_URL === "https://your-app.onrender.com";
const SERVER_TIMEOUT_MS = 10000;
const SERVER_RETRY_COUNT = 2;

const serverApi = axios.create({
  timeout: SERVER_TIMEOUT_MS,
});

const getClientAuthHeaders = () => {
  if (!CLIENT_API_KEY) return undefined;
  return { "x-client-key": CLIENT_API_KEY };
};

// ─── Token cache — avoid calling getExpoPushTokenAsync() repeatedly ──────────
// getExpoPushTokenAsync() can fail on rapid app opens — cache it after first success
let cachedToken: string | null = null;

const LOCATION_UPDATE_MIN_INTERVAL_MS = 45_000;
const LOCATION_JITTER_THRESHOLD = 0.0001;

let lastLocationUpdate: {
  latitude: number;
  longitude: number;
  appOpen: boolean;
  sentAt: number;
} | null = null;

const isNearlySameLocation = (
  previous: { latitude: number; longitude: number },
  current: { latitude: number; longitude: number },
) => {
  return (
    Math.abs(previous.latitude - current.latitude) <
      LOCATION_JITTER_THRESHOLD &&
    Math.abs(previous.longitude - current.longitude) < LOCATION_JITTER_THRESHOLD
  );
};

const getExpoProjectId = (): string | undefined => {
  const envProjectId = process.env.EXPO_PUBLIC_PROJECT_ID;
  if (envProjectId) return envProjectId;

  const easProjectId = (Constants as any)?.easConfig?.projectId;
  if (typeof easProjectId === "string" && easProjectId.length > 0) {
    return easProjectId;
  }

  const expoExtraProjectId = (Constants as any)?.expoConfig?.extra?.eas
    ?.projectId;
  if (typeof expoExtraProjectId === "string" && expoExtraProjectId.length > 0) {
    return expoExtraProjectId;
  }

  const manifestProjectId = (Constants as any)?.manifest2?.extra?.eas
    ?.projectId;
  if (typeof manifestProjectId === "string" && manifestProjectId.length > 0) {
    return manifestProjectId;
  }

  return undefined;
};

const isRetriableAxiosError = (error: unknown): boolean => {
  const axiosError = error as AxiosError;
  const status = axiosError.response?.status;
  if (status != null) {
    return status >= 500 || status === 429;
  }
  return axiosError.code === "ECONNABORTED" || !axiosError.response;
};

const postWithRetry = async <TBody extends object>(
  url: string,
  body: TBody,
  retries = SERVER_RETRY_COUNT,
) => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await serverApi.post(url, body, {
        headers: getClientAuthHeaders(),
      });
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

// ─── Get FCM token from Expo ──────────────────────────────────────────────────
export const getFCMToken = async (options?: {
  forceRefresh?: boolean;
}): Promise<string | null> => {
  // Return cached token immediately if available
  if (!options?.forceRefresh && cachedToken) return cachedToken;

  try {
    // Push notifications only work on real devices
    if (!Device.isDevice) {
      console.warn("Push notifications require a real device.");
      return null;
    }

    if (Device.osName === "Android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#34D399",
      });
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
      cachedToken = null;
      return null;
    }

    const projectId = getExpoProjectId();
    if (!projectId) {
      console.warn(
        "Push token unavailable: missing projectId. Set EXPO_PUBLIC_PROJECT_ID or ensure EAS project config is present.",
      );
      return null;
    }

    // Get Expo push token — works as FCM token via Expo's push service
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    if (!tokenData?.data) {
      console.warn("Push token request returned an empty token.");
      cachedToken = null;
      return null;
    }

    cachedToken = tokenData.data; // ← cache it
    return cachedToken;
  } catch (err) {
    console.warn("Failed to get FCM token:", err);
    cachedToken = null;
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

    await postWithRetry(`${SERVER_URL}/register`, {
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

  const now = Date.now();
  if (lastLocationUpdate) {
    const sameAppState = lastLocationUpdate.appOpen === appOpen;
    const sameLocation = isNearlySameLocation(lastLocationUpdate, {
      latitude,
      longitude,
    });
    const tooSoon =
      now - lastLocationUpdate.sentAt < LOCATION_UPDATE_MIN_INTERVAL_MS;

    if (sameAppState && sameLocation && tooSoon) {
      return;
    }
  }

  try {
    const token = await getFCMToken();
    if (!token) return;

    await postWithRetry(`${SERVER_URL}/update-location`, {
      fcmToken: token,
      latitude,
      longitude,
      appOpen,
    });

    lastLocationUpdate = { latitude, longitude, appOpen, sentAt: now };
  } catch (err) {
    // Fail silently — not critical
    console.warn("Failed to update location on server:", err);
  }
};
