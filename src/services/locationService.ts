import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
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
      updateLocationOnServer(latitude, longitude, false).catch((err) => {
        console.warn("Background location server sync failed:", err);
      });
      _onLocationUpdate?.(latitude, longitude);
    }
  },
);

// ─── Start / Stop Background Location ────────────────────────────────────────

export const startBackgroundLocation = async (): Promise<void> => {
  const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
  if (fgStatus !== "granted") {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      throw new Error(
        "Foreground location permission required before background access.",
      );
    }
  }

  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Background location permission denied.");
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
    showsBackgroundLocationIndicator: false,
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
