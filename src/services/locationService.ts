import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Linking, Platform } from "react-native";
import { updateLocationOnServer } from "./fcmService";

export const getUserLocation = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error("Location permission denied");
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 10000,
  });

  return location.coords;
};

// ─── Background Location Task ─────────────────────────────────────────────────
// Updates the server with the user's real location even when app is closed.
// Task must be defined at TOP LEVEL of module (not inside a component).

export const BACKGROUND_LOCATION_TASK = "background-location-task";
let backgroundSettingsRedirected = false;

// Callback registered by the app — calls updateLocationOnServer
let _onLocationUpdate: ((lat: number, lon: number) => void) | null = null;

type BackgroundTaskPayload = {
  locations?: {
    coords: {
      latitude: number;
      longitude: number;
    };
  }[];
};

export const setBackgroundLocationCallback = (
  cb: (lat: number, lon: number) => void,
) => {
  _onLocationUpdate = cb;
};

const ensureBackgroundTaskRegistered = () => {
  try {
    const alreadyDefined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
    if (alreadyDefined) return;

    TaskManager.defineTask(
      BACKGROUND_LOCATION_TASK,
      async ({
        data,
        error,
      }: {
        data?: BackgroundTaskPayload;
        error?: { message?: string } | null;
      }) => {
        if (error) {
          console.warn("Background location task error:", error.message);
          return;
        }
        if (data?.locations?.length) {
          const { latitude, longitude } = data.locations[0].coords;
          // Read persisted alert types — background task can't access React state
          let activeAlertTypes: string[] = [];
          try {
            const stored = await AsyncStorage.getItem("alertedTypes");
            if (stored) activeAlertTypes = JSON.parse(stored);
          } catch {}
          updateLocationOnServer(
            latitude,
            longitude,
            false,
            activeAlertTypes,
          ).catch((err) => {
            console.warn("Background location server sync failed:", err);
          });
          _onLocationUpdate?.(latitude, longitude);
        }
      },
    );
  } catch (error) {
    console.warn("Background location task registration skipped:", error);
  }
};

ensureBackgroundTaskRegistered();

// ─── Start / Stop Background Location ────────────────────────────────────────

export const startBackgroundLocation = async (): Promise<void> => {
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(
    () => false,
  );
  if (!servicesEnabled) {
    throw new Error("Location services are disabled on this device.");
  }

  const backgroundAvailable =
    await Location.isBackgroundLocationAvailableAsync().catch(() => false);
  if (!backgroundAvailable) {
    throw new Error(
      "Background location is not available in this runtime. Use a development/production build.",
    );
  }

  const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
  if (fgStatus !== "granted") {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      throw new Error(
        "Foreground location permission required before background access.",
      );
    }
  }

  const { status, canAskAgain } =
    await Location.requestBackgroundPermissionsAsync();
  if (status !== "granted") {
    if (Platform.OS === "android" && !backgroundSettingsRedirected) {
      backgroundSettingsRedirected = true;
      if (!canAskAgain) {
        await Linking.openSettings().catch(() => {});
      }
    }
    throw new Error(
      "Background location permission denied. Please set Location to 'Allow all the time' in app settings.",
    );
  }

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);

  if (alreadyRunning) return;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // Update every 5 min or if moved 500m — matches server cron interval
    timeInterval: 5 * 60 * 1000,
    distanceInterval: 500,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Enviro Monitor",
      notificationBody: "Monitoring environmental conditions…",
      notificationColor: "#34D399",
    },
  });

  console.log("✅ Background location started");
};

export const stopBackgroundLocation = async (): Promise<void> => {
  const running = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK,
  ).catch(() => false);

  if (running) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    console.log("🛑 Background location stopped");
  }
};

// ─── Check Background Permission Status ──────────────────────────────────────
// Returns true if background location permission is granted
export const hasBackgroundLocationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    console.log("🔍 Background permission status:", status);
    return status === "granted";
  } catch (error) {
    console.warn("⚠️ Background permission check failed:", error);
    return false;
  }
};

export const getBackgroundLocationPermissionStatus =
  async (): Promise<Location.PermissionStatus> => {
    try {
      const { status } = await Location.getBackgroundPermissionsAsync();
      return status;
    } catch {
      return Location.PermissionStatus.UNDETERMINED;
    }
  };

export const isBackgroundLocationRunning = async (): Promise<boolean> => {
  try {
    return await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
    );
  } catch {
    return false;
  }
};
