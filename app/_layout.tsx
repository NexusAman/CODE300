import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import "react-native-reanimated";

// Keep native splash visible until we're ready to animate!
SplashScreen.preventAutoHideAsync().catch(() => {});

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    width: 120,
    height: 120,
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

// ─── Onboarding Overlay ───────────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  {
    icon: "🌿",
    title: "Real-Time Environmental Risk",
    desc: "Your air quality, UV, temperature, visibility and wind — evaluated live and explained in plain language.",
  },
  {
    icon: "🔔",
    title: "Background Alerts",
    desc: "Even when the app is closed, our server checks conditions every 5 minutes and pushes a notification if something dangerous is detected.",
  },
  {
    icon: "🛡",
    title: "No Spam. Ever.",
    desc: "You only get notified once per condition. No repeats until the condition clears and returns. You're in control.",
  },
];

function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goNext = () => {
    if (step < ONBOARDING_STEPS.length - 1) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setStep((s) => s + 1);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    } else {
      AsyncStorage.setItem("hasSeenOnboarding", "true").catch(() => {});
      onDone();
    }
  };

  const current = ONBOARDING_STEPS[step];

  return (
    <View style={ob.container}>
      <Animated.View style={[ob.card, { opacity: fadeAnim }]}>
        <Text style={ob.icon}>{current.icon}</Text>
        <Text style={ob.title}>{current.title}</Text>
        <Text style={ob.desc}>{current.desc}</Text>

        {/* Dots */}
        <View style={ob.dots}>
          {ONBOARDING_STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                ob.dot,
                { backgroundColor: i === step ? "#34D399" : "#374151" },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={ob.btn} onPress={goNext} activeOpacity={0.8}>
          <Text style={ob.btnText}>
            {step < ONBOARDING_STEPS.length - 1 ? "Next →" : "Get Started"}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const ob = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#060f0a",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 998,
    padding: 24,
  },
  card: { alignItems: "center", maxWidth: 340 },
  icon: { fontSize: 52, marginBottom: 24 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F9FAFB",
    textAlign: "center",
    letterSpacing: 0.2,
    marginBottom: 14,
  },
  desc: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "500",
  },
  dots: { flexDirection: "row", gap: 8, marginTop: 36, marginBottom: 28 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  btn: {
    backgroundColor: "#34D399",
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnText: {
    color: "#000",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.5,
  },
});

// ─── Root Layout ──────────────────────────────────────────────────────────────

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const router = useRouter();
  const notifResponseListener = useRef<any>(null);
  const notifReceivedListener = useRef<any>(null);

  const saveServerAlertToHistory = (data: any) => {
    if (!data?.source || data.source !== "server_alert" || !data?.message)
      return;
    AsyncStorage.getItem("alertHistory")
      .then((historyStr) => {
        try {
          const history = historyStr ? JSON.parse(historyStr) : [];
          const newItem = {
            message: data.message,
            time: new Date().toLocaleTimeString(),
            severity: data.severity || "severe",
          };
          const updated = [newItem, ...history].slice(0, 10);
          AsyncStorage.setItem("alertHistory", JSON.stringify(updated)).catch(
            () => {},
          );
        } catch (e) {
          console.warn("Failed to update alert history from notification:", e);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    // Hide native splash immediately so our animated one takes over
    SplashScreen.hideAsync().catch(() => {});

    // Check if onboarding has been seen before
    AsyncStorage.getItem("hasSeenOnboarding")
      .then((val) => {
        if (!val) setShowOnboarding(true);
      })
      .catch(() => {});

    // Save server alert to history when notification arrives in foreground
    // (covers the race where server pushes while app transitions to foreground)
    notifReceivedListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        saveServerAlertToHistory(data);
      });

    // Handle notification taps — bring user to home screen and save to history
    notifResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;

        // Save to history (same logic as received listener, handles cold-tap launch)
        saveServerAlertToHistory(data);

        router.push("/(tabs)");
      });

    return () => {
      notifResponseListener.current?.remove();
      notifReceivedListener.current?.remove();
    };
  }, [router]);

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />

      {/* Animated splash on top until animation finishes */}
      {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}

      {/* Onboarding overlay — shown only on first ever launch */}
      {splashDone && showOnboarding && (
        <OnboardingOverlay onDone={() => setShowOnboarding(false)} />
      )}
    </>
  );
}
