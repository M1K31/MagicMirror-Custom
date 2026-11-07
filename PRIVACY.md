# Privacy Policy & Security Boundaries

**Product**: MagicMirror³ (Ecosystem Custom Edition)  
**Maintainer**: Smart Industries LLC (Mikel Smart)  
**Effective Date**: November 2026  

---

## 1. Ambient Display & Public Boundary

`MagicMirror-Custom` is designed for ambient wall displays and smart home visual dashboards. Because wall-mounted screens may be visible to guests or visitors:

- **Redacted Information**: The mirror displays only high-level status badges (e.g. system health, active policy mode, threat severity levels). Detailed forensic artifacts, raw log messages, network paths, and credential tokens are **never** rendered on ambient displays.
- **Local Network Communications**: Dashboard metrics and notifications are consumed strictly from the local `appEcosystem` registry and event bus via authenticated local WebSockets or loopback HTTP queries.
- **No External Analytics**: The application contains no tracking beacons, external analytics scripts, or cloud advertising.

---

## 2. Strict Privilege Boundary & Emergency Freeze

To prevent physical tampering or accidental changes from an ambient touch screen or voice listener:

1. **View-Only Mode**: Wall displays operate in a restricted `view_only` mode. Privileged operations—such as approving security checkpoints, modifying firewall rules, lowering policy restrictions, or resuming from a freeze state—are blocked by the `ecosystem_policy` module and rejected with:
   ```json
   { "error": "ECOSYSTEM_POLICY_FORBIDDEN: Ambient wall displays operate in view-only mode" }
   ```
2. **Emergency Kill-Switch (Freeze) Only**: The sole mutation permitted from the ambient display is the **emergency freeze** kill-switch (`ECOSYSTEM_REQUEST_FREEZE`). This allows any occupant to instantly freeze the network mesh in an emergency without requiring prior step-up authentication.
3. **Resume Requires Step-Up Auth**: Once engaged, resuming from freeze cannot be performed from the mirror; it requires administrative step-up authentication on an authorized personal device.

---

## 3. Microphone & Voice Recognition Privacy

If local voice recognition modules (e.g. `MMM-Voice` or `ecosystem-voice`) are enabled on the mirror:
- **Local Speech Recognition**: Transcription runs locally using quantized speech models (`whisper.cpp`). No audio stream is ever sent to third-party cloud speech services.
- **Zero Audio Retention**: Audio PCM buffers are zeroed out in volatile memory immediately after keyword detection. No recordings, waveforms, or temporary audio files are stored on disk.
- **Restricted Voice Intents**: Voice recognition can trigger emergency freeze or request automated device scans, but voice intents cannot approve checkpoints or alter security policies.

---

## 4. Contact Information

For privacy disclosures or security inquiries:  
**Smart Industries LLC** (Mikel Smart)

