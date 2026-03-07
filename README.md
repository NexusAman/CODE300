# 🌿 Enviro Monitor

> **Real-Time Environmental Monitoring & Alert System**  
> Built with ❤️ by **Team Elite Executors** at Hackathon 2026

![Platform](https://img.shields.io/badge/Platform-Android-green?style=flat-square&logo=android)
![Built With](https://img.shields.io/badge/Built%20With-Expo%20React%20Native-blue?style=flat-square&logo=expo)
![Backend](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-brightgreen?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/License-Custom%20%7C%20No%20Commercial%20Use-red?style=flat-square)
![Cost](https://img.shields.io/badge/Infrastructure%20Cost-%240-success?style=flat-square)

---

## 📱 What is Enviro Monitor?

Enviro Monitor is a real-time environmental monitoring mobile app that tracks **air quality, UV index, temperature, wind speed, visibility, humidity, and precipitation** — and sends intelligent **push notifications even when the app is fully closed.**

> 💡 Keep users safe by alerting them about dangerous environmental conditions in their exact GPS location — 24/7, in real time.

---

## 📸 Screenshots

| Dashboard     | Active Alerts | Alert History |
| ------------- | ------------- | ------------- |
| _coming soon_ | _coming soon_ | _coming soon_ |

---

## ✨ Features

- 🌫 **Real-time NAQI** — Indian National AQI (CPCB standard) from PM2.5 & PM10 with 6 sub-indices
- ☀️ **8 environmental metrics** — AQI, UV, Temperature, Wind, Visibility, Humidity, Precipitation, Feels-like
- 🔔 **Background push notifications** — server checks every 5 min and alerts even when app is fully closed
- 📍 **Background location tracking** — foreground service keeps location updated even when app is closed
- 🚫 **Smart deduplication** — same alert never fires twice; deviceId ensures one token per physical device
- 🔄 **Token rotation** — detects Expo push token changes and cleans up stale server entries
- 💓 **Heartbeat sync** — 2-min heartbeat keeps server's `appOpen` flag alive, preventing duplicate pushes
- ✅ **Auto alert clearing** — when conditions improve, alerts reset; location change >1 km clears stale alerts
- 📈 **AQI trend indicator** — Rising / Stable / Improving with animated icons
- ⏱ **Auto refresh every 5 minutes** — matches server cron, saves battery + API quota
- 🎨 **Dynamic dark UI** — background color changes by NAQI risk tier (6 levels)
- 📜 **Alert history log** — last 10 severe/danger alerts, including server push alerts bridged in real-time
- 📍 **GPS reverse geocoding** — shows your city name with WeatherAPI fallback
- 📌 **Saved locations** — search and save any city, see live AQI + weather at a glance
- 🚀 **Animated splash + onboarding** — first-launch experience with 3-step walkthrough
- 💾 **Cold-start cache** — last known data restored instantly from AsyncStorage on app reopen
- 🛡 **Retry with backoff** — both weather API and server calls retry on transient failures

---

## 🏗 Architecture

```
📱 MOBILE APP (Expo SDK 54 + React Native)
┌──────────────────────────────────────────────────────┐
│  GPS Location → WeatherAPI → Risk Engine (8 metrics) │
│  NAQI Display → Alerts UI → Local Notifications      │
│  Token: ExponentPushToken[xxxx]                      │
│  DeviceId: android-<uuid> (survives token rotation)  │
│  Auto refresh: every 5 min (app open)                │
│  Heartbeat: every 2 min → server appOpen flag        │
│  Background location: foreground service, 5 min/500m │
│  Saved locations: search + live weather cards         │
└─────────────┬────────────────────────────────────────┘
              │ POST /register { token, deviceId,
              │   previousToken, lat, lng }
              │ POST /update-location { token, deviceId,
              │   lat, lng, appOpen, activeAlertTypes }
              ▼
🖥 BACKEND SERVER (Node.js + Express on Render.com)
┌──────────────────────────────────────────────────────┐
│  Upstash Redis { users hash: token → user data }     │
│  Write lock: promise-chain serialization              │
│  /register   → upsert by deviceId, clean prev token  │
│  /update-location → update GPS + appOpen flag         │
│  /check → run risk evaluation for all users           │
│  /daily-summary → 6 AM IST daily condition report     │
│  /health → keep server alive                          │
│  Rate limiting: per-IP, per-token, global             │
└─────────────┬────────────────────────────────────────┘
              │                    ▲
    ┌─────────┴──────────┐  ┌──────┴────────┐
    ▼                    ▼  │               │
🌤 WeatherAPI    📡 Expo Push API   ⏱ node-cron
(weather data)   (push delivery)   (*/5 min risk,
    │                    │          6 AM summary,
    ▼                    ▼          3:30 AM prune)
Risk Engine         📱 User Phone
evaluateRisk()      (notification arrives ✅)
```

---

## 🛠 Tech Stack

| Layer              | Technology                                      |
| ------------------ | ----------------------------------------------- |
| Mobile App         | Expo SDK 54 + React Native 0.81 + TypeScript    |
| Push Notifications | Expo Push API (via expo-notifications)          |
| Location           | expo-location (foreground + background service) |
| Background Tasks   | expo-task-manager                               |
| Storage            | AsyncStorage (client), Upstash Redis (server)   |
| Backend            | Node.js + Express (separate repo)               |
| Hosting            | Render.com (free tier)                          |
| Weather Data       | WeatherAPI.com (CPCB India AQI)                 |
| Scheduler          | node-cron (in-process, server-side)             |
| Build              | EAS Build (preview + production profiles)       |

---

## 🚀 How It Works

### App Open

```
Launch → Restore cached data (instant UI)
→ Get GPS + Expo Token → Register with server (deviceId dedup)
→ Fetch WeatherAPI → Evaluate risk (8 metrics × 3 tiers) → Show UI
→ Auto refresh every 5 min + heartbeat every 2 min
→ Server skips push (appOpen = true)
```

### App Closed

```
node-cron → every 5 min → runRiskCheck()
→ Server fetches WeatherAPI for each user (outside write lock)
→ evaluateRisk() → severe/danger found? + appOpen expired?
→ Expo Push API → notification on phone ✅
→ Each alert type fires only once until cleared
```

### Background Location

```
expo-task-manager → foreground service (Android)
→ Updates every 5 min or 500m moved
→ Reads alertedTypes from AsyncStorage
→ POST /update-location { appOpen: false }
→ Server knows user's real position even when app is closed
```

### Smart Refresh Strategy

| Trigger                  | Interval       | Notes                               |
| ------------------------ | -------------- | ----------------------------------- |
| Auto refresh (app open)  | Every 5 min    | Matches server cron, saves battery  |
| AppState foreground      | 5 min cooldown | No API spam on rapid app switches   |
| Manual pull-to-refresh   | Instant        | Always works with haptic feedback   |
| Heartbeat (appOpen sync) | Every 2 min    | Keeps server TTL alive              |
| Server cron (app closed) | Every 5 min    | Background monitoring for all users |
| Background location      | 5 min / 500m   | Real GPS even when app is closed    |

---

## ⚠️ Risk Thresholds (CPCB / IMD Standards)

| Parameter          | Light Warning | Warning     | Severe      | Danger       |
| ------------------ | ------------- | ----------- | ----------- | ------------ |
| Overall AQI (NAQI) | ≥ 100         | ≥ 200       | ≥ 300       | ≥ 400        |
| UV Index           | —             | ≥ 3         | ≥ 6         | ≥ 8          |
| Temperature        | —             | ≥ 36°C      | ≥ 40°C      | ≥ 45°C       |
| Visibility         | —             | ≤ 3 km      | ≤ 1 km      | ≤ 0.2 km     |
| Wind Speed         | —             | ≥ 40 km/h   | ≥ 60 km/h   | ≥ 80 km/h    |
| Humidity           | —             | ≥ 75%       | ≥ 85%       | ≥ 95%        |
| Precipitation      | —             | ≥ 2.5 mm/hr | ≥ 7.5 mm/hr | ≥ 35.5 mm/hr |

> **Note:** Overall NAQI = max(PM2.5 sub-index, PM10 sub-index) using CPCB breakpoints. AQI is the only metric with a 4th "light warning" tier. Individual PM2.5/PM10 concentrations are not alerted on separately.

---

## ⚙️ Setup Guide

### Prerequisites

- Node.js installed
- Expo account at expo.dev
- WeatherAPI key from weatherapi.com
- Render.com account

### 1. Clone the repo

```bash
git clone https://github.com/NexusAman/enviro-monitor.git
cd enviro-monitor
npm install
```

### 2. Set up environment variables

```bash
# Create .env file
EXPO_PUBLIC_WEATHER_API_KEY=your_weatherapi_key
EXPO_PUBLIC_SERVER_URL=https://your-server.onrender.com
EXPO_PUBLIC_PROJECT_ID=your_expo_project_id
EXPO_PUBLIC_CLIENT_API_KEY=your_client_api_key
```

### 3. Deploy backend

The server lives in a **separate repository**. Set these env variables on Render:

```bash
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
WEATHER_API_KEY=your_weatherapi_key
CRON_SECRET=your_random_secret
CLIENT_API_KEY=your_client_api_key  # must match EXPO_PUBLIC_CLIENT_API_KEY
```

The server uses **node-cron** internally — no external cron service needed.

### 4. Build the app

```bash
eas build -p android --profile preview   # internal testing APK
eas build -p android --profile production # production AAB
```

---

## 💰 Infrastructure Cost

| Service        | Purpose               | Cost         |
| -------------- | --------------------- | ------------ |
| Render.com     | Server hosting        | Free         |
| Upstash Redis  | Persistent user store | Free tier    |
| Expo Push API  | Push notifications    | Free         |
| WeatherAPI.com | Weather + AQI data    | Free tier    |
| EAS Build      | APK/AAB builds        | Free tier    |
| **Total**      |                       | **$0/month** |

---

## 👥 Team Elite Executors

| Name                  | Role        |
| --------------------- | ----------- |
| **Aman Kumar Keshri** | Team Lead   |
| **Rohit Singh**       | Team Member |
| **Dheeraj Mahapatra** | Team Member |
| **Shyam Kumar Soni**  | Team Member |
| **Shivankar**         | Team Member |

---

## 📄 License

```
Copyright (c) 2026 Elite Executors. All Rights Reserved.

This project is licensed under a Custom License.
- ✅ Personal and educational use permitted
- ✅ Study and reference with attribution
- ❌ Commercial use NOT permitted
- ❌ Redistribution as own work NOT permitted

See LICENSE.txt for full terms.
```

---

## 🙏 Acknowledgements

- [WeatherAPI.com](https://weatherapi.com) — Environmental data with CPCB India AQI
- [Expo](https://expo.dev) — React Native framework + Push API
- [Render.com](https://render.com) — Free server hosting
- [Upstash](https://upstash.com) — Serverless Redis for persistent user store

---

<p align="center">
  Built with 💚 by <strong>Elite Executors</strong> — CODE300 2026
</p>
