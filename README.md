# ![MagicMirror²: The open source modular smart mirror platform.](.github/header.png)

<p style="text-align: center">
  <a href="https://choosealicense.com/licenses/mit">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
 </a>
 <img src="https://img.shields.io/github/actions/workflow/status/magicmirrororg/magicmirror/automated-tests.yaml" alt="GitHub Actions">
 <img src="https://img.shields.io/github/check-runs/magicmirrororg/magicmirror/master" alt="Build Status">
 <a href="https://github.com/MagicMirrorOrg/MagicMirror">
  <img src="https://img.shields.io/github/stars/magicmirrororg/magicmirror?style=social" alt="GitHub Stars">
 </a>
</p>

**MagicMirror²** is an open source modular smart mirror platform. With a growing list of installable modules, the **MagicMirror²** allows you to convert your hallway or bathroom mirror into your personal assistant. **MagicMirror²** is built by the creator of [the original MagicMirror](https://michaelteeuw.nl/tagged/magicmirror) with the incredible help of a [growing community of contributors](https://github.com/MagicMirrorOrg/MagicMirror/graphs/contributors).

MagicMirror² focuses on a modular plugin system and uses [Electron](https://www.electronjs.org/) as an application wrapper. So no more web server or browser installs necessary!

## Documentation

For the full documentation including **[installation instructions](https://docs.magicmirror.builders/getting-started/installation.html)**, please visit our dedicated documentation website: [https://docs.magicmirror.builders](https://docs.magicmirror.builders).

## Optional Dependencies

The custom modules work out of the box, but some features require additional software for full functionality. **The application will not crash or cause issues if these are missing** — it gracefully falls back to simpler methods.

### Network Module Dependencies

| Dependency | Required | Purpose | Fallback Behavior |
|------------|----------|---------|-------------------|
| `arp-scan` | Optional | Fast, accurate network device discovery | Falls back to `nmap` or `arp` |
| `nmap` | Optional | Secondary network scanning method | Falls back to built-in `arp` command |
| `speedtest-cli` | Optional | Accurate internet speed testing | Uses simple download test |

**Installation (Debian/Ubuntu/Raspberry Pi):**
```bash
# Full network monitoring capabilities
sudo apt install arp-scan nmap speedtest-cli

# Allow arp-scan without password (optional, for better scanning)
sudo visudo
# Add: username ALL=(ALL) NOPASSWD: /usr/sbin/arp-scan
```

### Security Module Dependencies

| Dependency | Required | Purpose |
|------------|----------|---------|
| [OpenEye](https://github.com/M1K31/OpenEye-OpenCV_Home_Security) | Required | AI-powered surveillance backend |
| Docker & Docker Compose | Recommended | Easy OpenEye deployment |

**Without OpenEye:** The Security module will show "Connecting..." and retry periodically. No errors or memory issues will occur.

### Custom Modules

This fork includes additional custom modules with Apple HIG design principles:

| Module | Description |
|--------|-------------|
| Timer | Countdown timer with presets and sounds |
| Countdown | Event countdowns with recurring support |
| Quotes | Inspirational quotes with categories |
| Transit | Real-time transit (Google/Apple/Citymapper) |
| Music | Now playing + controls (Spotify/Apple Music) |
| Smart Home | Device control (Home Assistant/HomeKit) |
| Fitness | Health tracking (Fitbit/Garmin/Strava) |
| Packages | Delivery tracking (AfterShip/USPS/FedEx/UPS) |
| Network | Device discovery, speed test, connectivity monitor |
| Security | OpenEye AI surveillance integration |

📖 **[Full Custom Modules Documentation](docs/CUSTOM_MODULES.md)** - Hardware requirements, provider setup, configuration options, and troubleshooting.

### 🏠 Smart Home Security Ecosystem

This MagicMirror fork is designed to work seamlessly with **[OpenEye](https://github.com/M1K31/OpenEye-OpenCV_Home_Security)** — an AI-powered home surveillance system. Together, they provide an intuitive interface for securing, monitoring, and controlling your smart home.

**OpenEye Features:**
- 🎥 Multi-camera support (USB, IP, RTSP)
- 🧠 AI-powered face recognition
- 🔔 Motion detection with configurable zones
- 📹 Continuous and event-based recording
- 🌐 Real-time WebSocket updates

**MagicMirror Integration:**
- Live camera feeds displayed on your mirror
- Real-time motion and face detection alerts
- Event timeline with recent security activity
- Seamless notification system

#### Quick Setup

```bash
# 1. Clone and start OpenEye
git clone https://github.com/M1K31/OpenEye-OpenCV_Home_Security.git
cd OpenEye-OpenCV_Home_Security
docker-compose up -d

# 2. Configure MagicMirror (in .env file)
OPENEYE_HOST=http://localhost:8000
OPENEYE_TOKEN=your-jwt-token

# 3. Add security module to config/config.js
# (Already included in default config)
```

See the [Security Module Documentation](docs/CUSTOM_MODULES.md#security-module) for full configuration options.

### For Developers

📖 **[Contributing Guide](CONTRIBUTING.md)** - Development setup, module creation, testing, and code style.

📖 **[CLAUDE.md](CLAUDE.md)** - AI assistant context for automated development.

## Links

- Website: [https://magicmirror.builders](https://magicmirror.builders)
- Documentation: [https://docs.magicmirror.builders](https://docs.magicmirror.builders)
- Forum: [https://forum.magicmirror.builders](https://forum.magicmirror.builders)
  - Technical discussions: <https://forum.magicmirror.builders/category/11/core-system>
- Discord: [https://discord.gg/J5BAtvx](https://discord.gg/J5BAtvx)
- Blog: [https://michaelteeuw.nl/tagged/magicmirror](https://michaelteeuw.nl/tagged/magicmirror)
- Donations: [https://magicmirror.builders/#donate](https://magicmirror.builders/#donate)

## Contributing Guidelines

Contributions of all kinds are welcome, not only in the form of code but also with regards to

- bug reports
- documentation
- translations

For the full contribution guidelines, check out: [https://docs.magicmirror.builders/about/contributing.html](https://docs.magicmirror.builders/about/contributing.html)

## Enjoying MagicMirror? Consider a donation!

MagicMirror² is Open Source and free. That doesn't mean we don't need any money.

Please consider a donation to help us cover the ongoing costs like webservers and email services.
If we receive enough donations we might even be able to free up some working hours and spend some extra time improving the MagicMirror² core.

To donate, please follow [this](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=G5D8E9MR5DTD2&source=url) link.

<p style="text-align: center">
  <a href="https://forum.magicmirror.builders/topic/728/magicmirror-is-voted-number-1-in-the-magpi-top-50"><img src="https://magicmirror.builders/img/magpi-best-watermark-custom.png" width="150" alt="MagPi Top 50"></a>
</p>
