# Security Triage — CodeQL Alert Log

Running record of every CodeQL alert in the repo's Security tab: what it was,
what we did, and why. Future scans that re-flag a dismissed pattern should be
checked against this log before any code churn.

## 2026-07-19 — branch `security/codeql-hardening`

| # | Rule | Severity | Location | Disposition |
|---|------|----------|----------|-------------|
| 21 | js/clear-text-storage-of-sensitive-data | error/high | `src/stores/settingsStore.ts` | **Fixed.** The legacy Spotify localStorage fallback wrote the client secret in plaintext when safeStorage was unavailable. The secret is now persisted only through safeStorage encryption; without safeStorage it stays in-memory for the session (re-entry required next launch). The startup migration path still reads and deletes any pre-existing legacy key. |
| 20 | js/tainted-format-string | warning/high | `electron/server.ts` (artist sync) | **Fixed.** Request-supplied id moved out of the format string into a console argument. |
| 19 | js/tainted-format-string | warning/high | `electron/server.ts` (playlist sync) | **Fixed.** Same pattern. |
| 18 | js/tainted-format-string | warning/high | `src/views/SearchView.vue` (bulk link download) | **Fixed.** Pasted-link type/id moved into console arguments. |
| 16 | js/stack-trace-exposure | warning/medium | `electron/server.ts` `sendJSON` | **Fixed centrally.** `sendJSON` now scrubs `stack` fields (and collapses raw `Error` objects to message-only) from every error-status payload — a chokepoint guarantee covering all current and future handlers. Server binds to 127.0.0.1 only, so exposure was already local-only. |
| 15 | js/request-forgery | error/critical | `electron/server.ts` (Deezer API proxy) | **Mitigated + hardened → dismiss.** Endpoint is resolved against `https://api.deezer.com` and the full origin is pinned: protocol must be `https:`, hostname must equal `api.deezer.com`, port must be default. CodeQL cannot recognize the custom sanitizer; dismissed with this justification. |
| 14 | js/request-forgery | error/critical | `electron/server.ts` (redirect resolver) | **Mitigated + hardened → dismiss.** `isRedirectSafe()` runs on the initial URL and every redirect hop: http/https only, default ports only (added this pass), private/link-local/localhost ranges blocked, and a host allowlist (`.deezer.com`, `.spotify.com`, `.dzcdn.net`, exact `deezer.page.link`) with correct suffix-vs-exact matching. Dismissed with this justification. |
| 23 | js/weak-cryptographic-algorithm | warning/high | `electron/services/qobuzAuth.ts` (request signing) | **Won't fix → dismiss.** MD5 is mandated by Qobuz's API contract — their gateway validates `md5(object+method+params+timestamp+secret)`. It authenticates requests to their service and protects no data of ours; any other algorithm is rejected by Qobuz. Documented at the call site. |

### Standing posture

- The local HTTP server binds to `127.0.0.1` only.
- Service credentials (Deezer ARL, Spotify client secret, Qobuz token) are
  stored via OS safeStorage / userData files, never in cleartext web storage,
  never in settings exports or backups.
- Any new outbound-fetch endpoint must pin its origin (scheme + host + port)
  or route through `isRedirectSafe()`.
