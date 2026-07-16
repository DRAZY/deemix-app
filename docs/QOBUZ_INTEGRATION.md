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
- [ ] **Phase 1b — validate login + getFileUrl end-to-end.** BLOCKED ON CREDS.
      Needs a paid Qobuz account. Set `QOBUZ_EMAIL` / `QOBUZ_PASSWORD` in
      `~/.claude/.env` (never committed), then re-run the spike — Phase 2 logs in,
      resolves a hi-res getFileUrl, and sniffs the FLAC magic bytes to confirm
      it's real, unencrypted audio. Optionally `QOBUZ_TEST_TRACK_ID`.
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
