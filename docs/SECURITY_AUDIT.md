# MagicMirror Security Audit Report

**Date:** January 2025  
**Auditor:** Cybersecurity Review  
**Scope:** MagicMirror v2.32.0 with Custom Modules  
**Risk Levels:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Executive Summary

This security audit covers the MagicMirror application with focus on the custom modules (Timer, Countdown, Quotes, Transit, Music, SmartHome, Fitness, Packages). The review identified **18 security findings** across credential management, data storage, input validation, and network security.

### Risk Distribution

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 2 | Requires immediate action |
| 🟠 High | 5 | Address within 1 week |
| 🟡 Medium | 7 | Address within 1 month |
| 🟢 Low | 4 | Best practice improvements |

---

## Findings

### 🔴 CRITICAL FINDINGS

#### SEC-001: Plaintext Token Storage

**Location:** [modules/default/fitness/node_helper.js](../modules/default/fitness/node_helper.js#L195)

**Description:**  
OAuth tokens, refresh tokens, and sensitive credentials are stored in plaintext JSON files (`.{provider}_config.json`) with no encryption.

```javascript
// Current vulnerable implementation
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
```

**Impact:**
- Stolen tokens allow full account access (Fitbit, Strava, Spotify, etc.)
- Tokens can be extracted by any user with file system access
- Potential for credential theft if device is compromised

**Affected Providers:**
- Fitbit (OAuth tokens)
- Strava (OAuth tokens)
- Spotify (OAuth tokens)
- FedEx (OAuth tokens)
- UPS (OAuth tokens)

**Remediation Priority:** Immediate

---

#### SEC-002: Credentials in Configuration File

**Location:** [config/config.js](../config/config.js)

**Description:**  
Sensitive credentials (API keys, passwords, OAuth secrets) are stored in `config.js` which may be accidentally committed to version control.

**Affected Credentials:**
- Garmin email/password (plaintext)
- Homebridge password
- All OAuth client secrets
- API keys (Google, AfterShip, SmartThings)

**Impact:**
- Credential exposure in git history
- Shared configurations expose secrets
- No separation of secrets from configuration

**Remediation Priority:** Immediate

---

### 🟠 HIGH FINDINGS

#### SEC-003: Permissive CORS on Socket.IO

**Location:** [js/server.js](../js/server.js#L47)

**Description:**  
Socket.IO is configured with a permissive CORS policy allowing any origin:

```javascript
cors: {
    origin: /.*$/,  // Allows ALL origins
    credentials: true
}
```

**Impact:**
- Cross-origin attacks from malicious websites
- Session hijacking potential
- Unauthorized module commands

**Remediation Priority:** 1 week

---

#### SEC-004: Password-Based Authentication (Garmin)

**Location:** [modules/default/fitness/providers/garmin.js](../modules/default/fitness/providers/garmin.js#L16-L18)

**Description:**  
Garmin provider uses email/password authentication stored in plaintext config:

```javascript
defaults: {
    email: "",
    password: "",  // Plaintext password
    session: null,
}
```

**Impact:**
- Password exposure in config file
- No multi-factor authentication support
- Account credentials at risk

**Remediation Priority:** 1 week

---

#### SEC-005: Insufficient Input Validation on Remote Data

**Location:** Multiple modules

**Description:**  
Data fetched from remote APIs and user configurations is directly rendered in the DOM without proper sanitization:

```javascript
// quotes.js - Direct HTML injection
quoteText.innerHTML = `<i class="fa fa-quote-left"></i> ${this.currentQuote.text}`;

// smarthome.js - Device names from API
wrapper.innerHTML = `... ${device.name} ...`;
```

**Impact:**
- XSS attacks via malicious quote content
- DOM manipulation through crafted API responses
- Stored XSS if using remote quote files

**Affected Modules:**
- Quotes (remote file loading)
- SmartHome (device names)
- Transit (route names, alerts)
- Music (track/artist names)
- Packages (tracking descriptions)

**Remediation Priority:** 1 week

---

#### SEC-006: No Rate Limiting on API Requests

**Location:** All provider node_helpers

**Description:**  
No rate limiting is implemented for API requests. A misconfigured module could exhaust API quotas or trigger account blocks.

**Impact:**
- API quota exhaustion
- Potential account suspension
- Service availability impact

**Remediation Priority:** 1 week

---

#### SEC-007: Session Tokens in Memory Only

**Location:** Various providers

**Description:**  
Garmin and Homebridge sessions are stored in memory but lack proper session validation and renewal logic, potentially allowing session fixation or replay attacks.

**Impact:**
- Session hijacking
- Replay attacks with stolen session cookies

**Remediation Priority:** 1 week

---

### 🟡 MEDIUM FINDINGS

#### SEC-008: No HTTPS Enforcement

**Location:** [js/server.js](../js/server.js)

**Description:**  
HTTPS is supported but not enforced. HTTP traffic exposes credentials and session data.

**Impact:**
- Man-in-the-middle attacks
- Credential interception on local network

---

#### SEC-009: Wide IP Whitelist by Default

**Location:** [config/config.js](../config/config.js#L20)

**Description:**  
IP whitelist only includes localhost by default, but documentation shows how to easily open to all IPs (`[]`), with insufficient security warnings.

**Impact:**
- Accidental exposure to entire network
- Unauthorized access if firewall misconfigured

---

#### SEC-010: Base64 Encoding Treated as Security

**Location:** OAuth providers

**Description:**  
Base64 encoding of credentials is used for OAuth, which provides no security - it's easily reversible:

```javascript
const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
```

**Note:** This is required by OAuth spec but should not be considered secure in transit without HTTPS.

---

#### SEC-011: Hardcoded Values in Requests

**Location:** [modules/default/packages/providers/usps.js](../modules/default/packages/providers/usps.js)

**Description:**  
Hardcoded values like `ClientIp: "127.0.0.1"` may trigger security alerts at API providers.

---

#### SEC-012: Error Messages May Leak Information

**Location:** Various modules

**Description:**  
Error messages include technical details that could aid attackers:

```javascript
throw new Error(`SmartThings API error: ${error.error?.message}`);
// May expose internal API structure
```

---

#### SEC-013: Missing Content Security Policy

**Location:** Helmet configuration

**Description:**  
While helmet is used, the default CSP may not be strict enough for a smart mirror application.

---

#### SEC-014: No Audit Logging

**Description:**  
No security audit logging for authentication attempts, configuration changes, or API access.

---

### 🟢 LOW FINDINGS

#### SEC-015: Dependencies May Have Vulnerabilities

**Recommendation:** Run `npm audit` regularly and update dependencies.

---

#### SEC-016: No HTTPS Certificate Validation Warnings

**Description:**  
Self-signed certificates may be used without proper warning to users.

---

#### SEC-017: Debug Logging May Expose Sensitive Data

**Description:**  
Debug mode may log sensitive information. Ensure tokens/passwords are never logged.

---

#### SEC-018: File Permissions on Config Files

**Description:**  
Config files containing secrets should have restricted file permissions (0600).

---

## Remediation Plan

### Phase 1: Critical (Week 1)

#### 1.1 Implement Encrypted Token Storage

Create a secure token storage utility:

```javascript
// modules/shared/secure-storage.js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

class SecureStorage {
    constructor(encryptionKey) {
        // Derive key from machine-specific identifier or user password
        this.key = crypto.scryptSync(encryptionKey, "magicmirror-salt", 32);
        this.algorithm = "aes-256-gcm";
    }

    encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        
        let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
        encrypted += cipher.final("hex");
        
        const authTag = cipher.getAuthTag();
        
        return {
            iv: iv.toString("hex"),
            data: encrypted,
            tag: authTag.toString("hex")
        };
    }

    decrypt(encryptedData) {
        const iv = Buffer.from(encryptedData.iv, "hex");
        const tag = Buffer.from(encryptedData.tag, "hex");
        
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encryptedData.data, "hex", "utf8");
        decrypted += decipher.final("utf8");
        
        return JSON.parse(decrypted);
    }

    saveSecure(filePath, data) {
        const encrypted = this.encrypt(data);
        fs.writeFileSync(filePath, JSON.stringify(encrypted), { mode: 0o600 });
    }

    loadSecure(filePath) {
        if (!fs.existsSync(filePath)) return null;
        const encrypted = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return this.decrypt(encrypted);
    }
}

module.exports = SecureStorage;
```

#### 1.2 Add Environment Variable Support

Update configuration to support environment variables for secrets:

```javascript
// In config.js
const config = {
    modules: [{
        module: "fitness",
        config: {
            provider: "fitbit",
            clientId: process.env.FITBIT_CLIENT_ID || "",
            clientSecret: process.env.FITBIT_CLIENT_SECRET || ""
        }
    }]
};
```

Create `.env.example`:

```bash
# .env.example - Copy to .env and fill in values
# Never commit .env to version control!

# Fitness
FITBIT_CLIENT_ID=
FITBIT_CLIENT_SECRET=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=

# Music
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# SmartHome
HOMEASSISTANT_TOKEN=
SMARTTHINGS_TOKEN=
HOMEBRIDGE_PASSWORD=

# Transit
GOOGLE_MAPS_API_KEY=

# Packages
AFTERSHIP_API_KEY=
FEDEX_CLIENT_ID=
FEDEX_CLIENT_SECRET=
UPS_CLIENT_ID=
UPS_CLIENT_SECRET=

# Garmin (consider OAuth alternative)
GARMIN_EMAIL=
GARMIN_PASSWORD=
```

### Phase 2: High Priority (Week 2)

#### 2.1 Restrict Socket.IO CORS

```javascript
// js/server.js - Restrict CORS to trusted origins
const io = new Server(server, {
    cors: {
        origin: config.corsOrigins || ["http://localhost:8080"],
        credentials: true
    },
    allowEIO3: true
});
```

#### 2.2 Implement Input Sanitization

Create sanitization utility:

```javascript
// modules/shared/sanitize.js
const ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;"
};

function escapeHtml(str) {
    if (typeof str !== "string") return str;
    return str.replace(/[&<>"'/]/g, char => ESCAPE_MAP[char]);
}

function sanitizeForDom(obj) {
    if (typeof obj === "string") return escapeHtml(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeForDom);
    if (obj && typeof obj === "object") {
        const result = {};
        for (const key of Object.keys(obj)) {
            result[key] = sanitizeForDom(obj[key]);
        }
        return result;
    }
    return obj;
}

module.exports = { escapeHtml, sanitizeForDom };
```

Update modules to use sanitization:

```javascript
// quotes.js - Use textContent instead of innerHTML for user data
quoteText.textContent = this.currentQuote.text;

// Or if HTML structure is needed, sanitize first
const { escapeHtml } = require("../../shared/sanitize");
quoteText.innerHTML = `<i class="fa fa-quote-left"></i> ${escapeHtml(this.currentQuote.text)}`;
```

#### 2.3 Add Rate Limiting

```javascript
// modules/shared/rate-limiter.js
class RateLimiter {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = [];
    }

    canMakeRequest() {
        const now = Date.now();
        this.requests = this.requests.filter(t => t > now - this.windowMs);
        return this.requests.length < this.maxRequests;
    }

    recordRequest() {
        this.requests.push(Date.now());
    }

    async throttle(fn) {
        while (!this.canMakeRequest()) {
            await new Promise(r => setTimeout(r, 1000));
        }
        this.recordRequest();
        return fn();
    }
}

module.exports = RateLimiter;
```

### Phase 3: Medium Priority (Week 3-4)

#### 3.1 Enforce HTTPS

Add HTTPS redirect and update documentation:

```javascript
// js/server.js - Add HTTPS redirect
if (config.useHttps && config.forceHttps) {
    app.use((req, res, next) => {
        if (!req.secure) {
            return res.redirect(`https://${req.hostname}:${config.httpsPort}${req.url}`);
        }
        next();
    });
}
```

#### 3.2 Implement Security Logging

```javascript
// js/security-logger.js
const fs = require("fs");
const path = require("path");

class SecurityLogger {
    constructor(logPath) {
        this.logPath = logPath || path.join(__dirname, "../logs/security.log");
    }

    log(event, details) {
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            ...details
        };
        
        // Append to log file
        fs.appendFileSync(
            this.logPath,
            JSON.stringify(entry) + "\n",
            { mode: 0o600 }
        );
    }

    authAttempt(provider, success, ip) {
        this.log("AUTH_ATTEMPT", { provider, success, ip });
    }

    configChange(module, change) {
        this.log("CONFIG_CHANGE", { module, change });
    }

    apiAccess(endpoint, method, ip) {
        this.log("API_ACCESS", { endpoint, method, ip });
    }
}

module.exports = new SecurityLogger();
```

#### 3.3 Strengthen CSP Headers

```javascript
// config.js - Add strict CSP
const config = {
    httpHeaders: {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"], // Review for removal
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "wss:", "https:"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"]
            }
        }
    }
};
```

### Phase 4: Low Priority (Ongoing)

#### 4.1 Dependency Audit Script

Add to `package.json`:

```json
{
    "scripts": {
        "security:audit": "npm audit && npm outdated",
        "security:fix": "npm audit fix"
    }
}
```

#### 4.2 File Permission Script

Create setup script:

```bash
#!/bin/bash
# scripts/secure-permissions.sh

# Secure config files
chmod 600 config/config.js
chmod 600 .env 2>/dev/null

# Secure token storage
find modules/default -name ".*_config.json" -exec chmod 600 {} \;

# Secure logs
chmod 700 logs 2>/dev/null
find logs -name "*.log" -exec chmod 600 {} \; 2>/dev/null

echo "File permissions secured"
```

---

## Security Checklist

### Pre-Deployment

- [ ] All secrets moved to environment variables
- [ ] Token storage encrypted
- [ ] HTTPS enabled and configured
- [ ] IP whitelist properly configured
- [ ] Socket.IO CORS restricted
- [ ] npm audit shows no critical vulnerabilities
- [ ] File permissions set correctly
- [ ] Debug logging disabled
- [ ] CSP headers configured

### Ongoing

- [ ] Weekly dependency audit
- [ ] Monthly security log review
- [ ] Token rotation schedule
- [ ] Backup encryption keys securely
- [ ] Monitor for unauthorized access attempts

---

## Configuration Example (Secure)

```javascript
// config/config.js - Secure configuration template
require("dotenv").config();

const config = {
    address: "localhost",
    port: 8080,
    
    // Security Settings
    useHttps: true,
    httpsPrivateKey: "/path/to/privkey.pem",
    httpsCertificate: "/path/to/fullchain.pem",
    forceHttps: true,
    
    // Strict IP whitelist
    ipWhitelist: ["127.0.0.1", "::1"],
    
    // Restricted CORS
    corsOrigins: ["https://localhost:8080"],
    
    // Security headers
    httpHeaders: {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                // ... strict CSP
            }
        }
    },
    
    modules: [
        {
            module: "fitness",
            config: {
                provider: "fitbit",
                // Credentials from environment
                clientId: process.env.FITBIT_CLIENT_ID,
                clientSecret: process.env.FITBIT_CLIENT_SECRET
            }
        }
    ]
};

if (typeof module !== "undefined") {
    module.exports = config;
}
```

---

## References

- [OWASP IoT Security Guidelines](https://owasp.org/www-project-internet-of-things/)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2025 | Initial security audit |
