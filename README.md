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
| 🌐 **Network Monitor** | Device discovery, speed tests, connectivity monitoring |
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
- [Uninstallation](#-uninstallation)
- [Contributing](#-contributing)
- [Links](#links)

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

### Voice Commands

- Say **"Mirror"** (wake word) to activate
- Example: "Mirror, what's the weather today?"
- Example: "Mirror, hide the calendar"
- Example: "Mirror, show all modules"

### Available Commands

| Command | Action |
|---------|--------|
| "Show [module]" | Makes a module visible |
| "Hide [module]" | Hides a module |
| "Refresh [module]" | Refreshes module data |
| "Set brightness to X%" | Adjusts display brightness |
| "What's the weather?" | Reads weather information |

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

📖 **[Full Modules Documentation](docs/CUSTOM_MODULES.md)**

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

📖 **[Full API Documentation](docs/API.md)**  
📖 **[Authentication Guide](docs/AUTHENTICATION.md)**

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

📖 **[Security Module Documentation](docs/CUSTOM_MODULES.md#security-module)**

---

## 🤝 Contributing

Contributions welcome! See:

- 📖 **[Contributing Guide](CONTRIBUTING.md)** - Development setup
- 📖 **[TODO.md](TODO.md)** - Feature roadmap

## 📚 Resources

- **[Original MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror)** - The project this fork is based on
- **[MagicMirror Forum](https://forum.magicmirror.builders)** - Community discussions
- **[OpenEye Security](https://github.com/M1K31/OpenEye-OpenCV_Home_Security)** - AI surveillance integration

---

## 📜 License

MIT License - See [LICENSE.md](LICENSE.md) for details.

Based on MagicMirror² by Michael Teeuw and contributors.

---

<p style="text-align: center">
  <em>Maintained with help from Claude</em>
</p>

<p style="text-align: center">
  <img src=".github/logo.png" width="300" alt="MagicMirror³ Logo">
</p>
