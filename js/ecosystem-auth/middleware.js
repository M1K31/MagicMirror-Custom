/**
 * Express middleware for ecosystem authentication.
 * Mirrors the Python FastAPI middleware.
 */

const {
  verifyEcosystemToken,
  verifyRequest,
  NonceStore,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  NONCE_HEADER,
} = require("./tokens");

// Insecure development default. Mirrors Python's DEFAULT_DEV_SECRET.
const DEFAULT_DEV_SECRET = "dev-ecosystem-secret-change-in-production";

// Process-wide nonce cache for replay detection on the signature path.
const _nonceStore = new NonceStore();

/**
 * Get the shared HMAC secret from environment.
 *
 * Fail-closed everywhere: there is no default. Throws if ECOSYSTEM_HMAC_SECRET
 * is unset or set to the known development default, rather than silently
 * trusting a guessable key.
 * @returns {string}
 */
function getEcosystemSecret() {
  const secret = process.env.ECOSYSTEM_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      "ECOSYSTEM_HMAC_SECRET is not set. A shared secret is required (no default)."
    );
  }
  if (secret === DEFAULT_DEV_SECRET) {
    throw new Error(
      "Refusing the known development default secret. Set a unique ECOSYSTEM_HMAC_SECRET."
    );
  }
  return secret;
}

/**
 * Express middleware that validates ecosystem HMAC-signed requests.
 *
 * Checks X-Ecosystem-Signature header against JSON body,
 * or validates a Bearer token from the Authorization header.
 *
 * On success, sets req.ecosystemAuth with auth details.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireEcosystemAuth(req, res, next) {
  const secret = getEcosystemSecret();

  // Check HMAC signature header (replay-resistant request scheme).
  const signature = req.headers[SIGNATURE_HEADER.toLowerCase()];
  if (signature) {
    const timestamp = req.headers[TIMESTAMP_HEADER.toLowerCase()];
    const nonce = req.headers[NONCE_HEADER.toLowerCase()];
    const fullUrl = req.protocol + "://" + req.get("host") + req.originalUrl;

    const isBodyless = req.method === "GET" || req.method === "DELETE";
    const body = isBodyless ? {} : (req.body && typeof req.body === "object" ? req.body : {});

    if (
      !verifyRequest(req.method, fullUrl, secret, signature, timestamp, nonce, body, 300, _nonceStore)
    ) {
      return res
        .status(401)
        .json({ detail: "Invalid, stale, or replayed ecosystem signature" });
    }
    req.ecosystemAuth = { auth_method: "hmac", payload: body };
    return next();
  }

  // Check Bearer token (for service-to-service calls)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const tokenStr = authHeader.slice(7);
    let tokenData;
    try {
      tokenData = JSON.parse(tokenStr);
    } catch {
      return res.status(401).json({ detail: "Invalid token format" });
    }
    if (!verifyEcosystemToken(tokenData, secret)) {
      return res.status(401).json({ detail: "Invalid or expired ecosystem token" });
    }
    req.ecosystemAuth = { auth_method: "token", service: tokenData.service };
    return next();
  }

  return res.status(401).json({ detail: "Missing ecosystem authentication" });
}

module.exports = { requireEcosystemAuth, getEcosystemSecret };
