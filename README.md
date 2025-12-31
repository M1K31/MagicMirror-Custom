# MagicMirror³

**The Next Generation Smart Mirror Platform**

<!-- 
  Copyright (c) 2025 Mikel Smart
  This file is part of MagicMirror³.
  Based on MagicMirror² by Michael Teeuw and contributors.
-->

<p style="text-align: center">
  <a href="https://choosealicense.com/licenses/mit">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
  <a href="https://github.com/M1K31/MagicMirror-Custom">
    <img src="https://img.shields.io/github/stars/M1K31/MagicMirror-Custom?style=social" alt="GitHub Stars">
  </a>
</p>

**MagicMirror³** is an enhanced smart mirror platform with AI integration, mobile companion apps, and smart home security features. Based on the original MagicMirror² by Michael Teeuw.

## ✨ What's New in This Fork

| Feature | Description |
|---------|-------------|
| 🤖 **AI Assistant** | Natural language control via OpenAI, Claude, or local LLMs |
| 📱 **Mobile Apps** | Native iOS (SwiftUI) and Android (Jetpack Compose) companion apps |
| 🔐 **REST API** | Secure API for remote control with token authentication |
| 🛡️ **Security Integration** | OpenEye AI surveillance system integration |
| 📊 **Events Dashboard** | Motion, face detection, and recording counts from OpenEye |
| 🌐 **Network Monitor** | Device discovery with summary mode, speed tests |
| 🎤 **Voice Control** | Browser-based speech recognition with wake word |

---

## 📋 Table of Contents

- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [AI Assistant](#-ai-assistant)
- [Mobile Companion Apps](#-mobile-companion-apps)
- [Custom Modules](#-custom-modules)
- [REST API](#-rest-api)
- [Hardware Requirements](#-hardware-requirements)
- [Uninstallation](#-uninstallation)
- [Contributing](#-contributing)
- [Links](#links)

---

## 🖥️ Hardware Requirements

### Minimum Requirements

These are the bare minimum specs to run MagicMirror³ in server mode:

| Component | Minimum Spec |
|-----------|--------------|
| **CPU** | Single-core 1GHz ARM or x86 |
| **RAM** | 512MB |
| **Storage** | 4GB SD card / drive |
| **Display** | Any HDMI/composite display |
| **Network** | Ethernet or WiFi |
| **OS** | Raspberry Pi OS Lite, Debian, Ubuntu |

> ⚠️ Minimum specs will run basic modules but may struggle with AI, video, or multiple animated modules.

---

### Recommended Hardware

For a smooth experience with most modules enabled:

| Component | Recommended Spec |
|-----------|------------------|
| **CPU** | Quad-core 1.5GHz+ (ARM Cortex-A72 or better) |
| **RAM** | 2GB+ |
| **Storage** | 16GB+ SD card (Class 10 / A1) |
| **Display** | 1080p monitor or TV |
| **Network** | WiFi 5 (802.11ac) or Gigabit Ethernet |
| **OS** | Raspberry Pi OS (64-bit), Debian 12+, Ubuntu 22.04+ |

**Recommended Devices:**
- 🥧 **Raspberry Pi 4 (2GB)** - Best balance of cost and performance
- 🥧 **Raspberry Pi 3B+** - Budget option, handles basic modules well
- 💻 **Intel NUC / Mini PC** - For power users, runs Electron smoothly

---

### Optimal Hardware (Full Features)

For the complete MagicMirror³ experience including AI, voice, video, and ecosystem integration:

| Component | Optimal Spec |
|-----------|--------------|
| **CPU** | Quad-core 2.0GHz+ or x86 multi-core |
| **RAM** | 4GB+ (8GB for local AI models) |
| **Storage** | 32GB+ fast SD (A2) or SSD |
| **Display** | 1080p+ IPS panel (for wide viewing angles) |
| **Audio** | USB microphone + speakers for voice control |
| **Network** | WiFi 6 or Gigabit Ethernet |
| **Camera** | USB webcam (optional, for face recognition) |

**Optimal Devices:**
- 🥧 **Raspberry Pi 5 (8GB)** - Latest Pi, handles everything including light AI
- 🥧 **Raspberry Pi 4 (4GB/8GB)** - Excellent all-rounder
- 💻 **Intel NUC / Beelink Mini** - Best for local LLM (Ollama)
- 💻 **Old Laptop/Desktop** - Repurpose with Linux for powerful mirror
- 🖥️ **Thin Client PC** - HP/Dell thin clients are cheap and capable

---

### Display Recommendations

| Type | Size | Use Case | Notes |
|------|------|----------|-------|
| **Computer Monitor** | 24-27" | Desktop/wall mount | Best image quality, VESA mounting |
| **Smart TV** | 32-43" | Large wall mirror | Wide viewing, built-in speakers |
| **LCD Panel** | 15-21" | Embedded mirror | Fits behind two-way mirror glass |
| **Touch Display** | 7-10" | Countertop/tablet style | Raspberry Pi Touch Display works great |

**Two-Way Mirror Glass:**
- **Acrylic** - Lightweight, affordable, scratches easily
- **Glass** - Heavier, premium look, 70/30 or 80/20 reflectivity recommended

---

### 🎤 Microphone Recommendations

For voice control and AI assistant features:

| Type | Product Examples | Best For | Price Range |
|------|------------------|----------|-------------|
| **USB Speakerphone** | Jabra Speak 410/510, Anker PowerConf | All-in-one solution, great pickup | $50-150 |
| **USB Conference Mic** | Blue Snowball, Fifine K669 | Budget voice commands | $20-50 |
| **Array Microphone** | ReSpeaker 4-Mic Array, Matrix Voice | Far-field, wake word detection | $30-80 |
| **Lapel/Clip Mic** | Boya BY-M1, Rode Lavalier | Close-range, minimal echo | $15-30 |
| **Built-in (Webcam)** | Logitech C920/C922 | Dual-purpose with camera | $70-100 |

**Recommended Picks:**

- 🏆 **Best Overall:** ReSpeaker 4-Mic Array for Raspberry Pi
  - 4 far-field microphones with LED ring
  - Designed for wake word detection
  - Works great with voice assistants
  
- 💰 **Budget Pick:** Fifine K669B USB Microphone (~$25)
  - Plug and play USB
  - Decent voice pickup for commands
  
- 🎯 **Best for Mirror Builds:** Jabra Speak 410 (~$80 refurbished)
  - Omnidirectional pickup
  - Built-in speaker for responses
  - Flat design hides behind mirror frame

**Placement Tips:**
- Mount microphone at face height or above display
- Avoid placing behind two-way glass (blocks sound)
- Use a small hole or slot in mirror frame for mic
- Consider a separate speaker if using dedicated mic

---

### 📷 Camera Recommendations

For face recognition, presence detection, and OpenEye integration:

| Type | Product Examples | Resolution | Best For | Price Range |
|------|------------------|------------|----------|-------------|
| **USB Webcam** | Logitech C920/C922, Razer Kiyo | 1080p | Face recognition, video calls | $50-100 |
| **Wide-Angle Webcam** | Logitech StreamCam, Anker C300 | 1080p 78°+ | Room presence detection | $60-130 |
| **Raspberry Pi Camera** | Pi Camera Module 3, Pi HQ Camera | 12MP | Embedded builds, low latency | $25-60 |
| **IR Night Vision** | ELP USB IR Camera, Pi NoIR Camera | 1080p | Low light, 24/7 monitoring | $30-80 |
| **PTZ Camera** | Wyze Cam, TP-Link Tapo | 1080p+ | Separate security camera | $25-50 |

**Recommended Picks:**

- 🏆 **Best for Face Recognition:** Logitech C920/C922 HD Pro
  - Excellent low-light performance
  - Wide 78° field of view
  - Reliable Linux support
  - Built-in microphone (backup audio)
  
- 🥧 **Best for Raspberry Pi:** Pi Camera Module 3 Wide
  - Native CSI connection (low latency)
  - 120° ultra-wide angle
  - Autofocus, HDR support
  - Small form factor for mirror builds
  
- 🌙 **Best for 24/7 Monitoring:** ELP 1080P IR USB Camera (~$40)
  - Infrared LEDs for night vision
  - Works in complete darkness
  - USB plug-and-play
  
- 💰 **Budget Pick:** Logitech C270 (~$20)
  - Basic 720p, works for presence detection
  - Good for testing before upgrading

**Camera Placement for Smart Mirror:**

```
┌─────────────────────────────┐
│    ┌───┐   ← Camera        │
│    └───┘     (top center)  │
│                             │
│    ┌─────────────────┐      │
│    │                 │      │
│    │     Display     │      │
│    │                 │      │
│    └─────────────────┘      │
│                             │
│    ○ ← Microphone           │
│        (bottom, angled up)  │
└─────────────────────────────┘
```

**Integration with OpenEye:**

| Feature | Camera Requirement | Notes |
|---------|-------------------|-------|
| Face Recognition | 720p+, good low-light | C920 or Pi Cam 3 recommended |
| Motion Detection | Any resolution | Even 480p works |
| Person Detection | 720p+ | Higher res = better accuracy |
| Package Detection | 1080p wide-angle | Needs to see porch/entrance |
| Night Monitoring | IR camera required | Pi NoIR or USB IR camera |

> 💡 **Tip:** For mirror builds, cut a small hole in the two-way glass for the camera lens. Acrylic is easier to drill than glass.

---

### Power Considerations

| Setup | Power Draw | Recommended PSU |
|-------|------------|-----------------|
| Pi 3B + Monitor | ~15W total | 5V 2.5A for Pi |
| Pi 4 + Monitor | ~20W total | 5V 3A (official PSU) |
| Pi 5 + Monitor | ~25W total | 5V 5A (27W USB-C PD) |
| Mini PC + Monitor | ~40-60W | Built-in PSU |

> 💡 **Tip:** Use a quality power supply! Undervoltage causes instability and SD card corruption.

---

### AI Feature Requirements

| Feature | Minimum | Recommended |
|---------|---------|-------------|
| **Cloud AI** (OpenAI/Claude) | 512MB RAM, any CPU | 1GB RAM |
| **Local LLM** (Ollama) | 4GB RAM, quad-core | 8GB RAM, SSD storage |
| **Voice Recognition** | USB microphone | USB mic + speakers |
| **Face Recognition** | 2GB RAM | 4GB RAM + USB camera |

---

## 🚀 Installation

### Prerequisites

- **Node.js** v22.14.0 or higher
- **npm** v10.0.0 or higher
- **Git**

### Step 1: Clone the Repository

```bash
git clone https://github.com/M1K31/MagicMirror-Custom.git
cd MagicMirror-Custom
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Create Configuration

```bash
cp config/config.js.sample config/config.js
```

### Step 4: (Optional) Install Network Monitoring Tools

```bash
# For full network monitoring capabilities (Debian/Ubuntu/Raspberry Pi)
sudo apt install arp-scan nmap speedtest-cli

# Allow arp-scan without password (optional)
sudo visudo
# Add: username ALL=(ALL) NOPASSWD: /usr/sbin/arp-scan
```

### Step 5: Start MagicMirror

```bash
# For desktop/Electron mode
npm start

# For server-only mode (headless, access via browser)
npm run server
```

---

## ⚡ Quick Start

1. **Access the mirror** at `http://localhost:8080` (server mode) or via the Electron window
2. **Click the gear icon** (⚙️) in the top-right to open Settings
3. **Go to the About tab** to find your API token for mobile apps
4. **Click the robot icon** (🤖) in the bottom-right to open the AI Assistant

---

## ⚙️ Configuration

### Main Configuration (`config/config.js`)

```javascript
let config = {
  address: "localhost",
  port: 8080,
  
  // REST API Configuration
  api: {
    enabled: true,
    prefix: "/api/v1",
    // token: "your-custom-token"  // Optional: auto-generated if not set
  },

  modules: [
    // AI Assistant
    {
      module: "ai",
      position: "bottom_right",
      config: {
        provider: "openai",  // "openai", "anthropic", "ollama", "local"
        enableVoice: true,
        wakeWord: "mirror"
      }
    },
    // ... other modules
  ]
};
```

### AI API Keys (`config/secrets.json`)

Create this file to store your AI provider API keys:

```json
{
  "openai_api_key": "sk-your-openai-api-key",
  "anthropic_api_key": "sk-ant-your-anthropic-key"
}
```

> ⚠️ **Security Note:** The `secrets.json` file is in `.gitignore` and should never be committed.

### Environment Variables

```bash
# Optional: Set via environment instead of config file
export MM_PORT=8080
export OPENEYE_HOST=http://localhost:8000
export OPENEYE_TOKEN=your-jwt-token
```

---

## 🤖 AI Assistant

The built-in AI Assistant provides natural language control of your mirror.

### Supported Providers

| Provider | Model | Requirements |
|----------|-------|--------------|
| **OpenAI** | GPT-4, GPT-3.5 | API key in secrets.json |
| **Anthropic** | Claude 3.5 Sonnet | API key in secrets.json |
| **Ollama** | Llama 3.2, Mistral, etc. | Local Ollama installation |
| **Local LLM** | Any OpenAI-compatible | Local server running |

### Using Ollama (Free, Local)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Download a model
ollama pull llama3.2

# Start Ollama server
ollama serve
```

Then set `provider: "ollama"` in your config.

### 🎤 Voice Control

MagicMirror³ includes **built-in voice commands that work without any AI API key**. These commands are processed locally using the Web Speech API.

**Wake Word:** Say "MagicMirror" followed by your command.

#### Quick Examples

| Category | Example Commands |
|----------|------------------|
| **Modules** | "Turn on weather", "Turn off news", "Show calendar" |
| **Calendar** | "Add event on August 28th for doctor's appointment" |
| **Camera** | "Show me the front door camera", "Show all cameras" |
| **Smart Home** | "Turn on living room lights", "Set thermostat to 72" |
| **Music** | "Play music", "Next song", "Volume 50" |
| **Packages** | "Track package 1Z999AA10123456784", "My packages" |
| **Weather** | "Weather in New York", "Add location Chicago" |
| **Display** | "Brightness 50", "Night mode", "Screen off" |
| **Timer** | "Set timer for 5 minutes", "Set alarm for 7 AM" |
| **Routines** | "Good morning", "Good night" |

> See voice command examples above for available built-in commands

#### AI-Powered Commands

When an AI provider is configured, you can use natural language for complex requests:

- "What's the weather like this week?"
- "Summarize today's news"
- "What meetings do I have tomorrow?"
- "Turn on the lights and set the temperature to 70"

---

## 📱 Mobile Companion Apps

Control your MagicMirror from native mobile apps.

### Setup

1. Open MagicMirror in your browser
2. Click the **Settings** gear icon
3. Go to the **About** tab
4. Copy the **Server Address** and **API Token**
5. Enter these in your mobile app

### iOS App (SwiftUI)

**Requirements:** iOS 16.0+, Xcode 15+

```bash
cd mobile/ios/MagicMirror
open MagicMirror.xcodeproj
# Build and run on simulator or device
```

### Android App (Jetpack Compose)

**Requirements:** Android 8.0+ (API 26+), Android Studio

```bash
cd mobile/android
# Open in Android Studio and run
```

### Features

- 📊 Dashboard with status overview
- 🎛️ Show/hide/refresh modules
- 🔆 Brightness and zoom controls
- 🤖 AI assistant chat
- ⚙️ Service configuration
- 🔄 System restart/shutdown

📖 See [Mobile Apps Documentation](mobile/README.md) for details.

---

## 🧩 Custom Modules

This fork includes additional modules:

| Module | Description |
|--------|-------------|
| **AI** | AI assistant with voice control |
| **Settings** | Configuration UI with service management |
| **Network** | Device discovery, speed test, connectivity |
| **Security** | OpenEye AI surveillance integration |
| **Timer** | Countdown timer with presets |
| **Countdown** | Event countdowns |
| **Quotes** | Inspirational quotes |
| **Transit** | Real-time public transit |
| **Music** | Now playing (Spotify/Apple Music) |
| **Smart Home** | Home Assistant integration |
| **Fitness** | Health tracking |
| **Packages** | Delivery tracking |

### Optional Dependencies

| Tool | Purpose | Installation |
|------|---------|--------------|
| `arp-scan` | Network device discovery | `sudo apt install arp-scan` |
| `nmap` | Network scanning | `sudo apt install nmap` |
| `speedtest-cli` | Speed testing | `sudo apt install speedtest-cli` |
| [OpenEye](https://github.com/M1K31/OpenEye-OpenCV_Home_Security) | AI surveillance | Docker recommended |

See module configurations in `config/config.js.sample` for detailed options.

---

## 🔌 REST API

The REST API enables remote control from mobile apps and other clients.

### Authentication

All API requests (except `/health`) require a Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/api/v1/modules
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check (no auth) |
| GET | `/api/v1/modules` | List all modules |
| POST | `/api/v1/modules/:id/show` | Show a module |
| POST | `/api/v1/modules/:id/hide` | Hide a module |
| GET | `/api/v1/display` | Get display settings |
| POST | `/api/v1/display` | Update display settings |

See `js/api/` for API implementation details.

---

## 🗑️ Uninstallation

### Complete Removal

```bash
# Stop any running instances
pkill -f "node.*magicmirror" 2>/dev/null

# Remove the directory
cd ..
rm -rf MagicMirror-Custom
```

### Remove from PM2 (if using)

```bash
pm2 delete MagicMirror
pm2 save
```

### Remove Configuration Only

To start fresh while keeping the application:

```bash
rm -rf config/config.js config/secrets.json config/.api_token
cp config/config.js.sample config/config.js
```

---

## 🎮 Input Methods

| Input | Features |
|-------|----------|
| **Touch** | Swipe, tap, double-tap, long-press |
| **Voice** | Wake word + natural language |
| **Keyboard** | F5 (refresh), Escape, Ctrl+S (settings) |
| **Mouse** | Full click and hover support |
| **Mobile** | Companion app control |

---

## 🏠 Smart Home Ecosystem

This fork integrates with **[OpenEye](https://github.com/M1K31/OpenEye-OpenCV_Home_Security)** for AI-powered home surveillance.

```bash
# Quick setup
git clone https://github.com/M1K31/OpenEye-OpenCV_Home_Security.git
cd OpenEye-OpenCV_Home_Security
docker-compose up -d
```

See `modules/default/security/` for Security module configuration.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Follow existing code style
4. Submit a pull request

## 📚 Resources

- **[Original MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror)** - The project this fork is based on
- **[MagicMirror Forum](https://forum.magicmirror.builders)** - Community discussions
- **[OpenEye Security](https://github.com/M1K31/OpenEye-OpenCV_Home_Security)** - AI surveillance integration

---

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.

Based on MagicMirror² by Michael Teeuw and contributors.

---

<p style="text-align: center">
  <em>Maintained with help from Claude</em>
</p>

<p style="text-align: center">
  <img src=".github/logo.png" width="300" alt="MagicMirror³ Logo">
</p>
