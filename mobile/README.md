# MagicMirror Mobile Companion Apps

Native mobile applications for controlling your MagicMirror remotely.

## Apps

### iOS (SwiftUI)
📱 [MagicMirror Remote for iOS](ios/MagicMirrorRemote/README.md)

- iOS 16.0+
- Built with SwiftUI
- Modern async/await networking

### Android (Kotlin)
🤖 [MagicMirror Remote for Android](android/README.md)

- Android 8.0+ (API 26)
- Built with Jetpack Compose
- Material 3 design

## Features

Both apps provide:

- **Dashboard** - Quick status overview with active modules
- **Modules** - Show, hide, and refresh individual modules
- **Display** - Adjust brightness, zoom, and color scheme
- **Services** - Configure Home Assistant, Spotify, and more
- **Settings** - View system info, restart, or shutdown

## Prerequisites

1. MagicMirror running with API enabled
2. Network access to MagicMirror
3. API token (auto-generated or configured)

## Quick Start

### 1. Enable the API

In your MagicMirror `config.js`:

```javascript
api: {
    enabled: true,
    prefix: "/api/v1"
}
```

### 2. Get the Token

When MagicMirror starts, look for this in the console:
```
[API] Token for remote access: <your-token>
```

Or set a custom token:
```javascript
api: {
    enabled: true,
    prefix: "/api/v1",
    token: "your-secure-token"
}
```

### 3. Connect

1. Open the mobile app
2. Enter your MagicMirror URL (e.g., `http://192.168.1.100:8080`)
3. Enter the API token
4. Tap Connect

## API Documentation

See the [REST API section](../README.md#-rest-api) in the main README for endpoint reference.

## Development

### Building iOS App

```bash
cd ios/MagicMirrorRemote
open MagicMirrorRemote.xcodeproj
```

### Building Android App

```bash
cd android
./gradlew assembleDebug
```

Or open in Android Studio.

## Security

- Always use HTTPS in production
- Use strong, random tokens
- Restrict network access with firewall rules
- Rotate tokens periodically

## Troubleshooting

### Cannot Connect

1. Verify MagicMirror is running
2. Check the URL and port
3. Ensure devices are on the same network
4. Verify the token is correct

### Connection Drops

- Check network stability
- Restart MagicMirror if needed
- The apps will show disconnected state

### Changes Not Reflecting

- Try the refresh button
- The apps use Socket.IO for real-time sync
- Check server logs for errors

## Contributing

Pull requests welcome! Please follow the existing code style.

## License

MIT License - See project [LICENSE](../LICENSE)
