/**
 * HMAC-SHA256 token generation and verification for Node.js.
 * Mirrors the Python ecosystem_auth.tokens module exactly.
 *
 * Uses Node.js crypto stdlib - zero external dependencies.
 */

const crypto = require("crypto");

/**
 * Generate a cryptographically secure hex token.
 * @param {number} length - Number of bytes (output is 2x hex chars). Default 32.
 * @returns {string}
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Create a one-way SHA-256 hash of a token.
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Verify a token against its stored hash using constant-time comparison.
 * @param {string} token
 * @param {string} tokenHash
 * @returns {boolean}
 */
function verifyTokenHash(token, tokenHash) {
  const computed = hashToken(token);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, "utf8"), Buffer.from(tokenHash, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Sign a payload with HMAC-SHA256.
 *
 * JSON-serializes with sorted keys and compact separators to match Python's output:
 *   json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
 *
 * @param {object} payload
 * @param {string} secret
 * @returns {string}
 */
function signPayload(payload, secret) {
  const message = stableStringify(payload);
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/**
 * Verify the HMAC-SHA256 signature of a payload (constant-time).
 * @param {object} payload
 * @param {string} signature
 * @param {string} secret
 * @returns {boolean}
 */
function verifySignature(payload, signature, secret) {
  const expected = signPayload(payload, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

// Header names for the replay-resistant request signature scheme.
const SIGNATURE_HEADER = "X-Ecosystem-Signature";
const TIMESTAMP_HEADER = "X-Ecosystem-Timestamp";
const NONCE_HEADER = "X-Ecosystem-Nonce";

/**
 * Host-independent canonical path (path + sorted query). Mirrors Python.
 * @param {string} url
 * @returns {string}
 */
function canonicalPath(url) {
  // Accept both absolute URLs and bare paths.
  const u = new URL(url, "http://placeholder");
  const params = [...u.searchParams.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  const query = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  return u.pathname + (query ? `?${query}` : "");
}

/**
 * SHA-256 of the canonical JSON form of a request body. Missing/empty -> {}.
 * @param {object|null|undefined} body
 * @returns {string}
 */
function canonicalBodyDigest(body) {
  const obj = body && Object.keys(body).length ? body : {};
  return crypto.createHash("sha256").update(stableStringify(obj), "utf8").digest("hex");
}

function _requestPayload(method, url, ts, nonce, body) {
  return {
    method: method.toUpperCase(),
    path: canonicalPath(url),
    ts: ts,
    nonce: nonce,
    body_sha256: canonicalBodyDigest(body),
  };
}

/**
 * Produce signature/timestamp/nonce headers for an authenticated request.
 * @param {string} method
 * @param {string} url
 * @param {string} secret
 * @param {object|null} [body]
 * @param {number} [ts]
 * @param {string} [nonce]
 * @returns {object} headers
 */
function signRequest(method, url, secret, body = null, ts = null, nonce = null) {
  ts = ts == null ? Math.floor(Date.now() / 1000) : ts;
  nonce = nonce || crypto.randomBytes(16).toString("hex");
  const payload = _requestPayload(method, url, ts, nonce, body);
  return {
    [SIGNATURE_HEADER]: signPayload(payload, secret),
    [TIMESTAMP_HEADER]: String(ts),
    [NONCE_HEADER]: nonce,
  };
}

/**
 * Verify a replay-resistant request signature.
 * @returns {boolean}
 */
function verifyRequest(
  method, url, secret, signature, timestamp, nonce, body = null,
  maxSkewSeconds = 300, nonceStore = null
) {
  if (!signature || !timestamp || !nonce) return false;
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > maxSkewSeconds) return false;
  const payload = _requestPayload(method, url, ts, nonce, body);
  if (!verifySignature(payload, signature, secret)) return false;
  if (nonceStore && !nonceStore.addIfNew(nonce)) return false;
  return true;
}

/**
 * In-memory nonce cache with time-based expiry for replay detection.
 * Single-process only; back with a shared store for multi-instance use.
 */
class NonceStore {
  constructor(ttlSeconds = 600) {
    this.ttl = ttlSeconds;
    this._seen = new Map();
  }
  addIfNew(nonce) {
    const now = Date.now() / 1000;
    for (const [n, t] of this._seen) {
      if (now - t > this.ttl) this._seen.delete(n);
    }
    if (this._seen.has(nonce)) return false;
    this._seen.set(nonce, now);
    return true;
  }
}

/**
 * Create a signed ecosystem token for inter-service communication.
 * @param {string} secret
 * @param {string} serviceName
 * @param {number} ttlSeconds - Default 86400 (24 hours)
 * @returns {object}
 */
function createEcosystemToken(secret, serviceName, ttlSeconds = 86400) {
  const now = Math.floor(Date.now() / 1000);
  const token = generateSecureToken();
  const tokenData = {
    token: token,
    service: serviceName,
    issued_at: now,
    expires_at: now + ttlSeconds,
  };
  tokenData.signature = signPayload(
    {
      token: token,
      service: serviceName,
      issued_at: now,
      expires_at: now + ttlSeconds,
    },
    secret
  );
  return tokenData;
}

/**
 * Verify a signed ecosystem token is valid and not expired.
 * @param {object} tokenData
 * @param {string} secret
 * @returns {boolean}
 */
// Maximum acceptable token lifetime (issued_at -> expires_at), mirroring Python.
const MAX_TOKEN_LIFETIME_SECONDS = 172800; // 48h
const CLOCK_SKEW_SECONDS = 60;

function verifyEcosystemToken(tokenData, secret) {
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = tokenData.issued_at || 0;
  const expiresAt = tokenData.expires_at || 0;

  if (now > expiresAt) return false;
  if (issuedAt > now + CLOCK_SKEW_SECONDS) return false;
  if (expiresAt - issuedAt > MAX_TOKEN_LIFETIME_SECONDS) return false;

  const expectedPayload = {
    token: tokenData.token || "",
    service: tokenData.service || "",
    issued_at: issuedAt,
    expires_at: expiresAt,
  };
  return verifySignature(expectedPayload, tokenData.signature || "", secret);
}

/**
 * Deterministic JSON stringify with sorted keys and compact separators.
 * Matches Python: json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)
 * @param {*} obj
 * @returns {string}
 */
function stableStringify(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number" || typeof obj === "boolean") return JSON.stringify(obj);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => stableStringify(item)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    const parts = keys.map((key) => JSON.stringify(key) + ":" + stableStringify(obj[key]));
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(String(obj));
}

module.exports = {
  generateSecureToken,
  hashToken,
  verifyTokenHash,
  signPayload,
  verifySignature,
  createEcosystemToken,
  verifyEcosystemToken,
  stableStringify,
  canonicalPath,
  canonicalBodyDigest,
  signRequest,
  verifyRequest,
  NonceStore,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  NONCE_HEADER,
};
