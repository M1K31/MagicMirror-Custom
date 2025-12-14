# MagicMirror API Authentication Guide

This document explains how authentication works between the companion apps (iOS/Android) and the MagicMirror REST API.

## Overview

The MagicMirror API uses **Bearer Token Authentication** to secure communication between companion apps and the mirror. This is a simple but effective method that:

1. Requires no user accounts or passwords
2. Works on local networks without internet
3. Provides secure access control
4. Is easy to configure and manage

## How It Works

```
┌─────────────────┐         ┌─────────────────┐
│   Mobile App    │         │  MagicMirror    │
│  (iOS/Android)  │         │    Server       │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │  1. User enters token     │
         │  ────────────────────────>│
         │                           │
         │  2. App stores token      │
         │     locally               │
         │                           │
         │  3. API Request with      │
         │     Bearer Token          │
         │  ────────────────────────>│
         │     Authorization:        │
         │     Bearer <token>        │
         │                           │
         │  4. Server validates      │
         │     token                 │
         │                           │
         │  5. Response              │
         │  <────────────────────────│
         │                           │
```

## Token Generation

### Automatic Token Generation

When MagicMirror starts, it automatically generates a secure random token if one is not configured:

```javascript
// In js/api.js
function generateToken() {
    return require('crypto').randomBytes(32).toString('hex');
}
```

The token is logged to the console on startup:

```
[API] Token for remote access: a1b2c3d4e5f6...
```

### Custom Token Configuration

You can set a custom token in `config/config.js`:

```javascript
module.exports = {
    // ... other config ...
    
    api: {
        enabled: true,
        prefix: "/api/v1",
        token: "your-secure-custom-token"
    }
};
```

**Security Best Practices for Custom Tokens:**
- Use at least 32 characters
- Include mix of letters, numbers, and symbols
- Generate using a secure method (e.g., `openssl rand -hex 32`)
- Never commit tokens to version control
- Rotate tokens periodically

## Token Storage

### iOS App

Tokens are stored using `UserDefaults`:

```swift
// Store token
UserDefaults.standard.set(apiToken, forKey: "apiToken")

// Retrieve token
let token = UserDefaults.standard.string(forKey: "apiToken")
```

For enhanced security, you can migrate to Keychain storage:

```swift
import Security

func storeTokenInKeychain(_ token: String) {
    let data = token.data(using: .utf8)!
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: "magicmirror_api_token",
        kSecValueData as String: data
    ]
    SecItemAdd(query as CFDictionary, nil)
}
```

### Android App

Tokens are stored using DataStore:

```kotlin
// PreferencesRepository.kt
suspend fun saveCredentials(serverUrl: String, apiToken: String) {
    context.dataStore.edit { preferences ->
        preferences[SERVER_URL] = serverUrl
        preferences[API_TOKEN] = apiToken
    }
}
```

For enhanced security, use EncryptedSharedPreferences:

```kotlin
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val sharedPreferences = EncryptedSharedPreferences.create(
    context,
    "secret_shared_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
```

## Making Authenticated Requests

### Request Format

All authenticated requests must include the `Authorization` header:

```http
GET /api/v1/modules HTTP/1.1
Host: 192.168.1.100:8080
Authorization: Bearer your-token-here
Content-Type: application/json
```

### iOS Implementation

```swift
func makeRequest<T: Decodable>(_ endpoint: String) async throws -> T {
    guard let url = URL(string: "\(baseURL)\(endpoint)") else {
        throw MirrorError.invalidURL
    }
    
    var request = URLRequest(url: url)
    request.addValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
    request.addValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let (data, response) = try await session.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw MirrorError.invalidResponse
    }
    
    if httpResponse.statusCode == 401 {
        throw MirrorError.unauthorized
    }
    
    return try JSONDecoder().decode(T.self, from: data)
}
```

### Android Implementation

```kotlin
// Using OkHttp Interceptor for automatic token injection
class AuthInterceptor(private val tokenProvider: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val token = tokenProvider()
        
        val newRequest = if (token != null) {
            originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            originalRequest
        }
        
        return chain.proceed(newRequest)
    }
}
```

## Server-Side Validation

### Token Validation Middleware

```javascript
// In js/api.js
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing or invalid authorization header'
        });
    }
    
    const token = authHeader.substring(7);
    
    if (token !== apiToken) {
        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
    
    next();
}
```

### Token Comparison Security

The API uses constant-time comparison to prevent timing attacks:

```javascript
const crypto = require('crypto');

function secureCompare(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(
        Buffer.from(a),
        Buffer.from(b)
    );
}
```

## Error Handling

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Request completed |
| 401 | Unauthorized | Invalid or missing token |
| 403 | Forbidden | Token valid but action not permitted |
| 500 | Server Error | Internal error, retry |

### Error Response Format

```json
{
    "success": false,
    "error": "Invalid token"
}
```

### Client Error Handling

```swift
// iOS
catch MirrorError.unauthorized {
    // Clear stored credentials
    UserDefaults.standard.removeObject(forKey: "apiToken")
    // Show reconnection UI
    showConnectionView()
}
```

```kotlin
// Android
when (response.code) {
    401 -> {
        preferencesRepository.clearCredentials()
        // Navigate to connection screen
    }
}
```

## Security Considerations

### Network Security

1. **Use HTTPS in Production**
   - Set up a reverse proxy (nginx, Caddy) with SSL/TLS
   - Redirect HTTP to HTTPS
   
   ```nginx
   server {
       listen 443 ssl;
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:8080;
       }
   }
   ```

2. **IP Whitelisting**
   - Restrict access to known devices
   - Configure in `config.js`:
   
   ```javascript
   ipWhitelist: ["127.0.0.1", "192.168.1.0/24"]
   ```

3. **Firewall Rules**
   - Block external access to port 8080
   - Only allow local network connections

### Token Security

1. **Strong Token Generation**
   ```bash
   # Generate a secure token
   openssl rand -hex 32
   ```

2. **Token Rotation**
   - Change tokens periodically
   - Immediately rotate if compromised
   - Update all connected devices after rotation

3. **Never Expose Tokens**
   - Don't log tokens in production
   - Don't include in URLs (use headers)
   - Don't commit to version control

### Mobile App Security

1. **Secure Storage**
   - iOS: Use Keychain for sensitive data
   - Android: Use EncryptedSharedPreferences

2. **Network Pinning** (Optional)
   - Pin to specific server certificates
   - Prevents MITM attacks

3. **App Transport Security**
   - iOS: Configure ATS properly
   - Android: Use Network Security Config

## Troubleshooting

### "Unauthorized" Error

1. Check token in server logs matches app
2. Verify no extra spaces in token
3. Ensure "Bearer " prefix is included
4. Check token hasn't expired or been rotated

### "Connection Refused"

1. Verify MagicMirror is running
2. Check IP address and port
3. Ensure devices are on same network
4. Check firewall settings

### Token Not Showing in Logs

1. Restart MagicMirror
2. Check API is enabled in config
3. Look for errors in startup logs

## Advanced: Token Refresh (Future)

For enhanced security, a token refresh mechanism could be implemented:

```javascript
// Server generates short-lived access tokens
// and long-lived refresh tokens

POST /api/v1/auth/refresh
{
    "refresh_token": "long-lived-token"
}

Response:
{
    "access_token": "short-lived-token",
    "expires_in": 3600
}
```

This is not currently implemented but could be added for enhanced security.

## See Also

- [API Documentation](API.md)
- [Mobile Apps README](../mobile/README.md)
- [MagicMirror Security Best Practices](https://docs.magicmirror.builders/configuration/securing.html)
