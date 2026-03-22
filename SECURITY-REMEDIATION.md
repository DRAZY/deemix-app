# Security Remediation Plan — Deemix Remastered

**Assessment Date:** 2026-03-22
**App Version at Assessment:** v1.2.0
**Framework:** OWASP Top 10, Electron Security Checklist

---

## Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Critical | Partial | CSP hardening reverted (broke app); SSRF fix applied |
| Phase 2 — High | Mostly Complete | 6 of 8 fixes applied; CSP and credential transport deferred |
| Phase 3 — Medium | Not Started | Scheduled for future sprint |
| Phase 4 — Low & Dependencies | Not Started | Scheduled for future sprint |

### What WAS Fixed (in v1.2.0)

- SSRF protection — redirect follower validates destinations against domain whitelist, blocks private IPs
- URL validation in `setWindowOpenHandler` — blocks `javascript:`, `file://`, custom protocols
- Login window sandbox re-enabled (`sandbox: true`)
- DevTools keyboard shortcuts disabled in production builds
- ARL cookie domain check hardened (`.endsWith('.deezer.com')` instead of `.includes('deezer')`)
- Error message sanitization — internal details no longer leaked to client responses
- CORS handling — properly handles Electron `file://` origin

---

## Outstanding Remediations

### C1 — Content Security Policy Hardening

**Severity:** Critical
**Location:** `electron/main.ts:217-228`
**Status:** DEFERRED — Removing `unsafe-eval` and `unsafe-inline` broke the production app under Electron's `file://` protocol

**Current State:** CSP uses `unsafe-inline` and `unsafe-eval` in both `default-src` and `script-src`.

**What Needs to Happen:**
1. Investigate which specific dependency requires `unsafe-eval` (Vue 3, Vite runtime, or a third-party library)
2. Test removing `unsafe-eval` only (keep `unsafe-inline`) in a development build first
3. If Vue 3 runtime-only build doesn't need eval, the issue may be a Vite plugin or dependency
4. Consider using nonce-based CSP for inline scripts as a long-term solution
5. Ensure `connect-src` includes both `http://127.0.0.1:*` AND `http://localhost:*` — some components use `localhost`

**Testing Required:** Must test on macOS, Windows (installer + portable), and Linux before shipping. The blank screen regression was caused by missing `localhost` in `connect-src` and removing `unsafe-eval`.

**Risk if Skipped:** XSS attacks can execute arbitrary JavaScript via `eval()` and inline script injection.

---

### H5 — Credential Storage Fallback

**Severity:** High
**Location:** `electron/main.ts:787-792`
**Status:** NOT STARTED

**Issue:** When Electron's `safeStorage` encryption is unavailable (e.g., Linux without a keyring), credentials are stored with trivial obfuscation (base64 + reverse). This is easily reversible.

**Recommendation:**
- Option A: Warn the user prominently in the UI (not just console) that credentials are not securely stored, and let them decide whether to proceed
- Option B: Implement a fallback encryption scheme using a machine-derived key (e.g., MAC address + username hash as AES key) — better than obfuscation but not as strong as OS keychain
- Do NOT refuse to store credentials entirely — this would make the app unusable on affected systems

**Risk if Skipped:** An attacker with filesystem access can recover ARL tokens and Spotify credentials in seconds.

---

### H6 — Spotify Credentials Sent Over Plaintext HTTP

**Severity:** High
**Location:** `src/views/SettingsView.vue:236-239`
**Status:** NOT STARTED

**Issue:** Spotify Client ID and Secret are sent via HTTP POST to `http://127.0.0.1:{port}/api/spotify/auth` to configure the server-side Spotify API singleton.

**Recommendation:** Move credential transmission to Electron IPC instead of HTTP. Add an IPC handler in `main.ts` that forwards credentials to the server instance directly (in-process, no network). The credentials are already saved via IPC for storage — the HTTP POST is only for pushing them to the in-memory server.

**Risk if Skipped:** A malicious local process could intercept credentials on the loopback interface. Low probability but violates defense-in-depth.

---

### M3 — Incomplete Path Traversal Detection

**Severity:** Medium
**Location:** `electron/main.ts:94`
**Status:** NOT STARTED

**Issue:** Path traversal detection only checks for the literal string `..`. Encoded sequences (`..%2F`) or symbolic links could bypass this check.

**Recommendation:** Replace the simple `includes('..')` check with `path.relative()` verification:
```typescript
const normalizedPath = path.resolve(targetPath)
const basePath = path.resolve(allowedBaseDir)
if (!normalizedPath.startsWith(basePath)) return false
```

**Risk if Skipped:** Crafted paths could potentially escape allowed directories.

---

### M4 — Blocked Paths List Incomplete

**Severity:** Medium
**Location:** `electron/main.ts:110-112`
**Status:** NOT STARTED

**Issue:** The blocked paths list for file operations (open/delete) is missing sensitive directories.

**Missing paths — macOS/Linux:**
- `~/.ssh` (SSH keys)
- `~/.gnupg` (GPG keys)
- `~/.config` (application configs)
- `/Applications` (macOS)
- `/opt` (optional packages)

**Missing paths — Windows:**
- `C:\Users\{USERNAME}\AppData` (browser data, credentials, app configs)

**Recommendation:** Add these to the blocklist. Also consider a whitelist approach — only allow operations within the download path and userData directory.

---

### M5 — Filename Sanitization Edge Cases

**Severity:** Medium
**Location:** `electron/services/downloader.ts:1191-1209`
**Status:** NOT STARTED

**Issue:** The `sanitizeFilename` function uses a blacklist approach and misses:
- Windows reserved names: `CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`
- Unicode normalization attacks (e.g., full-width characters that look like `../`)
- Case sensitivity issues on case-insensitive filesystems

**Recommendation:**
1. Add Windows reserved name check: reject or rename files matching `^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)`
2. Apply Unicode NFC normalization before sanitization
3. Consider a whitelist approach: only allow `[a-zA-Z0-9\s\-_.()\[\]]`

---

### M6 — Template Validation Insufficient

**Severity:** Medium
**Location:** `electron/server.ts:1756-1759`
**Status:** NOT STARTED

**Issue:** Folder/track name templates are only validated against `..`, `/`, and `\`. Arbitrary text can be injected.

**Recommendation:** Whitelist allowed template variables (`%artist%`, `%album%`, `%title%`, `%tracknumber%`, `%position%`, `%date%`, etc.) and reject templates containing unknown `%...%` patterns.

---

### M7 — No Per-Session Rate Limiting

**Severity:** Medium
**Location:** `electron/server.ts:519-565`
**Status:** NOT STARTED

**Issue:** Rate limiting is IP-based only (`127.0.0.1`). All local processes share the same identity, so a malicious local app could exhaust rate limits for the legitimate user, or brute-force auth endpoints.

**Recommendation:** Add session-based rate limiting after authentication. Track rate limits per session/user ID in addition to per-IP. Consider stricter limits on auth endpoints (already 5/min, but no lockout).

---

### L1 — Credential Metadata in Console Logs

**Severity:** Low
**Location:** `electron/services/deezerAuth.ts:417,777` and `src/stores/settingsStore.ts:376,487`
**Status:** NOT STARTED

**Issue:** ARL token length and cookie names are logged to console. Not directly exploitable but reduces defense-in-depth.

**Recommendation:** Remove credential metadata from log statements in production.

---

### L2 — Runtime Version Info Exposed

**Severity:** Low
**Location:** `electron/main.ts:567-575`
**Status:** NOT STARTED

**Issue:** `getRuntimeInfo` IPC handler exposes Electron, Chromium, Node.js, and V8 versions to the renderer. Could help an attacker identify exploitable versions.

**Recommendation:** Accept as informational risk (About page needs this), or redact in production.

---

### L3 — Spotify Client ID Input Unmasked

**Severity:** Low
**Location:** `src/views/SettingsView.vue:1785`
**Status:** NOT STARTED

**Issue:** Spotify Client ID uses `type="text"` instead of `type="password"`. Visible on screen (shoulder-surfing risk).

**Recommendation:** Change to `type="password"` to match the Client Secret field.

---

### L4 — No Timeout on Static File Serving

**Severity:** Low
**Location:** `electron/server.ts:2449+`
**Status:** NOT STARTED

**Issue:** Static file serving has no timeout protection and uses synchronous file reads that block the event loop.

**Recommendation:** Add timeout wrapper and switch to async file reading.

---

### Dependencies — Vulnerable Packages

**Severity:** HIGH (4) / MODERATE (1)
**Status:** NOT STARTED

| Package | Issue | Fix |
|---------|-------|-----|
| **minimatch** (multiple) | ReDoS | `npm audit fix` or update to latest |
| **rollup** 4.x | Arbitrary file write (path traversal) | Update to >=4.58.1 |
| **tar** <=7.5.10 | Hardlink/symlink path traversal | Update to latest |
| **socket.io-parser** 4.x | Unbounded binary attachments (DoS) | Update socket.io-client |
| **ajv** <6.14.0 | ReDoS with $data option | Update to >=6.14.0 |

**Action:** Run `npm audit fix` and manually update packages that aren't auto-fixable. Test thoroughly after updates since these are build/runtime dependencies.

---

## Notes for Future Implementation

1. **Always test CSP changes** on all three platforms (macOS, Windows, Linux) in production builds before shipping. The `file://` protocol in Electron behaves differently from `http://` for CSP enforcement.
2. **Never remove `http://localhost:*` from `connect-src`** — several components use `localhost` instead of `127.0.0.1` for API calls.
3. **CSP hardening should be done incrementally** — remove one directive at a time, test, ship, then remove the next.
4. **Consider adding automated security regression tests** — a simple test that loads the app and verifies the home page renders would catch blank-screen regressions.
