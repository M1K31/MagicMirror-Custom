# MagicMirror-Custom TODO

<!-- 
  Copyright (c) 2025 Mikel Smart
  This file is part of MagicMirror-Custom.
-->

Feature roadmap and planned improvements for MagicMirror-Custom.

## 🎯 High Priority

### AI Assistant Enhancements
- [ ] Add QR code generation for companion app setup (use qrcode library)
- [ ] Implement streaming responses for faster perceived response times
- [ ] Add conversation memory/context persistence across sessions
- [ ] Add more action types (play music, set reminders, control smart home)
- [ ] Integrate with Home Assistant for voice-controlled smart home
- [ ] Add wake word detection using WebRTC VAD (Voice Activity Detection)

### Mobile Companion Apps
- [ ] Build and test iOS app on physical device
- [ ] Build and test Android app on physical device
- [ ] Implement QR code scanner for easy setup
- [ ] Add biometric authentication (Face ID, Touch ID, fingerprint)
- [ ] Implement encrypted token storage (Keychain, EncryptedSharedPreferences)
- [ ] Add widget support for quick module control
- [ ] Add push notifications for mirror alerts
- [ ] Publish to App Store and Google Play

### Security Module
- [ ] Add live camera stream support (HLS/WebRTC)
- [ ] Implement face recognition gallery view
- [ ] Add camera PTZ (pan-tilt-zoom) controls
- [ ] Add recording playback interface
- [ ] Integrate with HomeKit Secure Video

## 🔧 Medium Priority

### Core Improvements
- [ ] Add multi-mirror support (manage multiple MagicMirrors from one app)
- [ ] Implement user profiles with different configurations
- [ ] Add scheduled module visibility (show calendar only in morning)
- [ ] Add power scheduling (screen on/off times)
- [ ] Implement proper secrets management (encrypted config)

### Module Enhancements
- [ ] Calendar: Add Google Calendar OAuth flow in settings
- [ ] Weather: Add weather alerts and severe weather notifications
- [ ] Newsfeed: Add article summarization using AI
- [ ] Music: Implement Spotify OAuth flow in settings
- [ ] Smart Home: Add device discovery for Home Assistant
- [ ] Network: Add network topology visualization
- [ ] Fitness: Implement Fitbit/Garmin OAuth flow

### UI/UX Improvements
- [ ] Add theme system (dark, light, custom colors)
- [ ] Implement module drag-and-drop positioning
- [ ] Add transition animations between states
- [ ] Add accessibility features (high contrast, large text)
- [ ] Add screen burn-in protection (subtle animation)

## 📋 Low Priority

### Developer Experience
- [ ] Add comprehensive unit tests for all modules
- [ ] Add e2e tests for companion apps
- [ ] Create module development starter template
- [ ] Add hot module reload for faster development
- [ ] Create VS Code extension for module development

### Documentation
- [ ] Add video tutorials for setup
- [ ] Create module development guide
- [ ] Add API examples for all endpoints
- [ ] Create troubleshooting FAQ
- [ ] Add hardware build guide (frame, display, Raspberry Pi setup)

### Integrations
- [ ] Add Alexa skill for voice control
- [ ] Add Google Assistant integration
- [ ] Add Siri Shortcuts support
- [ ] Add IFTTT applets
- [ ] Add Zapier integration
- [ ] Add MQTT support for IoT devices

## ✅ Completed

### v2.32.0-custom
- [x] REST API for mobile apps
- [x] iOS companion app (SwiftUI)
- [x] Android companion app (Jetpack Compose)
- [x] AI Assistant module with multi-provider support (OpenAI, Claude, Ollama)
- [x] Voice recognition in AI module
- [x] Settings module with service configuration
- [x] Network monitoring module
- [x] Security/OpenEye integration module
- [x] API token display in Settings
- [x] Authentication documentation
- [x] App Store / Play Store compliance preparation

---

## Contributing

Want to help implement a feature? Check the [Contributing Guide](CONTRIBUTING.md) for development setup instructions.

To claim a task:
1. Open an issue referencing the task
2. Submit a PR with your implementation
3. Update this file to mark the task as in-progress/completed

## Feature Requests

Have an idea not listed here? [Open an issue](https://github.com/M1K31/MagicMirror-Custom/issues/new) with the "enhancement" label.
