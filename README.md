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

Enviro Monitor is a real-time environmental monitoring mobile app that tracks **air quality, UV index, temperature, wind speed, and visibility** — and sends intelligent **push notifications even when the app is fully closed.**

> 💡 Keep users safe by alerting them about dangerous environmental conditions in their exact GPS location — 24/7, in real time.

---

## 📸 Screenshots

| Dashboard | Active Alerts | Alert History |
|-----------|--------------|---------------|
| _coming soon_ | _coming soon_ | _coming soon_ |

---

## ✨ Features

- 🌫 **Real-time AQI** — Calculated using the official US EPA formula from PM2.5 data
- ☀️ **UV, Temperature, Wind, Visibility** monitoring
- 🔔 **Background push notifications** — alerts even when app is fully closed
- 🚫 **Smart deduplication** — same alert never fires twice in a row
- ✅ **Auto alert clearing** — when conditions improve
- 📈 **AQI trend indicator** — Rising / Stable / Improving
- ⏱ **Auto refresh every 2 minutes** — live weather feel, responsible API usage
- 🎨 **Dynamic dark UI** — color theme changes by risk level
- 📜 **Alert history log** — last 10 severe/danger alerts
- 📍 **GPS reverse geocoding** — shows your city name

---

## 🏗 Architecture

```
📱 MOBILE APP (Expo React Native)
┌─────────────────────────────────────────────────┐
│  GPS Location  →  WeatherAPI  →  Risk Engine    │
│  AQI Display   →  Alerts UI  →  Local Notif.   │
│  Token: ExponentPushToken[xxxx]                 │
│  Auto refresh: every 2 min (app open)           │
└─────────────┬───────────────────────────────────┘
              │ POST /register { token, lat, lng }
              ▼
🖥 BACKEND SERVER (Node.js on Render.com)
┌─────────────────────────────────────────────────┐
│  userStore Map { token → lat, lng, alerts[] }   │
│  /register   → store device                     │
│  /update-location → update GPS                  │
│  /check → trigger risk evaluation               │
│  /health → keep server alive (UptimeRobot)      │
└─────────────┬───────────────────────────────────┘
              │                    ▲
    ┌─────────┴──────────┐  ┌──────┴────────┐
    ▼                    ▼  │               │
🌤 WeatherAPI    📡 Expo Push API   ⏱ cron-job.org
(weather data)   (push delivery)   (every 5 min)
    │                    │
    ▼                    ▼
Risk Engine         📱 User Phone
evaluateRisk()      (notification arrives ✅)
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | Expo React Native + TypeScript |
| Push Notifications | Expo Push API |
| Location | expo-location |
| Backend | Node.js + Express |
| Hosting | Render.com (free tier) |
| Weather Data | WeatherAPI.com |
| Scheduler | cron-job.org |
| Server Uptime | UptimeRobot |
| Build | EAS Build |

---

## 🚀 How It Works

### App Open
```
Launch → Get GPS + Expo Token → Register with server
→ Fetch WeatherAPI → Evaluate risk → Show UI
→ Auto refresh every 2 minutes
```

### App Closed
```
cron-job.org → every 5 min → /check
→ Server fetches WeatherAPI for each user
→ evaluateRisk() → severe/danger found?
→ Expo Push API → notification on phone ✅
```

### Smart Refresh Strategy
| Trigger | Interval | Notes |
|---------|----------|-------|
| Auto refresh (app open) | Every 2 min | Live weather feel |
| AppState foreground | 2 min cooldown | No API spam |
| Manual refresh button | Instant | Always works |
| Server cron (app closed) | Every 5 min | Background monitoring |

---

## ⚠️ Risk Thresholds

| Parameter | Warning | Severe | Danger |
|-----------|---------|--------|--------|
| PM2.5 Air Quality | > 12 µg/m³ | > 35 µg/m³ | > 55 µg/m³ |
| UV Index | > 3 | — | > 6 |
| Temperature | > 35°C | — | > 40°C |
| Visibility | < 5 km | — | < 2 km |
| Wind Speed | > 40 km/h | — | > 70 km/h |

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
EXPO_PUBLIC_SERVER_URL=https://your-app.onrender.com
EXPO_PUBLIC_PROJECT_ID=your_expo_project_id
```

### 3. Deploy backend to Render.com
```bash
# Set these env variables on Render dashboard:
WEATHER_API_KEY=your_weatherapi_key
CRON_SECRET=your_random_secret
```

### 4. Set up cron-job.org
```
URL: https://your-app.onrender.com/check?secret=yourSecret
Schedule: every 5 minutes
```

### 5. Set up UptimeRobot
```
URL: https://your-app.onrender.com/health
Interval: every 5 minutes
```

### 6. Build the app
```bash
eas build -p android --profile preview
```

---

## 💰 Infrastructure Cost

| Service | Purpose | Cost |
|---------|---------|------|
| Render.com | Server hosting | Free |
| Expo Push API | Push notifications | Free |
| WeatherAPI.com | Weather data | Free |
| cron-job.org | Scheduled checks | Free |
| UptimeRobot | Server uptime | Free |
| EAS Build | APK builds | Free |
| **Total** | | **$0/month** |

---

## 👥 Team Elite Executors

| Name | Role |
|------|------|
| **Aman Kumar Keshri** | Lead |
| **Rohit Singh** | Team Member |
| **Dheeraj Mahapatra** | Team Member |
| **Shyam Kumar Soni** | Team Member |
| **Shivankar** | Team Member |

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

- [WeatherAPI.com](https://weatherapi.com) — Environmental data
- [Expo](https://expo.dev) — React Native framework + Push API
- [Render.com](https://render.com) — Free server hosting
- [cron-job.org](https://cron-job.org) — Free cron scheduling

---

<p align="center">
  Built with 💚 by <strong>Team Elite Executors</strong> — Hackathon 2026
</p>
