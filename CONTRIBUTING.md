# Contributing to MagicMirror-Custom

Thank you for your interest in contributing! This document provides guidelines and setup instructions for developers.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Creating a Module](#creating-a-module)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Security Guidelines](#security-guidelines)

---

## Development Setup

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Git** for version control
- **Linux/macOS** recommended (WSL2 for Windows)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/MagicMirror-Custom.git
cd MagicMirror-Custom

# Install dependencies
npm install

# Copy sample configuration
cp config/config.js.sample config/config.js
cp css/custom.css.sample css/custom.css

# Set up environment variables (for API keys, tokens)
cp .env.example .env
# Edit .env with your credentials

# Start in development mode
npm run start:dev
```

### Development Commands

```bash
# Development with DevTools
npm run start:dev

# Server-only mode (no Electron)
npm run server

# Run tests
npm test                 # All tests
npm run test:unit        # Unit tests only
npm run test:e2e         # End-to-end tests

# Linting
npm run lint:js          # ESLint for JavaScript
npm run lint:css         # Stylelint for CSS
npm run lint:prettier    # Format all files

# Validate configuration
npm run config:check
```

### Environment Variables

Required environment variables depend on which modules you're using. Create a `.env` file in the project root:

```bash
# Security & Authentication
JWT_SECRET=your-secure-jwt-secret

# Spotify Integration
SPOTIFY_CLIENT_ID=your-client-id
SPOTIFY_CLIENT_SECRET=your-client-secret

# Google APIs
GOOGLE_TRANSIT_API_KEY=your-api-key

# AfterShip (Package Tracking)
AFTERSHIP_API_KEY=your-api-key

# OpenEye Security Integration
OPENEYE_HOST=http://localhost:8000
OPENEYE_TOKEN=your-openeye-jwt-token

# Home Assistant
HASS_URL=http://homeassistant.local:8123
HASS_TOKEN=your-long-lived-access-token
```

---

## Project Architecture

### Directory Structure

```
MagicMirror-Custom/
├── config/                   # User configuration
│   ├── config.js             # Main config (gitignored)
│   └── config.js.sample      # Sample config template
├── css/                      # Core stylesheets
│   ├── custom.css            # User customizations
│   └── main.css              # Core styles
├── docs/                     # Documentation
│   ├── CUSTOM_MODULES.md     # Module documentation
│   └── SECURITY_AUDIT.md     # Security guidelines
├── js/                       # Core JavaScript
│   ├── app.js                # Application core
│   ├── loader.js             # Module loader
│   ├── module.js             # Client module base class
│   ├── node_helper.js        # Server helper base class
│   └── server.js             # Express server
├── modules/                  # Modules directory
│   ├── default/              # Built-in modules
│   │   ├── calendar/
│   │   ├── clock/
│   │   ├── network/          # Network monitoring
│   │   ├── security/         # OpenEye integration
│   │   └── ...
│   └── shared/               # Shared utilities
│       ├── baseprovider.js
│       ├── rate-limiter.js
│       ├── sanitize.js
│       └── secure-storage.js
├── tests/                    # Test suites
│   ├── configs/              # Test configurations
│   ├── e2e/                  # End-to-end tests
│   ├── electron/             # Electron tests
│   └── unit/                 # Unit tests
└── translations/             # i18n files
```

### Communication Flow

```
┌─────────────────┐                    ┌─────────────────┐
│  Client Module  │◄── Socket.IO ────►│   Node Helper   │
│   (browser)     │                    │   (server)      │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  sendSocketNotification()            │
         │                                      │
         └──────────────────────────────────────┘

┌─────────────────┐  sendNotification()  ┌─────────────────┐
│  Module A       │◄────────────────────►│   Module B      │
└─────────────────┘                      └─────────────────┘
```

---

## Creating a Module

### Module Structure

```
modules/default/mymodule/
├── mymodule.js           # Client-side (required)
├── node_helper.js        # Server-side (optional)
├── mymodule.css          # Styles (optional)
└── locales/              # Translations (optional)
    └── en.json
```

### Client-Side Template

```javascript
Module.register("mymodule", {
	// Default configuration
	defaults: {
		updateInterval: 60000,
		maxItems: 5
	},

	// Called when module starts
	start: function () {
		Log.info("[MyModule] Starting...");
		this.data = null;
		this.sendSocketNotification("INIT", this.config);
	},

	// Generate DOM content
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "mymodule";

		if (!this.data) {
			wrapper.innerHTML = this.translate("LOADING");
			return wrapper;
		}

		// Build your UI here
		wrapper.innerHTML = this.data.content;
		return wrapper;
	},

	// Handle notifications from node_helper
	socketNotificationReceived: function (notification, payload) {
		if (notification === "DATA_UPDATE") {
			this.data = payload;
			this.updateDom();
		}
	},

	// Handle notifications from other modules
	notificationReceived: function (notification, payload, sender) {
		if (notification === "CALENDAR_EVENTS") {
			// React to calendar events
		}
	},

	// Return CSS files to load
	getStyles: function () {
		return ["mymodule.css"];
	},

	// Return translation files
	getTranslations: function () {
		return {
			en: "translations/en.json"
		};
	}
});
```

### Server-Side Template

```javascript
const NodeHelper = require("node_helper");
const Log = require("logger");

module.exports = NodeHelper.create({
	start: function () {
		Log.log(`[${this.name}] Node helper started`);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "INIT") {
			this.config = payload;
			this.fetchData();
		}
	},

	fetchData: async function () {
		try {
			const response = await fetch("https://api.example.com/data");
			const data = await response.json();
			this.sendSocketNotification("DATA_UPDATE", data);
		} catch (error) {
			Log.error(`[${this.name}] Fetch error: ${error.message}`);
		}
	}
});
```

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Specific test suites
npm run test:unit        # Unit tests
npm run test:e2e         # Browser integration tests
npm run test:electron    # Electron app tests

# With coverage
npm run test:coverage
```

### Writing Tests

Place tests in the appropriate directory:
- `tests/unit/` - For unit tests
- `tests/e2e/` - For browser integration tests
- `tests/electron/` - For Electron-specific tests

Example unit test:

```javascript
describe("MyModule", () => {
	it("should initialize with default config", () => {
		const module = new MyModule();
		expect(module.config.updateInterval).toBe(60000);
	});
});
```

---

## Code Style

### General Guidelines

- **Tabs** for indentation (not spaces)
- **Double quotes** for strings
- **Semicolons** required
- **ES6+** syntax preferred
- **JSDoc** comments for public methods

### ESLint & Prettier

The project uses ESLint and Prettier for code formatting:

```bash
# Check for issues
npm run lint:js
npm run lint:css

# Auto-fix
npm run lint:prettier
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | lowercase with hyphens | `node-helper.js` |
| Modules | PascalCase | `MyModule` |
| Functions | camelCase | `fetchData()` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| CSS classes | kebab-case | `.module-wrapper` |

---

## Pull Request Process

### Before Submitting

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** with clear, atomic commits

3. **Test your changes**:
   ```bash
   npm test
   npm run lint:js
   npm run lint:css
   ```

4. **Update documentation** if needed

### PR Guidelines

- Use a descriptive title
- Reference any related issues
- Include screenshots for UI changes
- Ensure all tests pass
- Keep PRs focused on a single feature/fix

### Commit Message Format

```
type(scope): brief description

Longer description if needed.

Fixes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## Security Guidelines

### Handling Sensitive Data

1. **Never commit secrets** - Use environment variables
2. **Use secure storage** - For tokens, use `modules/shared/secure-storage.js`
3. **Sanitize inputs** - Use `modules/shared/sanitize.js` for user inputs
4. **Rate limiting** - Use `modules/shared/rate-limiter.js` for API calls

### Security Utilities

```javascript
// Secure token storage
const SecureStorage = require("modules/shared/secure-storage");
const storage = new SecureStorage("my-module");
await storage.storeToken("api_key", "secret-value");
const token = await storage.getToken("api_key");

// Input sanitization
const { sanitizeHtml, escapeHtml } = require("modules/shared/sanitize");
const safeHtml = sanitizeHtml(userInput);

// Rate limiting
const RateLimiter = require("modules/shared/rate-limiter");
const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60000 });
if (limiter.isAllowed()) { /* make request */ }
```

### Environment Variable Security

```bash
# Set secure file permissions
chmod 600 .env

# Or use the included script
./scripts/secure-permissions.sh
```

### Reporting Security Issues

For security vulnerabilities, please email the maintainer directly rather than opening a public issue.

---

## External Integrations

### OpenEye Security System

To integrate with OpenEye (AI-powered surveillance):

1. **Install OpenEye** from [OpenEye-OpenCV_Home_Security](https://github.com/YOUR_USERNAME/OpenEye-OpenCV_Home_Security)
2. **Get a JWT token** from OpenEye's authentication endpoint
3. **Configure the security module**:

```javascript
{
	module: "security",
	position: "middle_center",
	config: {
		openeyeHost: "http://localhost:8000",
		token: process.env.OPENEYE_TOKEN,
		cameras: ["front_door", "backyard"],
		showEvents: true
	}
}
```

### Network Monitoring

The network module requires root/sudo for full scanning:

```bash
# Allow arp-scan without password
sudo visudo

# Add this line:
username ALL=(ALL) NOPASSWD: /usr/sbin/arp-scan
```

---

## Getting Help

- **Documentation**: See `docs/` directory
- **Issues**: Open a GitHub issue for bugs
- **Discussions**: Use GitHub Discussions for questions

## License

This project is licensed under the MIT License. See [LICENSE.md](../LICENSE.md).
