/**
 * Client for the shared ecosystem AI profile (JS mirror of Python's
 * AIProfileClient). Reads the ecosystem-wide LLM selection from the registry
 * and can write changes back, so a selection made in any app appears here too.
 * Requests are signed with the replay-resistant v0.3.0 scheme. Best-effort:
 * returns null when the registry is unreachable so the UI degrades gracefully.
 */

const { signRequest } = require("../ecosystem-auth/tokens");

class AIProfileClient {
  /**
   * @param {string} registryUrl
   * @param {{serviceName?: string, secret?: string, timeout?: number}} [opts]
   */
  constructor(registryUrl, opts = {}) {
    this.registryUrl = (registryUrl || "http://localhost:8500").replace(/\/+$/, "");
    this.serviceName = opts.serviceName || "";
    this.secret = opts.secret || process.env.ECOSYSTEM_HMAC_SECRET || "";
    this.timeout = opts.timeout || 5000;
  }

  _headers(method, url, body) {
    if (!this.secret) return {};
    return signRequest(method, url, this.secret, body);
  }

  /** Fetch the shared profile, or null if unreachable. */
  async fetch() {
    const url = `${this.registryUrl}/ai-profile`;
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: this._headers("GET", url, null),
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  /** Return just the ecosystem-wide selected model (or null). */
  async selectedModel() {
    const profile = await this.fetch();
    return profile ? profile.selected_model : null;
  }

  /** Write changes to the shared profile (propagates to all apps). */
  async update(changes) {
    const url = `${this.registryUrl}/ai-profile`;
    try {
      const resp = await fetch(url, {
        method: "PUT",
        headers: Object.assign(
          { "Content-Type": "application/json" },
          this._headers("PUT", url, changes)
        ),
        body: JSON.stringify(changes),
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }
}

module.exports = { AIProfileClient };
