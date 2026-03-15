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

/**
 * Create a signed ecosystem token for inter-service communication.
 * @param {string} secret
 * @param {string} serviceName
 * @param {number} ttlSeconds - Default 86400 (24 hours)
 * @returns {object}
 */
function createEcosystemToken(secret, serviceName, ttlSeconds = 86400) {
  const now = Math.floor(Date.now() / 1000);
  const tokenData = {
    token: generateSecureToken(),
    service: serviceName,
    issued_at: now,
    expires_at: now + ttlSeconds,
  };
  tokenData.signature = signPayload(
    { service: serviceName, issued_at: now, expires_at: now + ttlSeconds },
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
function verifyEcosystemToken(tokenData, secret) {
  const now = Math.floor(Date.now() / 1000);
  if (now > (tokenData.expires_at || 0)) {
    return false;
  }
  const expectedPayload = {
    service: tokenData.service || "",
    issued_at: tokenData.issued_at || 0,
    expires_at: tokenData.expires_at || 0,
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
};
