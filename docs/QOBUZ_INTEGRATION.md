# Qobuz Integration — Working Notes

> Branch: `feature/qobuz-integration` · Do not merge to main until RC-tested.
> Full feasibility analysis lives in the scoping report (scratchpad); this file
> is the living build log.

## Decision: native, not conversion

Qobuz is a **native download path**, not a Spotify-style convert-to-Deezer source.
Converting would fetch the lower-quality Deezer copy and throw away Qobuz's hi-res
FLAC + richer metadata — the whole point. See report §2.

## Key fact that makes this tractable

Qobuz `track/getFileUrl` returns a **direct, unencrypted** CDN link. No Blowfish,
no DRM, no decrypt stage. The Deezer pipeline's decryption step is simply skipped
for Qobuz — fetch the file, tag it, done.

## Progress

- [x] **Phase 1 — de-risk the auth scrape (DONE, verified live 2026-07-16).**
      `electron/services/qobuzAuth.ts` + `scripts/qobuz-spike.ts`.
      `bun scripts/qobuz-spike.ts` scrapes app_id + app_secret from the live
      bundle (8.2.0-b034: app_id `798273057`, literal app_secret present).
      Request-signing (md5 scheme) and the API client are implemented.
- [~] **Phase 1b — validate login + getFileUrl end-to-end. BLOCKED — external
      infra change discovered (2026-07-16 live probe with a real account).**
      Login (and *every* api.json/0.2 call, including the formerly app_id-only
      `catalog/search`) now returns **HTTP 401 `"User authentication is required"`**.
      Response headers show the surface sits behind a **Kong API gateway**
      (`x-kong-response-latency`) + Akamai edge. Findings:
        - app_id/app_secret scrape still works (production block: app_id
          `798273057`, app_secret `05a4851e…`; note a decoy `f686f063…` earlier
          in the bundle — scraper now reads both from the same production block).
        - `user/login` via GET **and** POST with email+password+app_id → 401.
        - Sending app_id as query yields 401 "auth required"; omitting it yields
          400 "missing app_id parameter" — so the API checks app_id presence,
          then still demands a user auth the classic flow no longer satisfies.
        - No `Set-Cookie` from the login page; session is likely established via
          an XHR/token handshake the OSS flow (streamrip/qobuz-dl) predates.
      **Conclusion:** the reverse-engineered app_id+password flow that all the
      OSS tools document is **dead** — not a bug in our code, Qobuz changed the
      infra. Caught on day one, before building on a broken foundation.
- [x] **Phase 1c — RESOLVED: found the current working handshake (2026-07-16
      research, corroborated by streamrip PR #955 + issues #954/#956).**
      Qobuz moved web login to **OAuth+reCAPTCHA in April 2026**; raw
      email/password to `user/login` 401s for everyone now. **Working path is
      TOKEN-based:** capture a `user_auth_token` (+ numeric user id) from a real
      logged-in play.qobuz.com session, then call api.json with `X-App-Id` +
      `X-User-Auth-Token`. app_id `798273057` is correct; token must be minted
      under the same app_id and expires in ~days. Our datacenter/Akamai IP theory
      was a red herring — it's purely the auth scheme. `qobuzAuth.ts` updated:
      `login()` now fails loudly, `loginWithToken()` is the real entry.
      **Natural in-app fit:** capture the token by rendering play.qobuz.com/login
      in a sandboxed BrowserWindow and intercepting the `user/login` response —
      the *exact* pattern this app already uses for the Deezer ARL.
- [x] **Phase 1d — VALIDATED END-TO-END (2026-07-16, real Studio account).**
      `bun scripts/qobuz-spike.ts` with a browser-minted token proved the whole
      chain through the committed service code:
        - scrape app_id + candidate secrets ✓
        - `loginWithToken` → token accepted, plan **Studio** ✓ (first 2xx auth call)
        - `search` "get lucky" → 200, track 8767428 ✓
        - `getFileUrl` → 200, real Akamai CDN URL, format 7 (24-bit/44.1 FLAC) ✓
        - downloaded first bytes → **`fLaC` magic number ✓ — no-decryption CONFIRMED empirically**
      **Critical implementation detail proven:** the working signing secret is
      NOT the production literal — it's a per-timezone-derived candidate
      (`extractSecretCandidates` collects all; `getFileUrl` resolves the winner by
      trial and caches it). This is now in the code, not just a note.
      Requested format 27 (24/192) degraded to 7 for this track = normal
      quality-negotiation, not an error.
      **Auth mechanism + native no-decrypt path are now proven, not assumed.**
      Phases 2–6 are the remaining (real) integration work.
- [ ] Phase 2 — credentials plumbing (settingsStore, SettingsView panel, main.ts
      safeStorage persistence + startup restore). Clone the Spotify section.
- [ ] Phase 3 — native download branch: add a `service` discriminator to
      `DownloadOptions`/`DownloadItem`; branch `processDownload` so Qobuz skips
      `decryptFile` (fetched file IS the output). This is the one real refactor —
      `processDownload` currently calls the `deezerAuth` singleton directly.
- [ ] Phase 4 — catalog + Link Analyzer: `isQobuzUrl` in BOTH `urlHost.ts`
      copies; `/api/qobuz/{auth,status,analyze,track,album,playlist}` routes;
      Qobuz branch in `LinkAnalyzerView.analyzeLink`. Single track → album →
      playlist.
- [ ] Phase 5 — metadata polish: write ISRC/UPC from API JSON (Qobuz omits some
      from FLAC tags); optional booklet-PDF download.
- [ ] Phase 6 — docs + disclaimer (name Qobuz), README/About/CHANGELOG; RC build.

## Extension surface (from the codebase map)

| Layer | File | Clone from |
|---|---|---|
| Auth/API | `electron/services/qobuzAuth.ts` (new) | deezerAuth structure + streamrip signing |
| Download branch | `electron/services/downloader.ts` `processDownload` | Deezer path minus decrypt |
| URL routing | `src/utils/urlHost.ts` + `electron/utils/urlHost.ts` | `isSpotifyUrl` |
| Server routes | `electron/server.ts` | `handleSpotify*` family |
| Credentials UI | `settingsStore.ts`, `SettingsView.vue`, `main.ts` | Spotify creds section |
| Link Analyzer | `src/views/LinkAnalyzerView.vue` | Spotify branch |
| Types | `src/types/index.ts` + `downloader.ts` | net-new `service` field |

## Format IDs

`5` MP3 320 · `6` FLAC 16/44.1 · `7` FLAC 24/≤96 · `27` FLAC 24/≤192.

## Risks

- **Bundle scraper** is the top maintenance liability — Qobuz reships bundle.js
  and the regexes break. `fetchAppCredentials` tries the literal secret first,
  then falls back to seed-reconstruction. Needs a loud, clear failure message,
  not a silent hang.
- Paid account required to build/test. Free = no downloads.
- ToS gray area = same as Deezer, not worse. Extend the existing disclaimer.
