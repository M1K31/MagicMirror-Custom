# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MagicMirror² (v2.32.0) is a modular smart mirror platform built with Node.js and Electron. It provides a web-based interface for displaying customizable information modules.

**Architecture:** Three-layer system:

1. **Client Layer** - Runs in Electron/browser, renders modules via Socket.IO
2. **Server Layer** - Express HTTP server with Socket.IO, manages Node Helpers
3. **Electron Wrapper** - Native desktop window (optional)

## Common Commands

```bash
# Development
npm run start:dev              # Start with DevTools enabled
npm run server                 # Server-only mode (no Electron)

# Testing
npm test                       # Run all tests (unit, electron, e2e)
npm run test:unit              # Unit tests only
npm run test:e2e               # End-to-end tests
npm run test:coverage          # Generate coverage report

# Linting
npm run lint:js                # Lint and fix JavaScript
npm run lint:css               # Lint and fix CSS
npm run lint:prettier          # Format with Prettier

# Configuration
npm run config:check           # Validate config file syntax
```

## Module System

Modules follow this structure:

```
modules/default/[modulename]/
├── [modulename].js           # Client-side (extends Module)
├── node_helper.js            # Server-side (extends NodeHelper, optional)
├── [modulename]_styles.css   # Styles
└── locales/                  # Translations
```

**Client-side module (js/module.js):**

```javascript
Module.register("moduleName", {
  defaults: {
    /* config */
  },
  start() {
    /* init */
  },
  getDom() {
    /* return HTMLElement */
  },
  socketNotificationReceived(notification, payload) {
    /* from node_helper */
  }
});
```

**Server-side helper (js/node_helper.js):**

```javascript
NodeHelper.create({
  start() {
    /* init */
  },
  socketNotificationReceived(notification, payload) {
    /* from client */
  },
  sendSocketNotification(notification, payload) {
    /* to client */
  }
});
```

## Key Files

- `js/app.js` - Core application, config loading, module helper management
- `js/module.js` - Client-side module base class
- `js/node_helper.js` - Server-side helper base class
- `js/loader.js` - Dynamic module loader
- `js/server.js` - Express server with Socket.IO
- `config/config.js` - User configuration (created from config.js.sample)

## Code Style

- Tabs for indentation (not spaces)
- Double quotes for strings
- Semicolons required
- ES6+ syntax
- Uses John Resig's class system (js/class.js) for module inheritance

## Testing

Three test projects configured in jest.config.js:

- **Unit tests:** `tests/unit/` - Module and utility tests
- **Electron tests:** `tests/electron/` - Desktop app tests
- **E2E tests:** `tests/e2e/` - Integration tests with Playwright

## Default Modules

Located in `modules/default/`: alert, calendar, clock, compliments, helloworld, newsfeed, updatenotification, weather

## Communication Flow

```
Client Module ←→ Socket.IO ←→ Node Helper
     │                              │
     └── sendSocketNotification ────┘
```

Modules can also broadcast to other modules via `sendNotification()`.

## Custom Modules

This fork includes 10 additional modules:

- **Timer** - Countdown timers and stopwatch
- **Countdown** - Event countdowns with recurring events
- **Quotes** - Inspirational quotes from multiple categories
- **Transit** - Real-time public transit information
- **Music** - Currently playing music from Spotify, Apple Music
- **SmartHome** - Device control for Home Assistant, SmartThings
- **Fitness** - Health data from Fitbit, Strava, Garmin
- **Packages** - Package tracking via AfterShip, FedEx, UPS
- **Network** - Network device discovery, speed testing, connectivity monitoring
- **Security** - OpenEye AI surveillance integration (cameras, motion, face detection)

See `docs/CUSTOM_MODULES.md` for full documentation.

## Security

**IMPORTANT:** Review `docs/SECURITY_AUDIT.md` for security considerations.

**Key security utilities in `modules/shared/`:**

- `secure-storage.js` - Encrypted token storage
- `sanitize.js` - XSS prevention, input sanitization
- `rate-limiter.js` - API rate limiting

**Environment Variables:**

Copy `.env.example` to `.env` for secrets. Never commit `.env` to version control.

```bash
# Secure file permissions
./scripts/secure-permissions.sh
```
