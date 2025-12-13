# MagicMirror Custom Modules Guide

Complete documentation for all custom MagicMirror modules with Apple Human Interface Guidelines design principles.

## Table of Contents

- [Overview](#overview)
- [Hardware Requirements](#hardware-requirements)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Shared Infrastructure](#shared-infrastructure)
- [Modules](#modules)
  - [Timer](#timer-module)
  - [Countdown](#countdown-module)
  - [Quotes](#quotes-module)
  - [Transit](#transit-module)
  - [Music](#music-module)
  - [Smart Home](#smart-home-module)
  - [Fitness](#fitness-module)
  - [Packages](#packages-module)
  - [Network](#network-module)
  - [Security](#security-module)
- [Interaction Modes](#interaction-modes)
- [Theming & Customization](#theming--customization)
- [Troubleshooting](#troubleshooting)

---

## Overview

This collection adds 10 feature-rich modules to MagicMirror², designed with:

- **Apple HIG Principles**: Clean typography, high contrast, glanceable information
- **Three Interaction Modes**: Display-only, touch, and voice control
- **Provider Architecture**: Pluggable data sources for flexibility
- **Real-time Updates**: WebSocket support where available
- **Responsive Design**: Adapts to different screen sizes and orientations

### Module Summary

| Module | Description | Providers |
|--------|-------------|-----------|
| Timer | Countdown timer with presets | - |
| Countdown | Event countdowns | - |
| Quotes | Inspirational quotes | Built-in, JSON, Remote |
| Transit | Real-time transit info | Google Maps, Apple Maps, Citymapper |
| Music | Now playing + controls | Spotify, Apple Music, YouTube, AirPlay |
| Smart Home | Device control | Home Assistant, HomeKit, Google, SmartThings |
| Fitness | Health tracking | Fitbit, Garmin, Apple Health, Strava |
| Packages | Delivery tracking | AfterShip, USPS, FedEx, UPS |
| Network | Network monitoring & speed test | arp-scan, nmap, speedtest-cli |
| Security | Home surveillance | OpenEye (AI-powered cameras) |

---

## Hardware Requirements

### Minimum Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Raspberry Pi** | Pi 3B+ | Pi 4 (4GB) or Pi 5 |
| **RAM** | 2GB | 4GB+ |
| **Storage** | 16GB SD | 32GB+ SD (A2 rated) |
| **Display** | 800×480 | 1920×1080 or higher |
| **Network** | WiFi | Ethernet preferred |

### Display Recommendations

| Use Case | Display Type | Size |
|----------|-------------|------|
| Bathroom mirror | LCD behind two-way mirror | 19-24" |
| Full-length mirror | Large LCD/LED panel | 32-55" |
| Kitchen display | Waterproof LCD | 10-15" |
| Desktop | Monitor with stand | 21-27" |

**Two-Way Mirror Glass:**
- Acrylic: Budget-friendly, lightweight, scratches easily
- Glass: Premium look, heavier, more durable
- Recommended: 70/30 or 80/20 transmission ratio

### Touch Screen Options

| Hardware | Compatibility | Notes |
|----------|--------------|-------|
| Official Raspberry Pi Touch | Excellent | 7", capacitive, plug-and-play |
| HDMI + USB touch overlay | Good | Various sizes, may need calibration |
| IR touch frame | Good | Add to any display, up to 100"+ |
| Capacitive overlay | Fair | Through-glass touch, varies by glass thickness |

### Audio (for Timer/Music)

| Option | Quality | Setup |
|--------|---------|-------|
| HDMI audio | Good | Requires HDMI display with speakers |
| 3.5mm jack | Fair | Built-in on Pi, DAC recommended |
| USB DAC | Excellent | HiFiBerry, IQAudio, etc. |
| Bluetooth | Good | Additional latency |

---

## Compatibility

### Software Requirements

| Software | Version | Required |
|----------|---------|----------|
| Node.js | 18.x+ | Yes |
| npm | 9.x+ | Yes |
| MagicMirror² | 2.32.0+ | Yes |
| Electron | 30+ | For standalone |

### Operating Systems

| OS | Status | Notes |
|----|--------|-------|
| Raspberry Pi OS (64-bit) | ✅ Recommended | Best performance |
| Raspberry Pi OS (32-bit) | ✅ Supported | Some limitations |
| Ubuntu 22.04+ | ✅ Supported | Server or desktop |
| Debian 11+ | ✅ Supported | - |
| macOS 12+ | ✅ Supported | Development |
| Windows 10+ | ⚠️ Limited | WSL2 recommended |
| Docker | ✅ Supported | See Docker setup |

### Browser Compatibility (Server Mode)

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome 90+ | ✅ Full | Recommended |
| Firefox 90+ | ✅ Full | - |
| Safari 15+ | ✅ Full | - |
| Edge 90+ | ✅ Full | - |
| Mobile Chrome | ✅ Full | Touch supported |
| Mobile Safari | ✅ Full | Touch supported |

### Provider API Requirements

| Provider | API Type | Cost | Rate Limits |
|----------|----------|------|-------------|
| **Google Maps** | REST | Pay-per-use ($200 free/mo) | 100 req/sec |
| **Spotify** | REST + OAuth | Free (Premium for control) | 180 req/min |
| **Apple Music** | REST + JWT | $99/yr developer | No published limit |
| **Home Assistant** | WebSocket | Free (self-hosted) | Unlimited |
| **AfterShip** | REST | Free tier (100 tracks/mo) | 10 req/sec |
| **Fitbit** | REST + OAuth | Free | 150 req/hour |
| **USPS** | REST/XML | Free | 5 req/sec |
| **FedEx** | REST + OAuth | Free | 500 req/day |
| **UPS** | REST + OAuth | Free | 100 req/day |

---

## Installation

### 1. Prerequisites

```bash
# Ensure MagicMirror is installed
cd ~/MagicMirror

# Verify Node.js version (18+)
node --version

# Install dependencies
npm install
```

### 2. Enable Custom Modules

The custom modules are included in `modules/default/`. Add them to your `config/config.js`:

```javascript
modules: [
    // ... existing modules ...
    
    {
        module: "timer",
        position: "top_right",
        config: {
            mode: "touch"
        }
    },
    {
        module: "fitness",
        position: "top_right",
        config: {
            provider: "fitbit",
            fitbit: {
                clientId: "YOUR_CLIENT_ID",
                clientSecret: "YOUR_CLIENT_SECRET",
                refreshToken: "YOUR_REFRESH_TOKEN"
            }
        }
    }
]
```

### 3. Provider Dependencies

Some providers require additional setup:

```bash
# For AirPlay/Apple TV control
pip install pyatv

# For Apple Health XML parsing (optional, uses built-in)
npm install fast-xml-parser

# For voice control
# Requires separate voice recognition setup (e.g., MMM-voice)
```

---

## Shared Infrastructure

All custom modules use shared utilities in `modules/shared/`:

| File | Purpose |
|------|---------|
| `baseprovider.js` | Base class for all data providers |
| `utils.js` | Common utility functions |
| `touch-handler.js` | Unified touch gesture handling |
| `voice-handler.js` | Voice command integration |
| `storage.js` | Persistent storage helper |

### Base Provider Pattern

```javascript
// Creating a new provider
const BaseProvider = require("../../shared/baseprovider");

const MyProvider = BaseProvider.extend({
    providerName: "MyProvider",
    
    defaults: {
        apiKey: ""
    },
    
    async fetchData() {
        // Fetch and return data
    }
});
```

---

## Modules

### Timer Module

A customizable countdown timer with sound notifications.

#### Screenshot
```
┌─────────────────────────────────────┐
│              05:00                  │
│       [Start]  [Reset]              │
│   [3m Tea] [7m Eggs] [30m Workout]  │
└─────────────────────────────────────┘
```

#### Configuration

```javascript
{
    module: "timer",
    position: "top_right",
    config: {
        mode: "touch",              // "display", "touch", "voice"
        defaultMinutes: 5,
        showSeconds: true,
        showControls: true,
        sound: "chime.mp3",
        soundVolume: 0.7,
        animateLastMinute: true,
        presets: [
            { name: "Tea", minutes: 3 },
            { name: "Eggs", minutes: 7 },
            { name: "Workout", minutes: 30 }
        ]
    }
}
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | `"display"` | Interaction mode |
| `defaultMinutes` | number | `5` | Default duration |
| `showSeconds` | boolean | `true` | Display seconds |
| `showControls` | boolean | `true` | Show buttons |
| `showPresets` | boolean | `true` | Show preset buttons |
| `presets` | array | `[]` | `{ name, minutes }` objects |
| `sound` | string | `"chime.mp3"` | Sound file in `sounds/` |
| `soundVolume` | number | `0.7` | Volume 0-1 |
| `soundLoop` | boolean | `false` | Loop until dismissed |
| `animateLastMinute` | boolean | `true` | Pulse animation |
| `flashOnComplete` | boolean | `true` | Flash on completion |
| `autoReset` | boolean | `false` | Auto reset after complete |
| `autoResetDelay` | number | `5000` | Reset delay (ms) |

#### Sound Files

Place audio files in `modules/default/timer/sounds/`:
- `chime.mp3` - Default completion sound
- `gentle.mp3` - Subtle notification
- `alarm.mp3` - Persistent alarm

#### Touch Controls

| Gesture | Action |
|---------|--------|
| Tap Start/Pause | Toggle timer |
| Tap Reset | Reset to default |
| Tap preset | Start preset timer |
| Swipe up/down | Adjust ±1 minute |

#### Voice Commands

- "Start timer" / "Stop timer"
- "Set timer for 5 minutes"
- "Pause" / "Reset"

---

### Countdown Module

Display countdowns to events with recurring support.

#### Screenshot
```
┌─────────────────────────────────────┐
│            Upcoming                 │
│  🎄 Christmas     12d 4h 23m        │
│  🥂 New Year      19d 4h 23m        │
│  🎂 Birthday      184 days          │
└─────────────────────────────────────┘
```

#### Configuration

```javascript
{
    module: "countdown",
    position: "top_left",
    header: "Upcoming",
    config: {
        events: [
            {
                name: "Christmas",
                date: "2025-12-25",
                icon: "fa-tree",
                color: "#c41e3a"
            },
            {
                name: "New Year",
                date: "2026-01-01T00:00:00",
                icon: "fa-champagne-glasses"
            },
            {
                name: "Birthday",
                date: "2025-06-15",
                recurring: "yearly"
            }
        ],
        showDays: true,
        showHours: true,
        showMinutes: true,
        showSeconds: false,
        maxEvents: 3,
        hideExpired: true
    }
}
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `events` | array | `[]` | Event objects |
| `showDays` | boolean | `true` | Show days |
| `showHours` | boolean | `true` | Show hours |
| `showMinutes` | boolean | `true` | Show minutes |
| `showSeconds` | boolean | `false` | Show seconds |
| `maxEvents` | number | `5` | Max visible events |
| `hideExpired` | boolean | `true` | Hide past events |
| `showExpiredFor` | number | `86400000` | Show expired (ms) |
| `compact` | boolean | `false` | Compact layout |
| `sortBy` | string | `"date"` | `"date"` or `"name"` |

#### Event Object

```javascript
{
    name: "Event Name",           // Required
    date: "2025-12-25",          // Required (ISO format)
    time: "18:00",               // Optional
    icon: "fa-calendar",         // Font Awesome icon
    color: "#ff0000",            // Accent color
    recurring: "yearly",         // yearly, monthly, weekly, null
    notification: true           // Notify on event day
}
```

---

### Quotes Module

Display inspirational quotes with smooth transitions.

#### Screenshot
```
┌─────────────────────────────────────┐
│  "The only way to do great work     │
│   is to love what you do."          │
│              — Steve Jobs           │
└─────────────────────────────────────┘
```

#### Configuration

```javascript
{
    module: "quotes",
    position: "lower_third",
    config: {
        categories: ["inspirational", "wisdom", "motivation"],
        updateInterval: 30000,
        fadeSpeed: 4000,
        showAuthor: true,
        random: true,
        customQuotes: [
            { text: "Your quote here.", author: "You" }
        ]
    }
}
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `categories` | array | `["inspirational", "wisdom", "motivation", "life"]` | Categories to include |
| `updateInterval` | number | `30000` | Quote change interval (ms) |
| `fadeSpeed` | number | `4000` | Fade transition (ms) |
| `showAuthor` | boolean | `true` | Show attribution |
| `showCategory` | boolean | `false` | Show category label |
| `random` | boolean | `true` | Random order |
| `maxLength` | number | `0` | Max chars (0=unlimited) |
| `textAlign` | string | `"center"` | Alignment |
| `customQuotes` | array | `[]` | Custom quotes |
| `remoteFile` | string | `null` | External JSON URL |
| `excludeWords` | array | `[]` | Filter words |
| `includeAuthors` | array | `[]` | Filter to authors |

#### Built-in Categories

- `inspirational` - Uplifting quotes
- `wisdom` - Philosophical insights
- `motivation` - Encouragement
- `life` - Life lessons
- `humor` - Light-hearted
- `mindfulness` - Presence
- `creativity` - Artistic inspiration
- `perseverance` - Resilience

---

### Transit Module

Real-time transit arrivals and route planning.

#### Screenshot
```
┌─────────────────────────────────────┐
│  🚇 Broadway & 42nd    3 min walk   │
│  ├─ 1  Times Sq         2 min      │
│  ├─ 2  14th St          5 min      │
│  └─ 3  Penn Station     8 min      │
│                                     │
│  📍 To Work: 25 min via A train     │
│  ⚠️ Signal delays on 4/5 lines     │
└─────────────────────────────────────┘
```

#### Configuration

```javascript
{
    module: "transit",
    position: "bottom_left",
    header: "Transit",
    config: {
        provider: "google",
        apiKey: "YOUR_GOOGLE_MAPS_API_KEY",
        
        home: {
            lat: 40.7128,
            lon: -74.0060,
            address: "123 Main St, New York"
        },
        
        stops: [
            {
                id: "stop_123",
                name: "Broadway & 42nd",
                routes: ["1", "2", "3"],
                walkTime: 3
            }
        ],
        
        routes: [
            {
                name: "To Work",
                from: "home",
                to: { lat: 40.7580, lon: -73.9855 },
                mode: "transit"
            }
        ],
        
        showAlerts: true,
        maxArrivals: 5,
        showShareLinks: true
    }
}
```

#### Providers

| Provider | Setup | Features |
|----------|-------|----------|
| **Google Maps** | [Google Cloud Console](https://console.cloud.google.com) → Enable Directions API | Directions, traffic, places |
| **Apple Maps** | Apple Developer → MapKit JS | Directions, ETA, universal links |
| **Citymapper** | [Citymapper API](https://citymapper.com/api) | Real-time arrivals, multi-modal |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | `"google"` | Transit provider |
| `apiKey` | string | `""` | API key |
| `home` | object | `{}` | Home location |
| `stops` | array | `[]` | Stops to monitor |
| `routes` | array | `[]` | Saved routes |
| `showAlerts` | boolean | `true` | Service alerts |
| `maxArrivals` | number | `5` | Per stop |
| `showWalkTime` | boolean | `true` | Walk time to stop |
| `walkingSpeed` | number | `1.4` | Speed (m/s) |
| `showShareLinks` | boolean | `true` | Map app links |
| `timeFormat` | string | `"relative"` | `"relative"`/`"absolute"` |
| `updateInterval` | number | `60000` | Refresh (ms) |

---

### Music Module

Now playing with playback controls.

#### Screenshot
```
┌─────────────────────────────────────┐
│      ┌─────────────────┐           │
│      │   Album Art     │           │
│      └─────────────────┘           │
│      Bohemian Rhapsody              │
│      Queen                          │
│   ▶────────────●───────  3:42/5:55 │
│      ⏮    ▶️    ⏭    🔊            │
└─────────────────────────────────────┘
```

#### Configuration

```javascript
{
    module: "music",
    position: "bottom_right",
    config: {
        provider: "spotify",
        spotify: {
            clientId: "YOUR_CLIENT_ID",
            clientSecret: "YOUR_CLIENT_SECRET",
            refreshToken: "YOUR_REFRESH_TOKEN"
        },
        showAlbumArt: true,
        showProgress: true,
        showControls: true,
        hideWhenIdle: false
    }
}
```

#### Providers

| Provider | Auth | Features | Requirements |
|----------|------|----------|--------------|
| **Spotify** | OAuth 2.0 | Full control | Premium account |
| **Apple Music** | JWT | Library, search | Developer account |
| **YouTube Music** | Cookie/API | Limited | ytmusicapi |
| **AirPlay** | Local | Apple TV/HomePod | pyatv library |

#### Spotify Setup

1. Create app at [developer.spotify.com](https://developer.spotify.com/dashboard)
2. Add redirect: `http://localhost:8080/spotify/callback`
3. Complete OAuth flow to get refresh token

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | `"spotify"` | Music provider |
| `showAlbumArt` | boolean | `true` | Display artwork |
| `albumArtSize` | number | `200` | Art size (px) |
| `showProgress` | boolean | `true` | Progress bar |
| `showControls` | boolean | `true` | Playback controls |
| `showQueue` | boolean | `false` | Up next |
| `hideWhenIdle` | boolean | `false` | Auto-hide |
| `idleTimeout` | number | `300000` | Hide delay (ms) |

#### Touch Controls

| Gesture | Action |
|---------|--------|
| Tap play/pause | Toggle |
| Tap next/prev | Skip |
| Tap progress | Seek |
| Swipe left/right | Skip |
| Long press | Device picker |

---

### Smart Home Module

Control and monitor smart devices.

#### Screenshot
```
┌─────────────────────────────────────┐
│  Living Room                        │
│  ├─ 💡 Ceiling Light      ON  75%  │
│  ├─ 💡 Floor Lamp         OFF      │
│  └─ 🌡️  Temperature       72°F     │
│                                     │
│  Scenes: [Morning] [Movie] [Night]  │
└─────────────────────────────────────┘
```

#### Configuration

```javascript
{
    module: "smarthome",
    position: "middle_center",
    header: "Home",
    config: {
        provider: "homeassistant",
        homeassistant: {
            url: "http://homeassistant.local:8123",
            accessToken: "YOUR_LONG_LIVED_TOKEN",
            entities: [
                "light.living_room",
                "switch.fan",
                "climate.thermostat"
            ]
        },
        showRooms: true,
        showScenes: true,
        scenes: ["Good Morning", "Movie Time", "Bedtime"]
    }
}
```

#### Providers

| Provider | Connection | Setup |
|----------|------------|-------|
| **Home Assistant** | WebSocket | Profile → Long-Lived Token |
| **HomeKit** | Homebridge API | homebridge-config-ui-x |
| **Google Home** | Assistant Relay | [assistant-relay](https://github.com/greghesp/assistant-relay) |
| **SmartThings** | REST API | Personal Access Token |

#### Supported Devices

| Type | Icon | Controls |
|------|------|----------|
| `light` | 💡 | On/Off, Brightness, Color |
| `switch` | 🔌 | On/Off |
| `climate` | 🌡️ | Temperature, Mode |
| `lock` | 🔒 | Lock/Unlock |
| `cover` | 🪟 | Open/Close, Position |
| `fan` | 🌀 | On/Off, Speed |
| `sensor` | 📊 | Display only |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | `"homeassistant"` | Platform |
| `showRooms` | boolean | `true` | Group by room |
| `showScenes` | boolean | `true` | Scene buttons |
| `scenes` | array | `[]` | Scene names |
| `showTemperature` | boolean | `true` | Temp sensors |
| `showHumidity` | boolean | `true` | Humidity sensors |
| `compactMode` | boolean | `false` | Compact layout |
| `columns` | number | `2` | Grid columns |

---

### Fitness Module

Health and activity tracking.

#### Screenshot
```
┌─────────────────────────────────────┐
│          Today's Activity           │
│    ╭───╮     Steps      8,234      │
│   ╱ ╭─╮ ╲    of 10,000             │
│  │ ╱   ╲ │                         │
│   ╲ ╰─╯ ╱    Distance    5.2 km    │
│    ╰───╯     Calories    342 kcal  │
│              Active      28 min    │
└─────────────────────────────────────┘
```

#### Configuration

```javascript
{
    module: "fitness",
    position: "top_right",
    header: "Today's Activity",
    config: {
        provider: "fitbit",
        fitbit: {
            clientId: "YOUR_CLIENT_ID",
            clientSecret: "YOUR_CLIENT_SECRET",
            refreshToken: "YOUR_REFRESH_TOKEN"
        },
        metrics: ["steps", "distance", "calories", "activeMinutes"],
        showGoals: true,
        showRings: true,
        goals: {
            steps: 10000,
            distance: 8,
            calories: 500,
            activeMinutes: 30
        }
    }
}
```

#### Providers

| Provider | Auth | Data |
|----------|------|------|
| **Fitbit** | OAuth 2.0 | Steps, distance, calories, HR, sleep |
| **Garmin** | Email/Pass | Daily summary, sleep, HR |
| **Apple Health** | XML Export | All exported metrics |
| **Strava** | OAuth 2.0 | Activities, estimated steps |

#### Provider Setup

**Fitbit:**
1. [dev.fitbit.com](https://dev.fitbit.com) → Create app
2. Set callback: `http://localhost:8080/fitbit/callback`
3. OAuth flow for refresh token

**Garmin:**
Uses unofficial SSO - provide email/password

**Apple Health:**
1. iPhone → Health → Export All Health Data
2. Extract XML, set `dataPath`

**Strava:**
1. [strava.com/settings/api](https://www.strava.com/settings/api)
2. OAuth flow for refresh token

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | `"fitbit"` | Data source |
| `metrics` | array | `["steps", "distance", "calories", "activeMinutes"]` | Metrics shown |
| `showGoals` | boolean | `true` | Goal progress |
| `showRings` | boolean | `true` | Activity rings |
| `showSleep` | boolean | `false` | Sleep data |
| `showHeartRate` | boolean | `false` | Current HR |
| `showWeekSummary` | boolean | `false` | Weekly chart |
| `compactMode` | boolean | `false` | Compact layout |
| `goals.steps` | number | `10000` | Step goal |
| `goals.distance` | number | `8` | Distance (km) |
| `goals.calories` | number | `500` | Calorie goal |
| `goals.activeMinutes` | number | `30` | Active mins |
| `units.distance` | string | `"km"` | `"km"`/`"mi"` |
| `updateInterval` | number | `300000` | Refresh (5 min) |

---

### Packages Module

Track package deliveries.

#### Screenshot
```
┌─────────────────────────────────────┐
│  📦 New Phone                       │
│     Out for Delivery                │
│     Est. Today by 5pm               │
│     UPS • 1Z999AA10123456784        │
│                                     │
│  📦 Books - In Transit              │
│     Est. Dec 15 • USPS              │
│                                     │
│  ✓ Headphones - Delivered Dec 10   │
└─────────────────────────────────────┘
```

#### Configuration

```javascript
{
    module: "packages",
    position: "bottom_left",
    header: "Packages",
    config: {
        provider: "aftership",
        aftership: {
            apiKey: "YOUR_AFTERSHIP_API_KEY"
        },
        packages: [
            {
                trackingNumber: "1Z999AA10123456784",
                carrier: "ups",
                name: "New Phone"
            },
            {
                trackingNumber: "9400111899223456789012",
                carrier: "usps",
                name: "Books"
            }
        ],
        maxPackages: 5,
        showDelivered: true,
        hideDeliveredAfter: 86400000
    }
}
```

#### Providers

| Provider | Carriers | Setup |
|----------|----------|-------|
| **AfterShip** | 900+ worldwide | [aftership.com](https://www.aftership.com) → API Keys |
| **USPS** | USPS only | [USPS Web Tools](https://www.usps.com/business/web-tools-apis/) |
| **FedEx** | FedEx | [developer.fedex.com](https://developer.fedex.com) |
| **UPS** | UPS | [developer.ups.com](https://developer.ups.com) |

#### Status Icons

| Status | Icon | Description |
|--------|------|-------------|
| Pending | 📋 | Label created |
| In Transit | 📦 | On the way |
| Out for Delivery | 🚚 | Today |
| Delivered | ✓ | Complete |
| Exception | ⚠️ | Problem |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | `"aftership"` | Tracking service |
| `packages` | array | `[]` | Packages to track |
| `maxPackages` | number | `5` | Max displayed |
| `showDelivered` | boolean | `true` | Show delivered |
| `hideDeliveredAfter` | number | `86400000` | Hide after (ms) |
| `showCarrierIcon` | boolean | `true` | Carrier logo |
| `showTrackingNumber` | boolean | `true` | Show tracking # |
| `compact` | boolean | `false` | Compact layout |
| `updateInterval` | number | `900000` | Refresh (15 min) |

---

## Network Module

Monitor your local network with device discovery, speed testing, and connectivity alerts.

### Features

- **Device Discovery**: Scan and list all devices on your network
- **Known Device Tracking**: Mark devices as known to identify intruders
- **Speed Testing**: Periodic download/upload speed measurements
- **Connectivity Monitoring**: Alerts when network goes down
- **Device Type Detection**: Auto-categorizes devices (phone, computer, router, etc.)

### Configuration

```javascript
{
	module: "network",
	position: "bottom_left",
	config: {
		scanInterval: 300000,        // 5 minutes
		speedTestInterval: 3600000,  // 1 hour
		connectivityCheckInterval: 60000,  // 1 minute
		showUnknownDevices: true,
		showKnownDevices: true,
		showSpeedTest: true,
		showConnectivity: true,
		maxDevicesShown: 10,
		knownDevices: [
			// Pre-configure known devices
			{ mac: "AA:BB:CC:DD:EE:FF", name: "Living Room TV" }
		],
		speedThresholds: {
			download: { warning: 10, critical: 5 },  // Mbps
			upload: { warning: 5, critical: 2 }
		}
	}
}
```

### Requirements

For full network scanning, install:

```bash
# Debian/Ubuntu/Raspberry Pi
sudo apt install arp-scan nmap speedtest-cli

# Allow arp-scan without password
sudo visudo
# Add: username ALL=(ALL) NOPASSWD: /usr/sbin/arp-scan
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scanInterval` | number | `300000` | Network scan interval (ms) |
| `speedTestInterval` | number | `3600000` | Speed test interval (ms) |
| `connectivityCheckInterval` | number | `60000` | Ping check interval (ms) |
| `showUnknownDevices` | boolean | `true` | Show new/unknown devices |
| `showKnownDevices` | boolean | `true` | Show known devices |
| `showSpeedTest` | boolean | `true` | Show speed test results |
| `showConnectivity` | boolean | `true` | Show connection status |
| `maxDevicesShown` | number | `10` | Maximum devices displayed |
| `knownDevices` | array | `[]` | Pre-configured known devices |
| `notifyOnNewDevice` | boolean | `true` | Alert on new device |
| `notifyOnNetworkDown` | boolean | `true` | Alert on connection loss |

### Notifications Sent

| Notification | Payload | Description |
|--------------|---------|-------------|
| `NETWORK_STATUS` | `{ online: boolean }` | Connectivity change |
| `NETWORK_NEW_DEVICE` | `{ device: {...} }` | New device detected |
| `NETWORK_SPEED_UPDATE` | `{ download, upload }` | Speed test complete |

---

## Security Module

Integrate with OpenEye AI-powered surveillance system for home security monitoring.

### Features

- **Live Camera Feeds**: MJPEG streams from all cameras
- **Motion Detection**: Real-time motion event alerts
- **Face Recognition**: Known vs unknown face notifications
- **Event Timeline**: Recent security events display
- **WebSocket Updates**: Real-time event streaming

### Prerequisites

1. **Install OpenEye** surveillance system:
   ```bash
   git clone https://github.com/YOUR_USERNAME/OpenEye-OpenCV_Home_Security.git
   cd OpenEye-OpenCV_Home_Security
   docker-compose up -d
   ```

2. **Get JWT Token** from OpenEye authentication

3. **Configure environment**:
   ```bash
   # In MagicMirror .env file
   OPENEYE_HOST=http://localhost:8000
   OPENEYE_TOKEN=your-jwt-token
   ```

### Configuration

```javascript
{
	module: "security",
	position: "middle_center",
	config: {
		openeyeHost: process.env.OPENEYE_HOST || "http://localhost:8000",
		token: process.env.OPENEYE_TOKEN,
		cameras: [],              // Empty = all cameras
		displayMode: "full",      // "full", "compact", "events-only"
		showEvents: true,
		maxEvents: 10,
		useWebSocket: true,
		notifyOnMotion: true,
		notifyOnUnknownFace: true,
		notifyOnKnownFace: false,
		refreshInterval: 60000
	}
}
```

### Display Modes

| Mode | Description |
|------|-------------|
| `"full"` | Camera grid + events list + statistics |
| `"compact"` | Smaller camera thumbnails, no events |
| `"events-only"` | Only show event timeline |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `openeyeHost` | string | `"http://localhost:8000"` | OpenEye API URL |
| `token` | string | `""` | JWT authentication token |
| `cameras` | array | `[]` | Camera IDs (empty = all) |
| `displayMode` | string | `"full"` | Display layout mode |
| `showEvents` | boolean | `true` | Show event timeline |
| `maxEvents` | number | `10` | Maximum events shown |
| `useWebSocket` | boolean | `true` | Use real-time updates |
| `notifyOnMotion` | boolean | `true` | Alert on motion |
| `notifyOnUnknownFace` | boolean | `true` | Alert on unknown face |
| `notifyOnKnownFace` | boolean | `false` | Alert on known face |
| `refreshInterval` | number | `60000` | API refresh interval |

### Event Types

| Event | Icon | Description |
|-------|------|-------------|
| Motion Detected | 🔔 | Movement in camera view |
| Known Face | 👤 | Recognized person |
| Unknown Face | ⚠️ | Unrecognized person |
| Recording Started | 🔴 | Camera began recording |

### API Integration

The module connects to OpenEye's REST API and WebSocket:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cameras/` | GET | List all cameras |
| `/api/cameras/{id}/stream` | GET | MJPEG video stream |
| `/api/motion-events/` | GET | Motion event history |
| `/api/face-history/` | GET | Face detection history |
| `/api/ws/statistics` | WS | Real-time event stream |

---

## Interaction Modes

All modules support three interaction modes via the `mode` config option:

### Display Mode (`"display"`)
- Read-only presentation
- No user interaction
- Best for ambient/glanceable displays

### Touch Mode (`"touch"`)
- Tap, swipe, and long-press gestures
- Interactive controls
- Requires touch-capable display

### Voice Mode (`"voice"`)
- Voice command integration
- Requires voice recognition module (e.g., MMM-voice)
- Natural language commands

### Touch Gestures (Common)

| Gesture | Action |
|---------|--------|
| Tap | Primary action (toggle, select) |
| Double tap | Secondary action |
| Long press | Context menu / details |
| Swipe left/right | Navigate / dismiss |
| Swipe up/down | Adjust values |

### Voice Commands (Common)

| Command | Action |
|---------|--------|
| "Show [module]" | Focus module |
| "Hide [module]" | Minimize |
| "Refresh [module]" | Force update |

---

## Theming & Customization

### CSS Variables

All modules support CSS customization via variables:

```css
/* Custom theme in css/custom.css */
:root {
    /* Timer */
    --timer-text: #ffffff;
    --timer-warning: #ffc107;
    --timer-complete: #28a745;
    
    /* Fitness */
    --fitness-ring-move: #fa114f;
    --fitness-ring-exercise: #92e82a;
    --fitness-ring-stand: #1eeaef;
    
    /* Music */
    --music-accent: #1db954;
    --music-progress-bg: rgba(255, 255, 255, 0.2);
    
    /* Smart Home */
    --smarthome-on: #ffd60a;
    --smarthome-off: #6c757d;
    
    /* Packages */
    --packages-transit: #17a2b8;
    --packages-delivery: #ffc107;
    --packages-delivered: #28a745;
}
```

### Module Sizing

```css
/* Compact fitness display */
.fitness.compact {
    max-width: 200px;
}

/* Larger music artwork */
.music .album-art {
    width: 250px;
    height: 250px;
}
```

---

## Troubleshooting

### Common Issues

#### Module Not Loading
```bash
# Check console for errors
npm start dev

# Verify module in config
grep -A5 "module:" config/config.js
```

#### Provider Authentication Failed
- Verify API keys are correct
- Check token expiration
- Confirm OAuth redirect URLs match
- Review rate limits

#### Touch Not Working
```bash
# Test touch input
evtest /dev/input/event0

# Check X11 input
xinput list
```

#### No Sound (Timer)
```bash
# Test audio
aplay /usr/share/sounds/alsa/Front_Center.wav

# Check ALSA config
alsamixer
```

### Debug Mode

Enable verbose logging:

```javascript
// config.js
logLevel: ["INFO", "LOG", "WARN", "ERROR", "DEBUG"],
```

### Provider-Specific Issues

| Provider | Common Issue | Solution |
|----------|--------------|----------|
| Spotify | Token expired | Re-run OAuth flow |
| Fitbit | Rate limited | Increase updateInterval |
| Home Assistant | Connection refused | Check WebSocket URL |
| AfterShip | Carrier not detected | Specify carrier manually |

### Performance Optimization

```javascript
// Reduce update frequency for slow networks
{
    module: "transit",
    config: {
        updateInterval: 120000  // 2 minutes instead of 1
    }
}
```

### Log Locations

```bash
# MagicMirror logs
~/.pm2/logs/MagicMirror-out.log
~/.pm2/logs/MagicMirror-error.log

# System logs
journalctl -u magicmirror
```

---

## Support

- **Issues**: GitHub Issues
- **Documentation**: This guide + inline JSDoc
- **Sample Config**: `config/config.custom.sample.js`

---

*Last updated: December 2024*
*MagicMirror² v2.32.0+*
