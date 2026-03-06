import AsyncStorage from "@react-native-async-storage/async-storage";
import axios, { AxiosError } from "axios";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Your Render.com server URL.
// EXPO_PUBLIC_SERVER_URL must be set in your .env / EAS secrets.
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;
if (!SERVER_URL) {
  console.error(
    "EXPO_PUBLIC_SERVER_URL is not set. Server features will be disabled.",
  );
}
if (SERVER_URL && !SERVER_URL.startsWith("https://")) {
  throw new Error("EXPO_PUBLIC_SERVER_URL must use HTTPS.");
}

const CLIENT_API_KEY = process.env.EXPO_PUBLIC_CLIENT_API_KEY;
if (!CLIENT_API_KEY) {
  console.error(
    "EXPO_PUBLIC_CLIENT_API_KEY is not set. Server requests will be unauthenticated.",
  );
}

// Only block if still the original placeholder — never block the real server URL.
const IS_PLACEHOLDER_URL =
  !SERVER_URL || SERVER_URL === "https://your-app.onrender.com";
const SERVER_TIMEOUT_MS = 10000;
const SERVER_RETRY_COUNT = 2;

const serverApi = axios.create({
  timeout: SERVER_TIMEOUT_MS,
});

const getClientAuthHeaders = () => {
  if (!CLIENT_API_KEY) {
    console.warn(
      "⚠️ No CLIENT_API_KEY — server request will be unauthenticated.",
    );
    return undefined;
  }
  return { "x-client-key": CLIENT_API_KEY };
};

// ─── Stable device identifier — survives token rotation ─────────────────────
// Expo push tokens can change across app reinstalls or OS updates.
// A persistent deviceId lets the server de-duplicate entries so a single
// physical device never occupies more than one slot.
const DEVICE_ID_KEY = "@enviro_device_id";
const LAST_TOKEN_KEY = "@enviro_last_fcm_token";
let cachedDeviceId: string | null = null;

const generateUUID = (): string => {
  // Math.random-based UUID v4 (sufficient for device identification)
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      // RFC 4122 variant 1: bits 10xx → value in [8, b]
      uuid += hex[(Math.random() * 4) | 8];
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
};

export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
  } catch {}
  const id = `${Platform.OS}-${generateUUID()}`;
  cachedDeviceId = id;
  AsyncStorage.setItem(DEVICE_ID_KEY, id).catch(() => {});
  return id;
};

// ─── Token cache — avoid calling getExpoPushTokenAsync() repeatedly ──────────
// getExpoPushTokenAsync() can fail on rapid app opens — cache it after first success
let cachedToken: string | null = null;
let tokenRequestInFlight: Promise<string | null> | null = null;

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

  if (!options?.forceRefresh && tokenRequestInFlight) {
    return tokenRequestInFlight;
  }

  const requestToken = async (): Promise<string | null> => {
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
        }).catch((error) => {
          console.warn("Notification channel setup failed:", error);
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

      cachedToken = tokenData.data;
      return cachedToken;
    } catch (err) {
      console.warn("Failed to get FCM token:", err);
      cachedToken = null;
      return null;
    }
  };

  tokenRequestInFlight = requestToken();
  const token = await tokenRequestInFlight;
  tokenRequestInFlight = null;
  return token;
};

// ─── Register device with your server ────────────────────────────────────────
export const registerDeviceWithServer = async (
  latitude: number,
  longitude: number,
  options?: { avgPM25?: number; avgPM10?: number },
): Promise<void> => {
  if (IS_PLACEHOLDER_URL) {
    throw new Error(
      "SERVER_URL is still the placeholder. Set EXPO_PUBLIC_SERVER_URL in your .env file or EAS secrets and rebuild the app.",
    );
  }

  try {
    const token = await getFCMToken();
    if (!token) return;

    const deviceId = await getDeviceId();

    // Detect token rotation: if the token changed, send the old one so
    // the server can remove the stale entry and avoid duplicate pushes.
    let previousToken: string | undefined;
    try {
      const stored = await AsyncStorage.getItem(LAST_TOKEN_KEY);
      if (stored && stored !== token) {
        previousToken = stored;
      }
    } catch {}

    await postWithRetry(`${SERVER_URL}/register`, {
      fcmToken: token,
      deviceId,
      previousToken,
      latitude,
      longitude,
      avgPM25: options?.avgPM25,
      avgPM10: options?.avgPM10,
    });

    // Persist the current token so we can detect future rotations
    AsyncStorage.setItem(LAST_TOKEN_KEY, token).catch(() => {});

    console.log("✅ Device registered with server");
  } catch (err) {
    console.warn("Failed to register device with server:", err);
    throw err;
  }
};

// ─── Update location on server when it changes ───────────────────────────────
// appOpen: true  → server will SKIP push (app handles locally)
// appOpen: false → server will SEND push (app is closed)
export const updateLocationOnServer = async (
  latitude: number,
  longitude: number,
  appOpen: boolean = false,
  activeAlertTypes: string[] = [],
  avgPM25?: number,
  avgPM10?: number,
): Promise<{ emaPM25?: number; emaPM10?: number } | null> => {
  if (IS_PLACEHOLDER_URL) return null; // silently skip — registerDeviceWithServer already warned

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
      return null;
    }
  }

  try {
    const token = await getFCMToken();
    if (!token) return null;

    const deviceId = await getDeviceId();

    const response = await postWithRetry(`${SERVER_URL}/update-location`, {
      fcmToken: token,
      deviceId,
      latitude,
      longitude,
      appOpen,
      activeAlertTypes,
      avgPM25,
      avgPM10,
    });

    lastLocationUpdate = { latitude, longitude, appOpen, sentAt: now };
    return response.data?.ema || null;
  } catch (err) {
    // Fail silently — not critical
    console.warn("Failed to update location on server:", err);
    return null;
  }
};
