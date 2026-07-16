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
- [~] **Phase 2a — main-process token capture + persistence + restore. DONE +
      VERIFIED where headlessly possible (2026-07-16).**
        - `qobuz:openLoginWindow` IPC (main.ts): opens play.qobuz.com/login in a
          sandboxed BrowserWindow, polls the page's localStorage for the
          user_auth_token + id the web player stores post-login, returns them.
          Mirrors the Deezer ARL cookie-capture. **BUILT, NOT EXERCISED** — needs
          a live Electron run + a real interactive login to verify end to end
          (DEFERRED-VERIFY).
        - safeStorage persistence: `qobuzUserId`/`qobuzToken` added to
          save/loadCredentials (encrypted, same as ARL/Spotify secret).
        - Startup restore: main.ts boot restores the Qobuz session from stored
          creds → `qobuzAuth.restoreSession`. **VERIFIED**: restoreSession →
          authenticated catalog/search returned **HTTP 200** (exact startup path).
        - IPC bridge: `window.electronAPI.qobuzLogin.openLoginWindow` exposed
          (preload + electron.d.ts); credential types extended.
        - typecheck ✓, vite build ✓, handler present in compiled dist-electron/main.js ✓.
- [~] **Phase 2b — Settings UI. BUILT (typecheck ✓, vite build ✓, panel present
      in built SettingsView chunk).**
        - `settingsStore`: `qobuzUserId`/`qobuzToken` fields, loaded on startup;
          `isQobuzConnected`, `connectQobuz()` (opens login window → persists
          token encrypted), `disconnectQobuz()`.
        - `SettingsView`: a "Qobuz · HI-RES" section (registered in the section
          keyword/expand registries) with Connect / Connected-as / Disconnect.
      **VERIFIED END-TO-END IN-APP (2026-07-16, real login).** Connect → login
      window → user authenticates → token captured → persisted → "Connected ·
      user 1043055". Evidence: app log `token captured via user/login response
      for user 1043055`; credentials.json gained encrypted `qobuzUserId`/`qobuzToken`.
      Two fixes were needed along the way (both committed):
        1. **Window ≥1024px** — Qobuz's web player hard-refuses to render narrower
           ("needs a screen size at least 1024 pixels"). Was 520 (Deezer clone).
        2. **Token is NOT in any named localStorage key** — live diagnostic showed
           only `localuser`/`settings-<id>`/`player-0`/analytics; no token field.
           So capture reads the **user/login network RESPONSE via CDP**
           (Network.getResponseBody), and the partition is cleared on open so a
           fresh login POST fires. This is how streamrip PR #955 does it.
      UI strings are English literals for now (WIP); i18n keys come at polish.
      **Phase 2 complete. Next: Phase 3 — native download branch.**
- [~] Phase 3a — native download core. DONE + VERIFIED (2026-07-16).
      `electron/services/qobuzDownloader.ts` + `scripts/qobuz-download-spike.ts`.
      `downloadQobuzTrack(trackId, quality, outputPath)`: getFileUrl → stream the
      unencrypted CDN file to disk (NO decrypt stage), removes partials on failure.
      VERIFIED: downloaded "Get Lucky" = 51.48 MB, music-metadata parsed it
      independently as FLAC 24-bit/44.1kHz, 248s → COMPLETE VALID FLAC.
      Finding: Qobuz FLAC arrives with NO embedded title/artist tags, so tags
      must be written from the API metadata (Phase 3c).
- [~] Phase 3b — backend routes + session wiring. DONE + VERIFIED (2026-07-16,
      live against the running app on :6596).
        - `/api/qobuz/session` (POST) → pushes a captured token into the backend
          session; `connectQobuz` now calls it so Qobuz works without a restart.
        - `/api/qobuz/status` → **HTTP 200** `{connected:true, userId:1043055}`.
        - `/api/qobuz/search?q=` → **HTTP 200** (found "Creep" / Radiohead).
        - `/api/qobuz/download` (POST {trackId}) → **HTTP 200**, wrote
          `Radiohead - Creep.mp3` (9.55 MB) to the library; respects the app's
          quality setting (came down MP3-320 because quality=320; FLAC when flac).
        - Boot restore confirmed: `[Main] Qobuz session restored from storage`.
      Still simple: writes "Artist - Title.ext" (no folder-template structure yet)
      and is not yet in the Transfer Rack queue/UI — that's Phase 3b-2.
- [ ] Phase 3b-2 — full queue/UI integration (`service` discriminator so Qobuz
      items show in the Transfer Rack with progress) + folder/naming templates.
- [ ] Phase 3c — tag the downloaded FLAC from Qobuz API metadata (title, artist,
      album, ISRC/UPC, cover) since files arrive untagged.
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

## Phase 3b-2 — queue integration (2026-07-16)

- `DownloadOptions.service?: 'deezer'|'qobuz'`; `processDownload` branches to
  `processQobuzDownload` at the top (no-decrypt path, emits the same
  start/progress/complete/error events as Deezer → shows in the Transfer Rack).
- Concurrency: the Qobuz branch does NOT touch `currentDownloads` or call
  `processQueue` — the `processQueue()` wrapper's `.finally()` owns that (verified
  no desync).
- `/api/qobuz/download` now enqueues via `downloader.download({service:'qobuz'})`
  and returns a `downloadId` immediately.
- VERIFIED live (:6596): enqueue → app log shows the item through
  `processQueue → processDownload → finished`, currentDownloads back to 0, and a
  real 9.5MB `Radiohead - Creep.mp3` produced. Visual Transfer Rack rendering not
  yet eyeballed (same events, so wired) — User can watch it live.
- Still TODO: folder-template naming parity (Phase 3c tags), album/playlist
  fan-out, and the Link Analyzer URL entry point (Phase 4).

## Phase 4 — URL entry point / Link Analyzer (2026-07-16)

- `isQobuzUrl` added to BOTH urlHost.ts copies (matches qobuz.com incl.
  open./play./www.).
- `qobuzAuth.parseUrl` (track/album/playlist/artist + id, handles open + store
  forms) and `analyzeUrl`; `/api/qobuz/analyze` route.
- LinkAnalyzerView: Qobuz branch in `analyzeLink` → `analyzeQobuzLink` → renders
  a Qobuz result card with a Download button; `downloadQobuz` enqueues the
  track (or every album/playlist track) via /api/qobuz/download.
- VERIFIED (backend, live :6596): analyze track URL → 200 (Creep/Radiohead);
  analyze real album URL → 200 (OK Computer OKNOTOK, 23 tracks). Frontend
  typecheck ✓ / build ✓ / branch present in built LinkAnalyzerView chunk.
- DEFERRED-VERIFY: the in-app paste→analyze→download→rack interaction (needs the
  running app + a click) — User can now exercise it live: Link Analyzer → paste a
  Qobuz URL → Download.
- Still TODO: folder-template naming parity + Qobuz tags from API metadata
  (Phase 3c/5); i18n strings; album/playlist progress grouping in the rack.

## Phase 3c — tagging (2026-07-16)

- Qobuz files arrive untagged, so after download we tag them by REUSING the
  Deezer tagger (`tagFile`/`tagFlacFile`) via a Qobuz→trackInfo shim
  (`qobuzMetaToTrackInfo`) rather than hand-rolling a FLAC writer.
- Cover art: the taggers' cover step was Deezer-CDN-hash-only; added a small safe
  `options.prefetchedCover?: Buffer` hook so a pre-fetched image (Qobuz's cover
  URL) is used instead — Deezer path unchanged.
- VERIFIED end-to-end (MP3, real file): downloaded "Creep", read tags back with
  music-metadata → title/artist/album/albumartist/track/ISRC all correct + cover
  image/jpeg 115KB embedded. FLAC path uses the same shim + prefetchedCover +
  tagFlacFile (wired; verify with quality=FLAC).
- Minor: disc number came back undefined for a single-disc track (media_number
  absent at track level) — cosmetic.
