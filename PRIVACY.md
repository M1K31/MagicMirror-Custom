# Privacy Policy & Security Boundaries

**Product**: MagicMirror³ (Ecosystem Custom Edition)  
**Maintainer**: Smart Industries LLC (Mikel Smart)  
**Effective Date**: November 2026  

---

## 1. Ambient Display & Public Boundary

`MagicMirror-Custom` is designed for ambient wall displays and smart home visual dashboards. Because wall-mounted screens may be visible to guests or visitors:

- **Redacted Information**: The mirror displays only high-level status badges (e.g. system health, active policy mode, threat severity levels). Detailed forensic artifacts, raw log messages, network paths, and credential tokens are **never** rendered on ambient displays.
- **Local Network Communications**: By default, dashboard metrics and notifications are consumed from the local `appEcosystem` registry and event bus via authenticated local WebSockets or loopback HTTP. Companion-app polling (for example the `security` / `network-security` modules reading events and metrics from OpenEye) is **operator-configurable** and may be pointed at a non-loopback LAN host over plain HTTP, sending a bearer token on that connection. Operators should keep these hosts on loopback or a trusted LAN segment and use HTTPS wherever the companion app supports it.
- **No External Analytics**: The application contains no tracking beacons, external analytics scripts, or cloud advertising.

---

## 2. Strict Privilege Boundary & Emergency Freeze

To prevent physical tampering or accidental changes from an ambient touch screen or voice listener:

1. **View-Only Mode**: Wall displays operate in a restricted `view_only` mode. Privileged operations—such as approving security checkpoints, modifying firewall rules, lowering policy restrictions, pushing integration settings into another app, or resuming from a freeze state—are blocked by the `ecosystem_policy` module, which emits an `ECOSYSTEM_POLICY_FORBIDDEN` socket notification carrying the attempted `action` and a `reason`:
   ```json
   { "action": "ECOSYSTEM_POLICY_RESUME", "reason": "Privileged policy operations (resume, approve, deny, restrictions off) are forbidden from unauthenticated wall display" }
   ```
2. **Emergency Kill-Switch (Freeze) Only**: The sole mutation permitted from the ambient display is the **emergency freeze** kill-switch (`ECOSYSTEM_REQUEST_FREEZE`). This allows any occupant to instantly freeze the network mesh in an emergency without requiring prior step-up authentication.
3. **Resume Requires Step-Up Auth**: Once engaged, resuming from freeze cannot be performed from the mirror; it requires administrative step-up authentication on an authorized personal device.

---

## 3. Microphone & Voice Recognition Privacy

If local voice recognition modules (e.g. `MMM-Voice` or `ecosystem-voice`) are enabled on the mirror:
- **Local Speech Recognition**: When transcription runs on the local path using quantized speech models (`whisper.cpp`), no audio stream is sent to third-party cloud speech services. **This local guarantee applies only to the on-device path.** If a browser-based speech-recognition module is enabled instead (the Web Speech API, as used by the `ai` module), some browsers send captured audio to a remote web speech service, which is outside this guarantee. Operators who require strictly local processing should use the `whisper.cpp` path and avoid browser speech recognition.
- **Zero Audio Retention (local path)**: Audio PCM buffers handled by the local path are zeroed out in volatile memory immediately after keyword detection. No recordings, waveforms, or temporary audio files are stored on disk.
- **Restricted Voice Intents**: Voice recognition can trigger emergency freeze or request automated device scans, but voice intents cannot approve checkpoints or alter security policies.

---

## 4. Contact Information

For privacy disclosures or security inquiries:  
**Smart Industries LLC** (Mikel Smart)

