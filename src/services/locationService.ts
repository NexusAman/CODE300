import * as Location from "expo-location";

export const getUserLocation = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error("Location permission denied");
  }

  // FIX: was getCurrentPositionAsync({}) with no options — could hang indefinitely
  // on Android indoors waiting for a GPS fix. Balanced accuracy uses cell/wifi
  // instead of pure GPS, and timeInterval caps the wait at 10 seconds.
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 10000,
  });

  return location.coords;
};
