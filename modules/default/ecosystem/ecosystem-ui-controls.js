/* @appecosystem/ui-controls v0.1.0 | MIT License | Smart Industries LLC (Mikel Smart) */
(function (global) {
  "use strict";
  var factories = {
"./model": function (module, exports, require) {
"use strict";

/**
 * Pure state, precedence, formatting, and validation models for @appecosystem/ui-controls.
 * Zero DOM dependencies so state transitions are deterministically unit-tested in Node.js.
 */

const ALWAYS_ENFORCED_INVARIANTS = Object.freeze([
    {
        id: "command_authentication",
        label: "Signed command authentication (HMAC-SHA256 / Ed25519)",
    },
    {
        id: "target_authorization_and_consent",
        label: "Target authorization & Zero-Breach-Toolkit baseline/AUP consent",
    },
    {
        id: "input_validation",
        label: "Strict input validation & Draft 2020-12 schema checks",
    },
    {
        id: "audit",
        label: "Immutable hash-chained audit logging",
    },
    {
        id: "freeze",
        label: "Emergency Freeze preemption from any authorized surface",
    },
    {
        id: "cloud_budget_and_data_boundary",
        label: "Cloud spend caps & sensitive data egress blocks",
    },
]);

const BYPASSED_GATES_DEFAULT = Object.freeze([
    "Interactive approval queue prompts (within selected scope)",
    "AI/automation confidence floor gates",
    "Action rate-limit & cooldown timers",
    "Scheduled maintenance window holds",
]);

const ACTION_CLASS_OPTIONS = Object.freeze([
    { id: "investigate", label: "Investigate (active scans & diagnostics)" },
    { id: "contain", label: "Contain (quarantine, block IP, lock node)" },
    { id: "remediate", label: "Remediate (restart service, rotate credentials)" },
    { id: "data_release", label: "Data Release (non-sensitive external export)" },
    { id: "system_change", label: "System Change (configuration & model updates)" },
]);

const DURATION_PRESETS = Object.freeze([
    { id: "15m", label: "15 minutes", seconds: 15 * 60 },
    { id: "30m", label: "30 minutes (Recommended)", seconds: 30 * 60 },
    { id: "1h", label: "1 hour", seconds: 60 * 60 },
    { id: "4h", label: "4 hours", seconds: 4 * 60 * 60 },
    { id: "until_revoked", label: "Until manually revoked", seconds: null },
]);

const AUTHORITY_LABELS = Object.freeze({
    hub_synced: "Hub Synced",
    standalone_local: "Standalone Local",
    lease_expired: "Hub Unreachable · Local Safe Defaults",
});

const MODE_LABELS = Object.freeze({
    normal: "Normal",
    incident: "Incident",
    survival: "Survival",
    freeze: "Freeze",
    maintenance: "Maintenance",
});

function formatRemainingDuration(remainingMs) {
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
        return "Expired";
    }
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    }
    return `${seconds}s`;
}

function summarizeDeviceSync(appliedList, pendingList, unreachableList, verb = "applied") {
    const applied = Array.isArray(appliedList) ? appliedList.filter(Boolean) : [];
    const pending = Array.isArray(pendingList) ? pendingList.filter(Boolean) : [];
    const unreachable = Array.isArray(unreachableList) ? unreachableList.filter(Boolean) : [];

    const parts = [];
    if (applied.length > 0) parts.push(`${applied.length} ${verb}`);
    if (pending.length > 0) parts.push(`${pending.length} pending`);
    if (unreachable.length > 0) parts.push(`${unreachable.length} unreachable`);

    return {
        applied,
        pending,
        unreachable,
        hasUnreachable: unreachable.length > 0,
        hasPending: pending.length > 0,
        summaryText: parts.length > 0 ? parts.join(" · ") : "Local node only",
    };
}

function summarizeScope(scope) {
    if (!scope || typeof scope !== "object") {
        return "No scope";
    }
    const apps = Array.isArray(scope.apps) && scope.apps.length ? scope.apps.join(", ") : "none";
    const devices = Array.isArray(scope.devices) && scope.devices.length ? scope.devices.join(", ") : "none";
    const actions =
        Array.isArray(scope.action_classes) && scope.action_classes.length
            ? scope.action_classes.join(", ")
            : "none";
    return `Apps: ${apps} · Devices: ${devices} · Actions: ${actions}`;
}

/**
 * Compute the effective UI view-model for <ecosystem-policy-bar>.
 *
 * Security & HIG invariants enforced here:
 * 1. Freeze ALWAYS supersedes Restrictions: Off (Scoped).
 * 2. Timed overrides whose expires_at <= nowMs immediately revert to Restrictions: On.
 * 3. viewMode === "ambient" strips all privileged controls (override, restore, resume)
 *    while preserving status visibility and Freeze request capability.
 * 4. Unreachable devices are explicitly surfaced and never merged into applied/acknowledged counts.
 *
 * @param {object|null} rawState
 * @param {{viewMode?: "admin"|"ambient", nowMs?: number}} [opts]
 */
function computeEffectivePolicyBanner(rawState, opts = {}) {
    const state = rawState && typeof rawState === "object" ? rawState : {};
    const viewMode = opts.viewMode === "ambient" ? "ambient" : "admin";
    const nowMs = opts.nowMs == null ? Date.now() : Number(opts.nowMs);
    const isAdmin = viewMode === "admin";

    const modeKey = MODE_LABELS[state.mode] ? state.mode : "normal";
    const authorityKey = AUTHORITY_LABELS[state.authority] ? state.authority : "standalone_local";
    const authorityLabel = AUTHORITY_LABELS[authorityKey];
    const isFrozen = Boolean(state.frozen) || modeKey === "freeze";

    // Evaluate whether an active_override exists and is still unexpired.
    const ov = state.active_override && typeof state.active_override === "object"
        ? state.active_override
        : null;
    let overrideActive = false;
    let overrideExpired = false;
    let remainingMs = null;
    let countdownText = null;

    if (ov && state.restrictions === "off_scoped") {
        if (ov.expires_at) {
            const expMs = Date.parse(ov.expires_at);
            if (Number.isFinite(expMs)) {
                if (nowMs >= expMs) {
                    overrideExpired = true;
                    overrideActive = false;
                } else {
                    overrideActive = true;
                    remainingMs = expMs - nowMs;
                    countdownText = `${formatRemainingDuration(remainingMs)} remaining`;
                }
            }
        } else {
            overrideActive = true;
            countdownText = "Until manually revoked";
        }
    }

    // Precedence 1: FROZEN always wins.
    if (isFrozen) {
        const fi = state.freeze_info && typeof state.freeze_info === "object"
            ? state.freeze_info
            : {};
        const sync = summarizeDeviceSync(
            fi.acknowledged_devices,
            fi.pending_devices,
            fi.unreachable_devices,
            "frozen"
        );
        const initiator = fi.initiated_by ? `by ${fi.initiated_by}` : "by operator";
        const reason = fi.reason ? ` — ${fi.reason}` : "";
        const suspendedNote = overrideActive
            ? " · Scoped override suspended while frozen"
            : "";

        return {
            effectiveState: "frozen",
            severity: "critical",
            icon: "shield-octagon",
            badgeText: "FROZEN",
            headline: "Emergency Freeze Active — Mutating automations & commands halted",
            detailText: `Initiated ${initiator}${reason}${suspendedNote}`,
            modeLabel: MODE_LABELS.freeze,
            authorityKey,
            authorityLabel,
            countdownText: null,
            remainingMs: null,
            scopeText: ov ? summarizeScope(ov.scope) : null,
            deviceSync: sync,
            overrideSuspended: overrideActive,
            overrideExpired,
            viewMode,
            actions: {
                canFreeze: false,
                canResume: isAdmin,
                canManageRestrictions: false,
                canRestoreRestrictions: isAdmin && overrideActive,
            },
        };
    }

    // Precedence 2: Scoped Restrictions Off (active & unexpired).
    if (overrideActive && ov) {
        const sync = summarizeDeviceSync(
            ov.applied_devices,
            ov.pending_devices,
            ov.unreachable_devices,
            "applied"
        );
        const scopeText = summarizeScope(ov.scope);
        return {
            effectiveState: "restrictions_off_scoped",
            severity: "warning",
            icon: "lock-open-clock",
            badgeText: "RESTRICTIONS: OFF (SCOPED)",
            headline: `${countdownText} · ${scopeText}`,
            detailText: `Authorized by ${ov.issued_by} (${ov.reason}) · Core safety invariants remain enforced`,
            modeLabel: MODE_LABELS[modeKey],
            authorityKey,
            authorityLabel,
            countdownText,
            remainingMs,
            scopeText,
            deviceSync: sync,
            overrideSuspended: false,
            overrideExpired: false,
            viewMode,
            actions: {
                canFreeze: true,
                canResume: false,
                canManageRestrictions: isAdmin,
                canRestoreRestrictions: isAdmin,
            },
        };
    }

    // Precedence 3: Restrictions On (default fail-closed posture).
    const expiryNotice = overrideExpired
        ? "Previous scoped override expired — restrictions automatically restored."
        : authorityKey === "lease_expired"
            ? "Hub lease expired — enforcing local fail-closed restrictions."
            : "All policy gates, approvals, and safety invariants enforced.";

    return {
        effectiveState: "restrictions_on",
        severity: authorityKey === "lease_expired" ? "warning" : "normal",
        icon: "lock-shield",
        badgeText: "RESTRICTIONS: ON",
        headline: `Mode: ${MODE_LABELS[modeKey]} · ${authorityLabel}`,
        detailText: expiryNotice,
        modeLabel: MODE_LABELS[modeKey],
        authorityKey,
        authorityLabel,
        countdownText: null,
        remainingMs: null,
        scopeText: null,
        deviceSync: summarizeDeviceSync([], [], []),
        overrideSuspended: false,
        overrideExpired,
        viewMode,
        actions: {
            canFreeze: true,
            canResume: false,
            canManageRestrictions: isAdmin,
            canRestoreRestrictions: false,
        },
    };
}

/**
 * Validate an operator's scoped restriction override submission.
 * Never permits global/unscoped "everything off" or missing step-up authentication.
 */
function validateOverrideForm(input = {}, nowMs = Date.now()) {
    const errors = [];
    const apps = Array.isArray(input.apps)
        ? input.apps.map((s) => String(s).trim()).filter(Boolean)
        : [];
    const devices = Array.isArray(input.devices)
        ? input.devices.map((s) => String(s).trim()).filter(Boolean)
        : [];
    const actionClasses = Array.isArray(input.actionClasses)
        ? input.actionClasses.map((s) => String(s).trim()).filter(Boolean)
        : [];

    if (apps.length === 0) {
        errors.push("Select at least one target application.");
    }
    if (devices.length === 0) {
        errors.push("Select at least one target device.");
    }
    if (actionClasses.length === 0) {
        errors.push("Select at least one action class to include in the override scope.");
    }

    const allowedActionIds = new Set(ACTION_CLASS_OPTIONS.map((a) => a.id));
    for (const ac of actionClasses) {
        if (!allowedActionIds.has(ac)) {
            errors.push(`Unsupported action class: ${ac}`);
        }
    }

    const durationPreset = DURATION_PRESETS.find((d) => d.id === (input.duration || "30m"));
    if (!durationPreset) {
        errors.push("Select a valid override duration.");
    } else if (durationPreset.id === "until_revoked" && input.confirmUntilRevoked !== true) {
        errors.push("Explicit confirmation is required for an 'Until manually revoked' override.");
    }

    const reason = String(input.reason || "").trim();
    if (reason.length < 8) {
        errors.push("Provide an audit reason of at least 8 characters.");
    }

    const stepUpMethod = input.stepUpMethod === "passkey" ? "passkey" : "totp";
    const credential = String(input.stepUpCredential || "").trim();
    if (stepUpMethod === "totp") {
        if (!/^\d{6,8}$/.test(credential)) {
            errors.push("Enter a valid 6-to-8 digit TOTP verification code.");
        }
    } else if (!credential || credential.length < 8) {
        errors.push("Complete Passkey (WebAuthn) verification before applying override.");
    }

    if (errors.length > 0) {
        return { valid: false, errors, payload: null };
    }

    const issuedAtIso = new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, "Z");
    const expiresAtIso =
        durationPreset.seconds != null
            ? new Date(nowMs + durationPreset.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
            : null;

    return {
        valid: true,
        errors: [],
        payload: {
            scope: {
                apps,
                devices,
                action_classes: actionClasses,
            },
            duration_id: durationPreset.id,
            duration_seconds: durationPreset.seconds,
            issued_at: issuedAtIso,
            expires_at: expiresAtIso,
            reason,
            step_up: {
                method: stepUpMethod,
                credential,
            },
            bypassed: BYPASSED_GATES_DEFAULT.slice(),
            always_enforced: ALWAYS_ENFORCED_INVARIANTS.map((item) => item.id),
        },
    };
}

function computeFreezeButtonState(opts = {}) {
    const frozen = Boolean(opts.frozen);
    const viewMode = opts.viewMode === "ambient" ? "ambient" : "admin";
    const confirmTap = Boolean(opts.confirmTap);
    const armed = Boolean(opts.armed);

    if (frozen) {
        if (viewMode === "admin") {
            return {
                mode: "resume",
                icon: "play-shield",
                label: "Frozen · Resume...",
                ariaLabel: "Ecosystem is frozen. Activate to open step-up resume verification.",
                disabled: false,
                severity: "critical",
            };
        }
        return {
            mode: "frozen_ambient",
            icon: "shield-octagon",
            label: "Ecosystem Frozen",
            ariaLabel: "Ecosystem is frozen. Resume requires an authenticated administrator dashboard.",
            disabled: true,
            severity: "critical",
        };
    }

    if (confirmTap && armed) {
        return {
            mode: "armed",
            icon: "shield-octagon",
            label: "Tap Again to Freeze",
            ariaLabel: "Confirm Emergency Freeze: activate within 3 seconds to halt mutating actions.",
            disabled: false,
            severity: "critical",
        };
    }

    return {
        mode: "ready",
        icon: "octagon-pause",
        label: "Freeze",
        ariaLabel: "Emergency Freeze: immediately halt all mutating ecosystem automations and commands.",
        disabled: false,
        severity: "danger",
    };
}

const MIC_STATES = new Set([
    "muted",
    "push_to_talk",
    "listening",
    "processing",
    "unavailable",
]);

function computeMicPillState(opts = {}) {
    const rawState = MIC_STATES.has(opts.state) ? opts.state : "muted";
    const unavailableReason = String(opts.unavailableReason || "").trim();
    const backendLabel = String(opts.backendLabel || "Local Whisper").trim();

    if (rawState === "unavailable") {
        return {
            state: "unavailable",
            isMuted: true,
            canToggleMute: false,
            canPushToTalk: false,
            icon: "mic-off",
            statusLabel: unavailableReason || "Voice Unavailable",
            privacyCaption: `${backendLabel} · No audio retained`,
        };
    }

    if (rawState === "muted") {
        return {
            state: "muted",
            isMuted: true,
            canToggleMute: true,
            canPushToTalk: false,
            icon: "mic-off",
            statusLabel: "Mic Muted",
            privacyCaption: `${backendLabel} · No audio retained`,
        };
    }

    if (rawState === "listening") {
        return {
            state: "listening",
            isMuted: false,
            canToggleMute: true,
            canPushToTalk: true,
            icon: "mic-live",
            statusLabel: "Listening locally...",
            privacyCaption: `${backendLabel} · No audio retained`,
        };
    }

    if (rawState === "processing") {
        return {
            state: "processing",
            isMuted: false,
            canToggleMute: true,
            canPushToTalk: false,
            icon: "waveform",
            statusLabel: "Transcribing on-device...",
            privacyCaption: `${backendLabel} · No audio retained`,
        };
    }

    return {
        state: "push_to_talk",
        isMuted: false,
        canToggleMute: true,
        canPushToTalk: true,
        icon: "mic-ready",
        statusLabel: "Hold to Speak",
        privacyCaption: `${backendLabel} · No audio retained`,
    };
}

module.exports = {
    ALWAYS_ENFORCED_INVARIANTS,
    BYPASSED_GATES_DEFAULT,
    ACTION_CLASS_OPTIONS,
    DURATION_PRESETS,
    AUTHORITY_LABELS,
    MODE_LABELS,
    formatRemainingDuration,
    summarizeDeviceSync,
    summarizeScope,
    computeEffectivePolicyBanner,
    validateOverrideForm,
    computeFreezeButtonState,
    computeMicPillState,
};

},
"./styles": function (module, exports, require) {
"use strict";

/**
 * Apple HIG Shadow DOM design stylesheet and crisp inline SVG icon map.
 * Consumes CSS custom properties defined in theme/ecosystem-theme.css with
 * high-contrast fallbacks so components work standalone or themed.
 */

const ICONS = Object.freeze({
    "lock-shield": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.2 16 4.8v4.7c0 4.1-2.6 7.3-6 8.6-3.4-1.3-6-4.5-6-8.6V4.8L10 2.2Z"/><rect x="7.5" y="9.2" width="5" height="4" rx="1"/><path d="M8.5 9.2V7.8a1.5 1.5 0 0 1 3 0v1.4"/></svg>`,
    "lock-open-clock": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="9" width="9" height="7.5" rx="1.6"/><path d="M5.5 9V6.2a2.6 2.6 0 0 1 5.1-.6"/><circle cx="15" cy="14" r="3.5"/><path d="M15 12.4V14l1.1.8"/></svg>`,
    "shield-octagon": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6.6 2.2 13.4 2.2 17.8 6.6 17.8 13.4 13.4 17.8 6.6 17.8 2.2 13.4 2.2 6.6"/><path d="M10 6.2v4.3"/><circle cx="10" cy="13.5" r="0.7" fill="currentColor"/></svg>`,
    "octagon-pause": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6.6 2.2 13.4 2.2 17.8 6.6 17.8 13.4 13.4 17.8 6.6 17.8 2.2 13.4 2.2 6.6"/><path d="M8.3 7.5v5M11.7 7.5v5"/></svg>`,
    "play-shield": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.2 16 4.8v4.7c0 4.1-2.6 7.3-6 8.6-3.4-1.3-6-4.5-6-8.6V4.8L10 2.2Z"/><polygon points="8.6 7.6 12.8 10 8.6 12.4" fill="currentColor" stroke="none"/></svg>`,
    "mic-off": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l14 14"/><path d="M12.5 8.8V6a2.5 2.5 0 0 0-4.6-1.3"/><path d="M7.5 7.5V10a2.5 2.5 0 0 0 4.2 1.8"/><path d="M5 10a5 5 0 0 0 8.3 3.7M10 15v2.8M7.2 17.8h5.6"/></svg>`,
    "mic-ready": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7.5" y="3" width="5" height="9" rx="2.5"/><path d="M5 9.8a5 5 0 0 0 10 0M10 14.8v3M7.2 17.8h5.6"/></svg>`,
    "mic-live": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7.5" y="3" width="5" height="9" rx="2.5" fill="currentColor" fill-opacity="0.25"/><path d="M5 9.8a5 5 0 0 0 10 0M10 14.8v3M7.2 17.8h5.6"/></svg>`,
    "waveform": `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 10h1.5M7 6v8M10 4v12M13 7v6M15.5 10H17"/></svg>`,
});

const SHARED_STYLES = `
:host {
  display: block;
  box-sizing: border-box;
  font-family: var(--font-body, 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  color: var(--text-primary, hsl(220, 20%, 96%));
  --_touch-min: var(--touch-target-min, 44px);
  --_radius-sm: var(--radius-sm, 6px);
  --_radius-md: var(--radius-md, 12px);
  --_radius-lg: var(--radius-lg, 20px);
  --_radius-pill: var(--radius-pill, 9999px);
  --_bg-panel: var(--bg-panel, hsl(220, 16%, 13%));
  --_bg-input: var(--bg-input, hsl(220, 14%, 18%));
  --_bg-hover: var(--bg-hover, hsl(220, 15%, 22%));
  --_glass-bg: var(--glass-bg, hsla(220, 16%, 13%, 0.78));
  --_glass-blur: var(--glass-blur, blur(20px));
  --_glass-border: var(--glass-border, hsla(220, 20%, 96%, 0.12));
  --_text-primary: var(--text-primary, hsl(220, 20%, 96%));
  --_text-secondary: var(--text-secondary, hsl(220, 10%, 75%));
  --_text-tertiary: var(--text-tertiary, hsl(220, 8%, 58%));
  --_accent: var(--color-accent, hsl(210, 100%, 52%));
  --_success: var(--color-success, hsl(120, 60%, 48%));
  --_warning: var(--color-warning, hsl(35, 100%, 55%));
  --_error: var(--color-error, hsl(0, 85%, 60%));
  --_ease: var(--anim-ease, cubic-bezier(0.16, 1, 0.3, 1));
  --_fast: var(--anim-fast, 0.14s);
}

*, *::before, *::after {
  box-sizing: border-box;
}

:focus-visible {
  outline: 2px solid var(--_accent);
  outline-offset: 2px;
}

.policy-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 0.5rem 1rem;
  min-height: 52px;
  background: var(--_glass-bg);
  backdrop-filter: var(--_glass-blur);
  -webkit-backdrop-filter: var(--_glass-blur);
  border-bottom: 1px solid var(--_glass-border);
  transition: background-color 0.25s var(--_ease), border-color 0.25s var(--_ease);
}

.policy-bar[data-state="restrictions_off_scoped"] {
  border-bottom: 2px solid var(--_warning);
  background: linear-gradient(90deg, hsla(35, 100%, 50%, 0.16), var(--_glass-bg) 55%);
}

.policy-bar[data-state="frozen"] {
  border-bottom: 2px solid var(--_error);
  background: linear-gradient(90deg, hsla(0, 85%, 55%, 0.22), var(--_glass-bg) 65%);
}

.status-cluster {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  flex: 1 1 320px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border-radius: var(--_radius-pill);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  border: 1px solid var(--_glass-border);
  background: var(--_bg-input);
  color: var(--_text-primary);
}

.badge[data-severity="normal"] {
  border-color: hsla(120, 60%, 48%, 0.45);
  color: var(--_success);
}

.badge[data-severity="warning"] {
  border-color: hsla(35, 100%, 55%, 0.6);
  color: var(--_warning);
}

.badge[data-severity="critical"] {
  border-color: hsla(0, 85%, 60%, 0.75);
  background: hsla(0, 85%, 52%, 0.2);
  color: var(--_error);
}

.copy-stack {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.headline {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--_text-primary);
  line-height: 1.3;
}

.detail {
  font-size: 0.76rem;
  color: var(--_text-secondary);
  line-height: 1.3;
}

.sync-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.6rem;
  border-radius: var(--_radius-pill);
  font-size: 0.74rem;
  color: var(--_text-secondary);
  background: var(--_bg-input);
  border: 1px solid var(--_glass-border);
  white-space: nowrap;
}

.sync-pill[data-unreachable="true"] {
  border-color: var(--_warning);
  color: var(--_warning);
  font-weight: 600;
}

.actions-cluster {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

button.hig-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: var(--_touch-min);
  min-width: var(--_touch-min);
  padding: 0 0.95rem;
  border-radius: var(--_radius-md);
  border: 1px solid var(--_glass-border);
  background: var(--_bg-input);
  color: var(--_text-primary);
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--_fast) var(--_ease), background-color var(--_fast) var(--_ease), border-color var(--_fast) var(--_ease);
}

button.hig-btn:hover:not(:disabled) {
  background: var(--_bg-hover);
}

button.hig-btn:active:not(:disabled) {
  transform: scale(0.98);
}

button.hig-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

button.hig-btn[data-variant="primary"] {
  background: var(--_accent);
  border-color: transparent;
  color: #ffffff;
}

button.hig-btn[data-variant="restore"] {
  background: hsla(120, 60%, 42%, 0.2);
  border-color: var(--_success);
  color: var(--_text-primary);
}

button.hig-btn[data-variant="danger"],
button.hig-btn[data-variant="critical"] {
  background: hsla(0, 85%, 52%, 0.18);
  border-color: var(--_error);
  color: var(--_text-primary);
}

button.hig-btn[data-variant="critical"] {
  background: var(--_error);
  color: #ffffff;
}

/* Modal Backdrop & HIG Sheet */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: hsla(220, 25%, 5%, 0.66);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.modal-backdrop[hidden] {
  display: none !important;
}

.modal-sheet {
  width: min(680px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: var(--_bg-panel);
  border: 1px solid var(--_glass-border);
  border-radius: var(--_radius-lg);
  padding: 1.5rem;
  box-shadow: var(--shadow-lg, 0 16px 36px rgba(0, 0, 0, 0.45));
}

.modal-title {
  margin: 0 0 0.35rem 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.modal-subtitle {
  margin: 0 0 1.1rem 0;
  font-size: 0.86rem;
  color: var(--_text-secondary);
}

.invariant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 0.85rem;
  margin-bottom: 1.1rem;
}

.inset-card {
  padding: 0.85rem 1rem;
  border-radius: var(--_radius-md);
  background: var(--_bg-input);
  border: 1px solid var(--_glass-border);
}

.inset-card h4 {
  margin: 0 0 0.45rem 0;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.inset-card[data-kind="bypassed"] h4 {
  color: var(--_warning);
}

.inset-card[data-kind="enforced"] h4 {
  color: var(--_success);
}

.inset-card ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  color: var(--_text-secondary);
  line-height: 1.45;
}

.field-group {
  margin-bottom: 1rem;
}

.field-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
}

.pill-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

label.check-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: var(--_touch-min);
  padding: 0 0.8rem;
  border-radius: var(--_radius-md);
  background: var(--_bg-input);
  border: 1px solid var(--_glass-border);
  font-size: 0.82rem;
  cursor: pointer;
}

input.text-input,
select.select-input {
  width: 100%;
  min-height: var(--_touch-min);
  padding: 0 0.8rem;
  border-radius: var(--_radius-md);
  border: 1px solid var(--_glass-border);
  background: var(--_bg-input);
  color: var(--_text-primary);
  font-family: inherit;
  font-size: 0.88rem;
}

.error-box {
  margin: 0.75rem 0;
  padding: 0.75rem 0.9rem;
  border-radius: var(--_radius-md);
  background: hsla(0, 85%, 52%, 0.16);
  border: 1px solid var(--_error);
  color: var(--_text-primary);
  font-size: 0.82rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.2rem;
}

/* Mic Pill */
.mic-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--_radius-pill);
  background: var(--_glass-bg);
  border: 1px solid var(--_glass-border);
}

.mic-meta {
  display: flex;
  flex-direction: column;
  padding: 0 0.35rem;
}

.mic-status {
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.2;
}

.mic-privacy {
  font-size: 0.68rem;
  color: var(--_text-tertiary);
  line-height: 1.2;
}

.mic-pill[data-state="listening"] {
  border-color: var(--_accent);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.001ms !important;
    animation-duration: 0.001ms !important;
  }
}
`;

function renderIcon(name) {
    return ICONS[name] || ICONS["lock-shield"];
}

module.exports = {
    ICONS,
    SHARED_STYLES,
    renderIcon,
};

},
"./components": function (module, exports, require) {
"use strict";

const {
    ALWAYS_ENFORCED_INVARIANTS,
    BYPASSED_GATES_DEFAULT,
    ACTION_CLASS_OPTIONS,
    DURATION_PRESETS,
    computeEffectivePolicyBanner,
    validateOverrideForm,
    computeFreezeButtonState,
    computeMicPillState,
} = require("./model");
const { SHARED_STYLES, renderIcon } = require("./styles");

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Define and optionally register the 4 ecosystem Web Components against a
 * CustomElementRegistry + HTMLElement constructor (browser globals by default,
 * or lightweight test doubles in Node unit tests).
 */
function createComponentClasses(BaseElement) {
    class EcosystemFreezeButton extends BaseElement {
        static get observedAttributes() {
            return ["frozen", "view-mode", "confirm-tap"];
        }

        constructor() {
            super();
            this._armed = false;
            this._armTimer = null;
            this.attachShadow({ mode: "open" });
        }

        connectedCallback() {
            this.render();
        }

        disconnectedCallback() {
            this._clearArmTimer();
        }

        attributeChangedCallback() {
            if (this.hasAttribute("frozen")) {
                this._armed = false;
                this._clearArmTimer();
            }
            this.render();
        }

        _clearArmTimer() {
            if (this._armTimer) {
                clearTimeout(this._armTimer);
                this._armTimer = null;
            }
        }

        _handleClick() {
            const frozen = this.hasAttribute("frozen") && this.getAttribute("frozen") !== "false";
            const viewMode = this.getAttribute("view-mode") === "ambient" ? "ambient" : "admin";
            const confirmTap = this.hasAttribute("confirm-tap") && this.getAttribute("confirm-tap") !== "false";

            if (frozen) {
                if (viewMode === "admin") {
                    this.dispatchEvent(
                        new CustomEvent("ecosystem-resume-request", {
                            bubbles: true,
                            composed: true,
                            detail: { requestedAt: Date.now() },
                        })
                    );
                }
                return;
            }

            if (confirmTap && !this._armed) {
                this._armed = true;
                this._clearArmTimer();
                this._armTimer = setTimeout(() => {
                    this._armed = false;
                    this.render();
                }, 3000);
                this.render();
                // render() replaces the focused trigger; restore focus so a
                // keyboard user's second Enter/Space confirms Freeze.
                this.shadowRoot.querySelector('[data-action="freeze-trigger"]')?.focus();
                return;
            }

            this._armed = false;
            this._clearArmTimer();
            this.render();
            this.dispatchEvent(
                new CustomEvent("ecosystem-freeze-request", {
                    bubbles: true,
                    composed: true,
                    detail: {
                        viewMode,
                        requestedAt: Date.now(),
                    },
                })
            );
        }

        render() {
            const frozen = this.hasAttribute("frozen") && this.getAttribute("frozen") !== "false";
            const viewMode = this.getAttribute("view-mode") === "ambient" ? "ambient" : "admin";
            const confirmTap = this.hasAttribute("confirm-tap") && this.getAttribute("confirm-tap") !== "false";
            const vm = computeFreezeButtonState({
                frozen,
                viewMode,
                confirmTap,
                armed: this._armed,
            });

            this.shadowRoot.innerHTML = `
                <style>${SHARED_STYLES}</style>
                <button
                    type="button"
                    class="hig-btn"
                    data-action="freeze-trigger"
                    data-variant="${escapeHtml(vm.severity)}"
                    aria-label="${escapeHtml(vm.ariaLabel)}"
                    ${vm.disabled ? "disabled" : ""}
                >
                    ${renderIcon(vm.icon)}
                    <span>${escapeHtml(vm.label)}</span>
                </button>
            `;
            const btn = this.shadowRoot.querySelector('[data-action="freeze-trigger"]');
            if (btn) {
                btn.addEventListener("click", () => this._handleClick());
            }
        }
    }

    class EcosystemPolicyBar extends BaseElement {
        static get observedAttributes() {
            return ["view-mode", "policy-state", "confirm-freeze-tap"];
        }

        constructor() {
            super();
            this._policyState = null;
            this._tickTimer = null;
            this._notifiedExpiryForGrant = null;
            this.attachShadow({ mode: "open" });
        }

        get policyState() {
            if (this._policyState) return this._policyState;
            const attr = this.getAttribute("policy-state");
            if (attr) {
                try {
                    return JSON.parse(attr);
                } catch {
                    return null;
                }
            }
            return null;
        }

        set policyState(nextState) {
            this._policyState = nextState && typeof nextState === "object" ? nextState : null;
            this._syncCountdownTimer();
            this.render();
        }

        connectedCallback() {
            this._syncCountdownTimer();
            this.render();
        }

        disconnectedCallback() {
            this._stopCountdownTimer();
        }

        attributeChangedCallback(name) {
            if (name === "policy-state") {
                this._policyState = null;
                this._syncCountdownTimer();
            }
            this.render();
        }

        _stopCountdownTimer() {
            if (this._tickTimer) {
                clearInterval(this._tickTimer);
                this._tickTimer = null;
            }
        }

        _syncCountdownTimer() {
            this._stopCountdownTimer();
            const st = this.policyState;
            if (
                st &&
                !st.frozen &&
                st.restrictions === "off_scoped" &&
                st.active_override &&
                st.active_override.expires_at
            ) {
                this._tickTimer = setInterval(() => this.render(), 1000);
            }
        }

        render() {
            const viewMode = this.getAttribute("view-mode") === "ambient" ? "ambient" : "admin";
            const raw = this.policyState;
            const vm = computeEffectivePolicyBanner(raw, { viewMode });

            if (vm.overrideExpired && raw && raw.active_override) {
                const grantId = raw.active_override.grant_id || "expired";
                if (this._notifiedExpiryForGrant !== grantId) {
                    this._notifiedExpiryForGrant = grantId;
                    this._stopCountdownTimer();
                    this.dispatchEvent(
                        new CustomEvent("ecosystem-override-expired", {
                            bubbles: true,
                            composed: true,
                            detail: { grantId },
                        })
                    );
                }
            }

            const showSync =
                vm.effectiveState === "frozen" ||
                vm.effectiveState === "restrictions_off_scoped" ||
                vm.deviceSync.hasUnreachable;

            const syncHtml = showSync
                ? `<span class="sync-pill" data-unreachable="${vm.deviceSync.hasUnreachable ? "true" : "false"}">${escapeHtml(vm.deviceSync.summaryText)}</span>`
                : "";

            const restoreBtn = vm.actions.canRestoreRestrictions
                ? `<button type="button" class="hig-btn" data-action="restore" data-variant="restore">Restore Restrictions</button>`
                : "";

            const manageBtn = vm.actions.canManageRestrictions
                ? `<button type="button" class="hig-btn" data-action="manage">${vm.effectiveState === "restrictions_off_scoped" ? "Inspect Scope..." : "Manage Restrictions..."}</button>`
                : "";

            const resumeBtn = vm.actions.canResume
                ? `<button type="button" class="hig-btn" data-action="resume" data-variant="primary">${renderIcon("play-shield")}<span>Resume Operations...</span></button>`
                : "";

            const confirmTapAttr =
                viewMode === "ambient" || this.hasAttribute("confirm-freeze-tap")
                    ? 'confirm-tap="true"'
                    : "";

            const freezeBtn = vm.actions.canFreeze
                ? `<ecosystem-freeze-button view-mode="${escapeHtml(viewMode)}" ${confirmTapAttr}></ecosystem-freeze-button>`
                : viewMode === "ambient" && vm.effectiveState === "frozen"
                    ? `<ecosystem-freeze-button frozen="true" view-mode="ambient"></ecosystem-freeze-button>`
                    : "";

            this.shadowRoot.innerHTML = `
                <style>${SHARED_STYLES}</style>
                <div class="policy-bar" role="region" aria-label="Ecosystem Policy & Safety Status" data-state="${escapeHtml(vm.effectiveState)}">
                    <div class="status-cluster" role="status" aria-live="polite">
                        <span class="badge" data-severity="${escapeHtml(vm.severity)}">
                            ${renderIcon(vm.icon)}
                            <span>${escapeHtml(vm.badgeText)}</span>
                        </span>
                        <div class="copy-stack">
                            <span class="headline">${escapeHtml(vm.headline)}</span>
                            <span class="detail">${escapeHtml(vm.detailText)}</span>
                        </div>
                        ${syncHtml}
                    </div>
                    <div class="actions-cluster">
                        ${restoreBtn}
                        ${manageBtn}
                        ${resumeBtn}
                        ${freezeBtn}
                    </div>
                </div>
            `;

            const onBtn = (selector, eventName) => {
                const el = this.shadowRoot.querySelector(selector);
                if (el) {
                    el.addEventListener("click", () => {
                        this.dispatchEvent(
                            new CustomEvent(eventName, {
                                bubbles: true,
                                composed: true,
                                detail: { effectiveState: vm.effectiveState, requestedAt: Date.now() },
                            })
                        );
                    });
                }
            };
            onBtn('[data-action="restore"]', "ecosystem-restore-restrictions");
            onBtn('[data-action="manage"]', "ecosystem-manage-restrictions");
            onBtn('[data-action="resume"]', "ecosystem-resume-request");
        }
    }

    class EcosystemOverrideModal extends BaseElement {
        static get observedAttributes() {
            return ["open"];
        }

        constructor() {
            super();
            this._availableApps = ["openeye", "aegissiem", "cyber-agents", "ai-for-survival"];
            this._availableDevices = ["local-device"];
            this._errors = [];
            this._stepUpMethod = "totp";
            this._passkeyAssertion = "";
            this._selectedDuration = "30m";
            this.attachShadow({ mode: "open" });
            this._onKeyDown = (ev) => {
                if (ev.key === "Escape" && this.hasAttribute("open")) {
                    this.close();
                }
            };
        }

        set availableApps(list) {
            // Accept an empty array so clearing the inventory (discovery returned
            // no targets) actually clears the modal instead of keeping stale items.
            if (Array.isArray(list)) {
                this._availableApps = list.map(String);
                this.render();
            }
        }

        get availableApps() {
            return this._availableApps;
        }

        set availableDevices(list) {
            if (Array.isArray(list)) {
                this._availableDevices = list.map(String);
                this.render();
            }
        }

        get availableDevices() {
            return this._availableDevices;
        }

        setPasskeyAssertion(assertionToken) {
            this._stepUpMethod = "passkey";
            this._passkeyAssertion = String(assertionToken || "");
            this._errors = [];
            this.render();
        }

        open() {
            this._errors = [];
            this.setAttribute("open", "true");
        }

        close() {
            this.removeAttribute("open");
            this.dispatchEvent(
                new CustomEvent("ecosystem-override-cancel", { bubbles: true, composed: true })
            );
        }

        connectedCallback() {
            if (typeof window !== "undefined" && window.addEventListener) {
                window.addEventListener("keydown", this._onKeyDown);
            }
            this.render();
        }

        disconnectedCallback() {
            if (typeof window !== "undefined" && window.removeEventListener) {
                window.removeEventListener("keydown", this._onKeyDown);
            }
        }

        attributeChangedCallback() {
            this.render();
        }

        _collectAndSubmit() {
            const root = this.shadowRoot;
            const checkedValues = (name) =>
                Array.from(root.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);

            const durationEl = root.querySelector('select[name="duration"]');
            const reasonEl = root.querySelector('input[name="reason"]');
            const totpEl = root.querySelector('input[name="totp_code"]');
            const confirmUnboundedEl = root.querySelector('input[name="confirm_until_revoked"]');

            const duration = durationEl ? durationEl.value : this._selectedDuration;
            const stepUpCredential =
                this._stepUpMethod === "passkey"
                    ? this._passkeyAssertion
                    : totpEl
                        ? totpEl.value
                        : "";

            const result = validateOverrideForm({
                apps: checkedValues("apps"),
                devices: checkedValues("devices"),
                actionClasses: checkedValues("action_classes"),
                duration,
                confirmUntilRevoked: Boolean(confirmUnboundedEl && confirmUnboundedEl.checked),
                reason: reasonEl ? reasonEl.value : "",
                stepUpMethod: this._stepUpMethod,
                stepUpCredential,
            });

            if (!result.valid) {
                this._errors = result.errors;
                this.render();
                return;
            }

            this._errors = [];
            this.removeAttribute("open");
            this.dispatchEvent(
                new CustomEvent("ecosystem-override-submit", {
                    bubbles: true,
                    composed: true,
                    detail: result.payload,
                })
            );
        }

        render() {
            const isOpen = this.hasAttribute("open") && this.getAttribute("open") !== "false";
            const bypassedItems = BYPASSED_GATES_DEFAULT.map(
                (item) => `<li>${escapeHtml(item)}</li>`
            ).join("");
            const enforcedItems = ALWAYS_ENFORCED_INVARIANTS.map(
                (item) => `<li>${escapeHtml(item.label)}</li>`
            ).join("");

            const appPills = this._availableApps
                .map(
                    (app) => `
                    <label class="check-pill">
                        <input type="checkbox" name="apps" value="${escapeHtml(app)}" />
                        <span>${escapeHtml(app)}</span>
                    </label>`
                )
                .join("");

            const devicePills = this._availableDevices
                .map(
                    (dev, idx) => `
                    <label class="check-pill">
                        <input type="checkbox" name="devices" value="${escapeHtml(dev)}" ${idx === 0 ? "checked" : ""} />
                        <span>${escapeHtml(dev)}</span>
                    </label>`
                )
                .join("");

            const actionPills = ACTION_CLASS_OPTIONS.map(
                (ac) => `
                <label class="check-pill">
                    <input type="checkbox" name="action_classes" value="${escapeHtml(ac.id)}" />
                    <span>${escapeHtml(ac.label)}</span>
                </label>`
            ).join("");

            const durationOptions = DURATION_PRESETS.map(
                (d) =>
                    `<option value="${escapeHtml(d.id)}" ${d.id === this._selectedDuration ? "selected" : ""}>${escapeHtml(d.label)}</option>`
            ).join("");

            const untilRevokedConfirmHtml =
                this._selectedDuration === "until_revoked"
                    ? `
                    <div class="field-group">
                        <label class="check-pill">
                            <input type="checkbox" name="confirm_until_revoked" value="true" />
                            <span>I understand this override will remain active until manually restored or preempted by Freeze.</span>
                        </label>
                    </div>`
                    : "";

            const errorHtml =
                this._errors.length > 0
                    ? `<div class="error-box" role="alert">${this._errors.map(escapeHtml).join("<br/>")}</div>`
                    : "";

            this.shadowRoot.innerHTML = `
                <style>${SHARED_STYLES}</style>
                <div class="modal-backdrop" ${isOpen ? "" : "hidden"}>
                    <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="override-modal-title">
                        <h3 class="modal-title" id="override-modal-title">Scoped Restriction Override</h3>
                        <p class="modal-subtitle">
                            Temporarily relax approval &amp; threshold gates for an explicit scope and duration. Core authentication, target consent, audit, and Freeze invariants remain strictly enforced.
                        </p>

                        <div class="invariant-grid">
                            <div class="inset-card" data-kind="bypassed">
                                <h4>Temporarily Bypassed in Scope</h4>
                                <ul>${bypassedItems}</ul>
                            </div>
                            <div class="inset-card" data-kind="enforced">
                                <h4>Always Enforced (Immutable)</h4>
                                <ul>${enforcedItems}</ul>
                            </div>
                        </div>

                        <div class="field-group">
                            <span class="field-label">1. Target Applications</span>
                            <div class="pill-grid">${appPills}</div>
                        </div>

                        <div class="field-group">
                            <span class="field-label">2. Target Devices</span>
                            <div class="pill-grid">${devicePills}</div>
                        </div>

                        <div class="field-group">
                            <span class="field-label">3. Permitted Action Classes</span>
                            <div class="pill-grid">${actionPills}</div>
                        </div>

                        <div class="field-group">
                            <label class="field-label" for="override-duration">4. Session Duration</label>
                            <select class="select-input" id="override-duration" name="duration">
                                ${durationOptions}
                            </select>
                        </div>

                        ${untilRevokedConfirmHtml}

                        <div class="field-group">
                            <label class="field-label" for="override-reason">5. Audit Reason (required)</label>
                            <input
                                class="text-input"
                                id="override-reason"
                                type="text"
                                name="reason"
                                placeholder="e.g. Active incident containment drill on edge NVR"
                                autocomplete="off"
                            />
                        </div>

                        <div class="field-group">
                            <label class="field-label" for="override-totp">6. Step-Up Verification (TOTP 2FA or Passkey)</label>
                            <div class="pill-grid">
                                <input
                                    class="text-input"
                                    style="flex: 1 1 200px;"
                                    id="override-totp"
                                    type="text"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    name="totp_code"
                                    placeholder="${this._stepUpMethod === "passkey" && this._passkeyAssertion ? "Passkey verified" : "6-digit TOTP code"}"
                                    autocomplete="one-time-code"
                                />
                                <button type="button" class="hig-btn" data-action="passkey">
                                    ${this._stepUpMethod === "passkey" && this._passkeyAssertion ? "Passkey Ready" : "Use Passkey..."}
                                </button>
                            </div>
                        </div>

                        ${errorHtml}

                        <div class="modal-footer">
                            <button type="button" class="hig-btn" data-action="cancel">Cancel</button>
                            <button type="button" class="hig-btn" data-variant="primary" data-action="submit">
                                Authorize Scoped Override
                            </button>
                        </div>
                    </div>
                </div>
            `;

            const durationSelect = this.shadowRoot.querySelector('select[name="duration"]');
            if (durationSelect) {
                durationSelect.addEventListener("change", (ev) => {
                    this._selectedDuration = ev.target.value;
                    this.render();
                });
            }

            const totpInput = this.shadowRoot.querySelector('input[name="totp_code"]');
            if (totpInput) {
                totpInput.addEventListener("input", () => {
                    this._stepUpMethod = "totp";
                });
            }

            const passkeyBtn = this.shadowRoot.querySelector('[data-action="passkey"]');
            if (passkeyBtn) {
                passkeyBtn.addEventListener("click", () => {
                    this.dispatchEvent(
                        new CustomEvent("ecosystem-passkey-request", {
                            bubbles: true,
                            composed: true,
                        })
                    );
                });
            }

            const cancelBtn = this.shadowRoot.querySelector('[data-action="cancel"]');
            if (cancelBtn) {
                cancelBtn.addEventListener("click", () => this.close());
            }

            const submitBtn = this.shadowRoot.querySelector('[data-action="submit"]');
            if (submitBtn) {
                submitBtn.addEventListener("click", () => this._collectAndSubmit());
            }
        }
    }

    class EcosystemMicPill extends BaseElement {
        static get observedAttributes() {
            return ["state", "unavailable-reason", "backend-label"];
        }

        constructor() {
            super();
            this.attachShadow({ mode: "open" });
        }

        connectedCallback() {
            this.render();
        }

        attributeChangedCallback() {
            this.render();
        }

        render() {
            const vm = computeMicPillState({
                state: this.getAttribute("state") || "muted",
                unavailableReason: this.getAttribute("unavailable-reason") || "",
                backendLabel: this.getAttribute("backend-label") || "Local Whisper",
            });

            const pttButtonHtml = vm.canPushToTalk
                ? `<button
                        type="button"
                        class="hig-btn"
                        data-action="ptt"
                        data-variant="${vm.state === "listening" ? "primary" : "default"}"
                        aria-pressed="${vm.state === "listening" ? "true" : "false"}"
                   >
                        ${vm.state === "listening" ? "Release / Stop" : "Push to Talk"}
                   </button>`
                : "";

            this.shadowRoot.innerHTML = `
                <style>${SHARED_STYLES}</style>
                <div class="mic-pill" data-state="${escapeHtml(vm.state)}" role="group" aria-label="Local Voice Assistant Control">
                    <button
                        type="button"
                        class="hig-btn"
                        data-action="mute-toggle"
                        aria-pressed="${vm.isMuted ? "true" : "false"}"
                        aria-label="${vm.isMuted ? "Unmute local microphone (Push-to-Talk mode)" : "Mute local microphone"}"
                        ${vm.canToggleMute ? "" : "disabled"}
                    >
                        ${renderIcon(vm.icon)}
                        <span>${vm.isMuted ? "Muted" : "Mute"}</span>
                    </button>
                    <div class="mic-meta" role="status" aria-live="polite">
                        <span class="mic-status">${escapeHtml(vm.statusLabel)}</span>
                        <span class="mic-privacy">${escapeHtml(vm.privacyCaption)}</span>
                    </div>
                    ${pttButtonHtml}
                </div>
            `;

            const muteBtn = this.shadowRoot.querySelector('[data-action="mute-toggle"]');
            if (muteBtn) {
                muteBtn.addEventListener("click", () => {
                    const nextMuted = !vm.isMuted;
                    this.setAttribute("state", nextMuted ? "muted" : "push_to_talk");
                    this.dispatchEvent(
                        new CustomEvent("ecosystem-mic-mute-change", {
                            bubbles: true,
                            composed: true,
                            detail: { muted: nextMuted },
                        })
                    );
                });
            }

            const pttBtn = this.shadowRoot.querySelector('[data-action="ptt"]');
            if (pttBtn) {
                pttBtn.addEventListener("click", () => {
                    const starting = vm.state !== "listening";
                    this.setAttribute("state", starting ? "listening" : "processing");
                    this.dispatchEvent(
                        new CustomEvent(
                            starting ? "ecosystem-mic-ptt-start" : "ecosystem-mic-ptt-stop",
                            {
                                bubbles: true,
                                composed: true,
                                detail: { timestamp: Date.now() },
                            }
                        )
                    );
                });
            }
        }
    }

    return {
        EcosystemFreezeButton,
        EcosystemPolicyBar,
        EcosystemOverrideModal,
        EcosystemMicPill,
    };
}

function registerEcosystemControls(env = {}) {
    const registry =
        env.customElements ||
        (typeof customElements !== "undefined" ? customElements : null);
    const BaseEl =
        env.HTMLElement ||
        (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!registry || !BaseEl) {
        return null;
    }

    const classes = createComponentClasses(BaseEl);
    const definitions = [
        ["ecosystem-freeze-button", "EcosystemFreezeButton"],
        ["ecosystem-policy-bar", "EcosystemPolicyBar"],
        ["ecosystem-override-modal", "EcosystemOverrideModal"],
        ["ecosystem-mic-pill", "EcosystemMicPill"],
    ];

    for (const [tag, key] of definitions) {
        const existing = registry.get(tag);
        if (existing) {
            // Already registered (e.g. the browser auto-registered on load). Return
            // the REGISTERED constructor — the freshly-created one is unregistered
            // and constructing it would throw a TypeError.
            classes[key] = existing;
        } else {
            registry.define(tag, classes[key]);
        }
    }
    return classes;
}

module.exports = {
    escapeHtml,
    createComponentClasses,
    registerEcosystemControls,
};

},
"./index": function (module, exports, require) {
"use strict";

const model = require("./model");
const styles = require("./styles");
const components = require("./components");

// Auto-register when loaded in a browser context with Custom Elements v1 support.
if (typeof window !== "undefined" && typeof customElements !== "undefined") {
    components.registerEcosystemControls();
}

module.exports = Object.assign({}, model, styles, components);

}
  };
  var cache = {};
  function localRequire(id) {
    var normalized = id.replace(/\.js$/, "");
    if (cache[normalized]) return cache[normalized].exports;
    if (!factories[normalized]) throw new Error("Unknown module: " + id);
    var mod = { exports: {} };
    cache[normalized] = mod;
    factories[normalized](mod, mod.exports, localRequire);
    return mod.exports;
  }
  var api = localRequire("./index");
  if (global) {
    global.EcosystemUIControls = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
