import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedLocation {
  id: string;
  name: string;
  subtitle: string; // city, region
  latitude: number;
  longitude: number;
}

const STORAGE_KEY = "savedLocations";

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const getSavedLocations = async (): Promise<SavedLocation[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveLocation = async (loc: SavedLocation): Promise<void> => {
  const existing = await getSavedLocations();
  const updated = [...existing.filter((l) => l.id !== loc.id), loc];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const removeLocation = async (id: string): Promise<void> => {
  const existing = await getSavedLocations();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(existing.filter((l) => l.id !== id)),
  );
};

export const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
