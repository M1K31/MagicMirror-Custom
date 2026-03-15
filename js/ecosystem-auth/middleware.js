/**
 * Express middleware for ecosystem authentication.
 * Mirrors the Python FastAPI middleware.
 */

const { verifySignature, verifyEcosystemToken } = require("./tokens");

/**
 * Get the shared HMAC secret from environment.
 * @returns {string}
 */
function getEcosystemSecret() {
  return process.env.ECOSYSTEM_HMAC_SECRET || "dev-ecosystem-secret-change-in-production";
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

  // Check HMAC signature header (for webhook/event payloads)
  const signature = req.headers["x-ecosystem-signature"];
  if (signature) {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ detail: "Invalid JSON body" });
    }
    if (!verifySignature(req.body, signature, secret)) {
      return res.status(401).json({ detail: "Invalid ecosystem signature" });
    }
    req.ecosystemAuth = { auth_method: "hmac", payload: req.body };
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
