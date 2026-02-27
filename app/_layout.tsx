import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Image, StyleSheet, Text } from "react-native";
import "react-native-reanimated";

const { width, height } = Dimensions.get("window");

// Keep native splash visible until we're ready to animate!
SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Animated Splash ──────────────────────────────────────────────────────────

function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const ring3Anim = useRef(new Animated.Value(0)).current;
  const textFade = useRef(new Animated.Value(0)).current;
  const exitFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Logo fades + scales in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      // 2. Rings expand outward one by one
      Animated.stagger(150, [
        Animated.timing(ring1Anim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(ring2Anim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(ring3Anim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // 3. App name fades in
      Animated.timing(textFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // 4. Hold for a moment
      Animated.delay(600),
      // 5. Entire splash fades out
      Animated.timing(exitFade, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => onFinish());
  }, []);

  const ring1Scale = ring1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.15],
  });
  const ring2Scale = ring2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.35],
  });
  const ring3Scale = ring3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.55],
  });

  return (
    <Animated.View style={[sp.container, { opacity: exitFade }]}>
      {/* Expanding rings */}
      <Animated.View
        style={[
          sp.ring,
          sp.ring3,
          {
            opacity: ring3Anim,
            transform: [{ scale: ring3Scale }],
          },
        ]}
      />
      <Animated.View
        style={[
          sp.ring,
          sp.ring2,
          {
            opacity: ring2Anim,
            transform: [{ scale: ring2Scale }],
          },
        ]}
      />
      <Animated.View
        style={[
          sp.ring,
          sp.ring1,
          {
            opacity: ring1Anim,
            transform: [{ scale: ring1Scale }],
          },
        ]}
      />

      {/* Logo */}
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          alignItems: "center",
        }}
      >
        <Image
          source={require("../assets/images/icon.png")}
          style={sp.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* App name */}
      <Animated.View
        style={{ opacity: textFade, alignItems: "center", marginTop: 24 }}
      >
        <Text style={sp.appName}>ENVIRO MONITOR</Text>
        <Text style={sp.tagline}>Real-time environmental risk</Text>
      </Animated.View>
    </Animated.View>
  );
}

const sp = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#060f0a",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  ring: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#34D399",
  },
  ring1: {
    width: 220,
    height: 220,
    borderColor: "#34D39960",
  },
  ring2: {
    width: 220,
    height: 220,
    borderColor: "#34D39930",
  },
  ring3: {
    width: 220,
    height: 220,
    borderColor: "#34D39915",
  },
  logo: {
    width: 160,
    height: 160,
  },
  appName: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 5,
    color: "#34D399",
    marginTop: 8,
  },
  tagline: {
    fontSize: 11,
    color: "#4B5563",
    letterSpacing: 1.5,
    fontWeight: "500",
    marginTop: 6,
  },
});

// ─── Root Layout ──────────────────────────────────────────────────────────────

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    // Hide native splash immediately so our animated one takes over
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="light" />

      {/* Render animated splash on top until animation finishes */}
      {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
    </>
  );
}
