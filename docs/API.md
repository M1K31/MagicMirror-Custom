# MagicMirror REST API Documentation

The MagicMirror REST API provides programmatic access to control and configure your MagicMirror. This API is used by the iOS and Android companion apps.

## Base URL

```
http://<your-mirror-ip>:8080/api/v1
```

## Authentication

All API endpoints require Bearer token authentication.

### Token Generation

On server startup, a token is automatically generated and logged to the console:

```
[API] Token for remote access: <your-token>
```

You can also set a custom token in `config.js`:

```javascript
api: {
    enabled: true,
    prefix: "/api/v1",
    token: "your-secure-token-here"
}
```

### Using the Token

Include the token in the `Authorization` header:

```
Authorization: Bearer <your-token>
```

Example:
```bash
curl -H "Authorization: Bearer abc123" http://localhost:8080/api/v1/health
```

---

## Endpoints

### Health Check

Check if the API is running.

**Request:**
```
GET /health
```

**Response:**
```json
{
    "success": true,
    "data": {
        "status": "ok",
        "timestamp": "2024-01-15T10:30:00.000Z",
        "uptime": 3600
    }
}
```

---

### System Information

Get detailed system information.

**Request:**
```
GET /info
```

**Response:**
```json
{
    "success": true,
    "data": {
        "version": "2.32.0",
        "platform": "linux",
        "arch": "x64",
        "nodeVersion": "v22.21.0",
        "uptime": 3600,
        "memory": {
            "total": 8192,
            "used": 4096,
            "free": 4096
        },
        "hostname": "magicmirror"
    }
}
```

---

### Modules

#### List All Modules

**Request:**
```
GET /modules
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "identifier": "module_0_clock",
            "name": "clock",
            "hidden": false,
            "position": "top_right",
            "config": {}
        }
    ]
}
```

#### Get Module by ID

**Request:**
```
GET /modules/:identifier
```

**Response:**
```json
{
    "success": true,
    "data": {
        "identifier": "module_0_clock",
        "name": "clock",
        "hidden": false,
        "position": "top_right",
        "config": {}
    }
}
```

#### Update Module

**Request:**
```
PUT /modules/:identifier
```

**Body:**
```json
{
    "hidden": true
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "identifier": "module_0_clock",
        "hidden": true
    }
}
```

---

### Module Actions

#### Show Module

**Request:**
```
POST /modules/:identifier/show
```

**Body (optional):**
```json
{
    "speed": 1000
}
```

**Response:**
```json
{
    "success": true,
    "message": "Module shown"
}
```

#### Hide Module

**Request:**
```
POST /modules/:identifier/hide
```

**Body (optional):**
```json
{
    "speed": 1000
}
```

**Response:**
```json
{
    "success": true,
    "message": "Module hidden"
}
```

#### Refresh Module

**Request:**
```
POST /modules/:identifier/refresh
```

**Response:**
```json
{
    "success": true,
    "message": "Module refreshed"
}
```

---

### Display Settings

#### Get Display Settings

**Request:**
```
GET /display
```

**Response:**
```json
{
    "success": true,
    "data": {
        "brightness": 100,
        "zoom": 1.0,
        "colorScheme": "dark"
    }
}
```

#### Update Display Settings

**Request:**
```
PUT /display
```

**Body:**
```json
{
    "brightness": 80,
    "zoom": 1.2,
    "colorScheme": "light"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "brightness": 80,
        "zoom": 1.2,
        "colorScheme": "light"
    }
}
```

---

### Alerts

#### Send Alert

**Request:**
```
POST /alert
```

**Body:**
```json
{
    "type": "notification",
    "title": "Hello",
    "message": "This is a test notification",
    "timer": 5000
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | string | `alert` or `notification` |
| title | string | Alert title |
| message | string | Alert message |
| timer | number | Display duration in ms (optional) |

**Response:**
```json
{
    "success": true,
    "message": "Alert sent"
}
```

---

### Services

#### List Services

Get status of all configurable services.

**Request:**
```
GET /services
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "id": "homeassistant",
            "name": "Home Assistant",
            "status": "connected",
            "enabled": true
        },
        {
            "id": "spotify",
            "name": "Spotify",
            "status": "disconnected",
            "enabled": false
        }
    ]
}
```

#### Get Service

**Request:**
```
GET /services/:id
```

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "homeassistant",
        "name": "Home Assistant",
        "status": "connected",
        "enabled": true,
        "config": {
            "url": "http://homeassistant.local:8123"
        }
    }
}
```

#### Update Service

**Request:**
```
PUT /services/:id
```

**Body:**
```json
{
    "enabled": true,
    "config": {
        "url": "http://homeassistant.local:8123",
        "token": "xxx"
    }
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "homeassistant",
        "enabled": true
    }
}
```

---

### Commands

#### Execute Command

Execute a custom command on the mirror.

**Request:**
```
POST /command
```

**Body:**
```json
{
    "command": "REFRESH_PAGE"
}
```

Available commands:
- `REFRESH_PAGE` - Refresh the browser
- `TOGGLE_FULLSCREEN` - Toggle fullscreen mode
- `MINIMIZE` - Minimize window (Electron)
- `OPEN_SETTINGS` - Open settings panel

**Response:**
```json
{
    "success": true,
    "message": "Command executed"
}
```

---

### System Control

#### Restart MagicMirror

**Request:**
```
POST /restart
```

**Response:**
```json
{
    "success": true,
    "message": "Restarting MagicMirror..."
}
```

#### Shutdown MagicMirror

**Request:**
```
POST /shutdown
```

**Response:**
```json
{
    "success": true,
    "message": "Shutting down MagicMirror..."
}
```

---

## Real-time Updates

The API uses Socket.IO to broadcast changes to all connected clients. When you make a change via the API, the server emits a `REMOTE_ACTION` event to notify the browser to update.

### Socket.IO Events

Connect to the Socket.IO server at:
```
http://<your-mirror-ip>:8080
```

#### Events Emitted by Server

| Event | Payload | Description |
|-------|---------|-------------|
| `REMOTE_ACTION` | `{ action: string, data: object }` | Broadcast when API changes state |

#### Actions

- `SHOW_MODULE` - Module was shown
- `HIDE_MODULE` - Module was hidden
- `UPDATE_DISPLAY` - Display settings changed
- `SHOW_ALERT` - Alert sent
- `REFRESH_PAGE` - Page refresh requested

---

## Error Handling

All errors return a consistent format:

```json
{
    "success": false,
    "error": "Error message here"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request (missing parameters) |
| 401 | Unauthorized (invalid token) |
| 404 | Not Found (module/service not found) |
| 500 | Server Error |

---

## Configuration

### config.js Options

```javascript
api: {
    enabled: true,              // Enable/disable API
    prefix: "/api/v1",          // API URL prefix
    token: "your-token"         // Optional: custom token
}
```

### Security Recommendations

1. **Use HTTPS** in production with a reverse proxy (nginx, Caddy)
2. **Rotate tokens** periodically
3. **Restrict IP access** using `ipWhitelist` in config.js
4. **Use strong tokens** - avoid simple passwords

---

## Examples

### cURL

```bash
# Get all modules
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/api/v1/modules

# Hide a module
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  http://localhost:8080/api/v1/modules/module_0_clock/hide

# Set brightness
curl -X PUT \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"brightness": 50}' \
  http://localhost:8080/api/v1/display

# Send notification
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "notification", "message": "Hello!"}' \
  http://localhost:8080/api/v1/alert
```

### JavaScript (Fetch)

```javascript
const API_URL = 'http://localhost:8080/api/v1';
const TOKEN = 'your-token';

async function getModules() {
    const response = await fetch(`${API_URL}/modules`, {
        headers: {
            'Authorization': `Bearer ${TOKEN}`
        }
    });
    return response.json();
}

async function hideModule(identifier) {
    const response = await fetch(`${API_URL}/modules/${identifier}/hide`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${TOKEN}`
        }
    });
    return response.json();
}
```

### Python

```python
import requests

API_URL = 'http://localhost:8080/api/v1'
TOKEN = 'your-token'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/json'
}

# Get modules
response = requests.get(f'{API_URL}/modules', headers=headers)
modules = response.json()

# Set brightness
response = requests.put(
    f'{API_URL}/display',
    headers=headers,
    json={'brightness': 80}
)
```

---

## Rate Limiting

The API does not currently implement rate limiting. For production use, consider adding rate limiting via a reverse proxy or middleware.

---

## Changelog

### v1.0.0
- Initial API release
- Module control endpoints
- Display settings endpoints
- Alert/notification support
- Service configuration
- System control (restart/shutdown)
