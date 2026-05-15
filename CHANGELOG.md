# Changelog

All notable changes to **Deemix Remastered** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.1] — 2026-05-14

### Fixed

- **Sync badge "going in circles" on Favorites.** The status badge on favorite playlist and artist cards stayed on `Syncing…` for the entire duration of a sync run with no progress indication, so users had no way to tell whether the engine was actively working or had stalled. The badge now reads `Syncing 12/87` when progress data is available, matching the live values already streamed over the existing `sync:progress` IPC channel (`playlistSync.onSyncProgress` / `artistSync.onSyncProgress`). No backend changes — the data was already flowing, the badge just wasn't reading it.
- **Auto-update checker pointed at the wrong repo.** `App.vue` was polling `github.com/DRAZY/deemix-app/releases/latest` instead of `DRAZY/deemix-remastered`, so the "new version available" toast on startup would silently never fire after the rename to `deemix-remastered`. Now hits the correct repo.
- **Broken GitHub links on the About page.** Both the "GitHub Repository" and "Report an Issue" buttons in the About view pointed to the old `deemix-app` repo URL and would 404. Now point to `DRAZY/deemix-remastered`.

### Changed

- **About → What's New rewritten as a version-grouped log.** Was a flat list of ~26 bullets spanning many versions; now grouped by version with a date stamp per release, newest first. Older releases collapsed into a single summary entry. Full history continues to live in `CHANGELOG.md`.
- **README & ARCHITECTURE refreshed.** Version badge bumped, new "Artist Sync" feature section added under Features, project-structure tree updated (`artistSync.ts`, `artistSyncStore.ts`), API endpoint table includes the artist-sync routes, top-level architecture diagram shows the second sync engine.

## [1.6.0] — 2026-05-14

### Added

- **One-click sync for favorited Deezer playlists** ([#60](https://github.com/DRAZY/deemix-remastered/issues/60)). Each row on **Favorites → Playlists** now has a **Sync** button that pins the playlist to the existing playlist-sync engine with a 24-hour schedule. A second button at the top of the tab — **Sync all favorite playlists** — bulk-pins every favorited playlist that isn't already in sync, skipping duplicates and toasting a `{added}/{skipped}` summary. Each card surfaces a status badge (Syncing / Synced / Partial / Sync error / Sync pending) so the user can see at a glance which playlists are caught up, mid-sync, or failing. Idempotent: clicking Sync on an already-synced playlist is a no-op and the button flips to a disabled "Synced" state.
- **Artist sync engine** ([#61](https://github.com/DRAZY/deemix-remastered/issues/61)). New parallel sync engine (`electron/services/artistSync.ts`) that watches pinned Deezer artists for new releases and auto-downloads them on a schedule. Mirrors the playlist-sync architecture but diffs **album IDs** against the artist's `/artist/{id}/albums` discography instead of tracks against a playlist. Per-artist filters control which release types are downloaded — defaults are **Albums on, EPs on, Singles off, Compilations off, Features off** — and a per-artist `minReleaseDate` lets users bound how far back to look. Three first-sync modes:
  - `subscribe-forward` (default) — capture the current discography into `knownAlbumIds` without downloading anything; only future releases trigger downloads. Safest for prolific artists.
  - `download-backlog` — download the entire filtered discography on first sync.
  - `date-threshold` — download everything from `minReleaseDate` forward, subscribe-forward for older.
  Engine respects the existing `maxConcurrentDownloads` setting for the actual track downloads, and caps itself at 3 concurrent artist syncs so the scheduler can't stampede.
- **Favorites → Artists tab now has Pin to Sync UX** ([#61](https://github.com/DRAZY/deemix-remastered/issues/61)). Per-artist **Pin to Sync** button + same 5-state status badge as #60, plus a top-bar **Sync all favorite artists** bulk action that pins every favorited artist (idempotent, skipping already-pinned).
- **Synced Artists section on the Sync page.** Appended below the synced-playlists list. Full row UI per artist: status pill (`success` / `partial` / `error`), first-sync-mode badge, schedule, album + track totals, last-sync timestamp, live progress with current album name, expandable failed-albums list, and per-row Sync Now (right-click for force re-check) / Enable-Disable / Remove controls. **Sync All Artists** button kicks the whole list off in sequence.

### Engineering

- New `artistSync.ts` engine alongside `playlistSync.ts` (chose two-engines over a `SyncedSource` discriminated union — playlist diffing and discography diffing are structurally different enough that cohabitating in one type would force every code path to branch anyway).
- New `/api/sync/artists*` HTTP surface on the embedded server: `GET/POST/PUT/DELETE /api/sync/artists`, plus `/run`, `/run-all`, `/reset`, `/cancel` operations.
- New `artistSync:*` IPC channels (`start`, `progress`, `complete`, `error`) and matching `window.electronAPI.artistSync` preload bridge.
- New `useArtistSyncStore` Pinia store mirroring `useSyncStore` so renderer code follows one pattern.
- Artist-sync engine state persisted at `userData/artist-sync.json`, independent from `playlist-sync.json`.
- Shares the download-settings provider with the playlist engine so quality, folder structure, templates, and metadata stay consistent across both sync types.

## [1.5.8] — 2026-05-11

### Fixed

- **Missing album / playlist / artist covers on Home, New Releases, and search results.** The card components (`AlbumCard.vue`, `TrackCard.vue`, `ArtistCard.vue`) had a one-shot error flag: once any image failed to load, the placeholder music-note icon was shown for the rest of the session for that card — even if the network recovered. The same bug also meant a 404 on one cover-size variant never fell through to the other available sizes (`cover_medium` failing wouldn't trigger a try at `cover_big` or `cover_small`). Both issues now fixed: image loading walks down the available size variants on error, and the error state resets when the underlying album/track/artist ID changes (so component reuse during scroll/route changes recovers cleanly).
- **macOS unsigned builds are now properly ad-hoc signed.** v1.5.7's macOS artifacts were built with `-c.mac.identity=null`, which left only a linker-stub signature on the Mach-O binary and never wrote a `_CodeSignature/CodeResources` bundle manifest. Gatekeeper treated those .apps as *tampered* rather than *unsigned* and refused to surface the "Open Anyway" override. v1.5.8 uses `-c.mac.identity=-` (proper ad-hoc bundle signing) so `codesign --verify --deep --strict` passes and the standard Gatekeeper override flow works as expected.

## [1.5.7] — 2026-05-11

### Fixed

- **`getaddrinfo ENOTFOUND e-cdns-proxy-*.dzcdn.net` download failures.** Deezer retired the legacy sharded track CDN (`e-cdns-proxy-{0-f}.dzcdn.net`) in May 2026 — Amazon Route 53 now returns NXDOMAIN for every shard from the authoritative `dzcdn.net` SOA. The v1.5.6 legacy-CDN fallback for region-shifted releases (issue [#57](https://github.com/DRAZY/deemix-remastered/issues/57)) was added against this CDN, so it stopped working the moment Deezer cut the records. All track downloads now go exclusively through Deezer's modern Media API (`https://media.deezer.com/v1/get_url`), which is the only path Deezer continues to support — it returns signed URLs against whichever CDN Deezer currently routes to, so it survives future CDN migrations without client changes.
- **Clearer error when a track is genuinely unavailable.** The previous "all versions exhausted" message has been replaced with an explanation that the track is likely geo-restricted, requires Premium, or has been removed from Deezer's catalog — surfacing the real cause instead of the misleading DNS failure that v1.5.6 would emit at the end of the fallback chain.

### Changed

- Removed the dead `generateTrackUrl` AES-signed-URL builder from `deezerAuth.ts` and its never-called sibling `generateDownloadUrl` from `downloader.ts`. Both constructed URLs against the retired CDN. Dropped the `aes-js` dependency (only used by those two functions).
- Removed the unused `getLegacyMediaUrl` stub from `deezerAuth.ts`.

### Known limitations

- Region-shifted releases (the v1.5.6 use case — e.g., a New Zealand–registered account hitting NZ-only early releases from a Bulgarian IP) cannot currently be recovered. The modern Media API enforces IP geo, and Deezer no longer publishes a signature-based escape hatch. The download will now fail cleanly with the new error message instead of producing a confusing DNS failure.

## [1.5.6] — 2026-05-01

### Fixed

- **Region-shifted releases now download** ([#57](https://github.com/DRAZY/deemix-remastered/issues/57)). For users on Premium accounts whose region timezone makes a release available earlier than their physical location (e.g., a New Zealand–registered account on a Bulgarian IP, where NZ-only early releases would load in the analyzer but fail to download), the download path now falls back to the legacy CDN URL when Deezer's modern Media API rejects the stream request. The legacy URL is signature-based rather than IP-geo–enforced, matching the behavior of the original Python deemix. Auth-related errors (401, expired session) still surface correctly — only non-auth Media API failures trigger the fallback.

## [1.5.5] — 2026-04-30

### Fixed

- **Link Analyzer no longer hangs on slow or missing Deezer responses** ([#57](https://github.com/DRAZY/deemix-remastered/issues/57)). The public Deezer API call had no request timeout, so an unresponsive endpoint left the analyzer spinning forever with no error. All public REST calls now enforce a 15-second timeout and surface a clear "Deezer API request timed out" message.

### Added

- **Authenticated gateway fallback for region-restricted content in the Link Analyzer.** When Deezer's public REST returns "no data" for a track or album (often happens for region-locked releases — e.g., a New Zealand–only single viewed by a New Zealand–authenticated user), the analyzer now retries via the authenticated gateway using the user's account region. Responses are normalized so the existing UI renders them unchanged.
- **Clearer Link Analyzer error messages.** Deezer error code 800 ("no data") now reads "This content isn't available in your region" when signed in, or prompts to sign in when signed out. Error code 4 reads "Invalid Deezer URL or content ID."

## [1.5.4] — 2026-04-29

### Added

- **Playlist Sync now generates an M3U file** ([#59](https://github.com/DRAZY/deemix-remastered/issues/59)). Each sync run produces a timestamped `.m3u8` snapshot (`{playlist name} - YYYY-MM-DD_HH-MM-SS.m3u8`) so users can see exactly what tracks were synced and when. Mirrors the behavior of normal playlist downloads. Honors the `Create Playlist File` setting.
- **New M3U filename template tokens** — the `m3uNameTemplate` setting now also supports `%time%` (`HH-MM-SS`) and `%datetime%` (`YYYY-MM-DD_HH-MM-SS`) in addition to the existing `%playlist%`, `%date%`, and `%year%` tokens.

## [1.5.3] — 2026-04-28

### Fixed

- **Large playlists and albums no longer truncate at 500 tracks** ([#58](https://github.com/DRAZY/deemix-remastered/issues/58)). The download path was making a single non-paginated request to Deezer's `/playlist/{id}/tracks?limit=500` and `/album/{id}/tracks?limit=500` endpoints, silently dropping anything past the first page. A 1100-track playlist would queue only 500 tracks. Both download handlers now paginate (100-track batches, follow `next`, 10,000 safety ceiling), matching the existing pattern in the browse path.
- **Playlist Sync add/remove toast no longer throws.** `SyncView` was calling a non-existent `toastStore.addToast(...)` method; replaced with the correct `success(...)` / `error(...)` calls.
- **Artist page discography loading no longer errors.** `ArtistView` was reading `downloadStore.serverPort.value`, but Pinia auto-unwraps refs in components so `.value` on a number was a runtime error.
- **Profile actions no longer throw their toasts.** `ProfileSelector` had 8 `addToast` calls with the same wrong-method-name bug; all replaced with the correct store methods.

### Changed

- Internal: typecheck cleanup pass — resolved 61 pre-existing TypeScript errors so `vue-tsc --noEmit` passes clean. Added a GitHub Actions workflow that runs typecheck on every push and PR to `main`.
- Internal: housekeeping — added `LICENSE` (GPL-3.0), `SECURITY.md`, `CHANGELOG.md`, issue templates, architecture diagram, and troubleshooting guide. Refreshed README screenshots. Removed unused `deezer-js` dependency and confirmed dead code in several views.

## [1.5.2] — 2026-04-26

### Changed

- **Refreshed app icon.** Replaced the prior purple-gradient circular icon with a vibrant paper-cut layered squircle design (cobalt blue background, stacked lime-and-mint paper-cut "D", coral equalizer bars, and download arrow). Updated installer/dock/taskbar icons, the in-app sidebar logo, and the About page logo.
- **Linux `.deb` builds now succeed on macOS hosts automatically** via a `scripts/build-tools/ar` shim that redirects to GNU `ar` (since macOS ships BSD `ar` which produces malformed Debian archives). The npm build scripts wire it in automatically.

> Icon-only release. No functional or behavioral changes from v1.5.1.

## [1.5.1] — 2026-04-26

### Added

- **New Releases Page.** Dedicated page showing all 100 of Deezer's latest album releases, accessible via the **See all** link on the Home page's New Releases section.
- **Unified Export/Import Configuration.** Bundles settings *and* profiles into a single export/import flow — replaces the prior settings-only export.

### Changed

- Moved Export/Import Settings buttons into the Profiles section for a cleaner Settings layout, with a visual separator between profile and settings buttons.
- Removed the redundant separate Import Profile button now that Import Configuration covers both.

### Fixed

- Export/Import Configuration round-trips correctly (profiles + settings are restored intact).
- Download statistics now normalize format names so MP3/MP3_320/FLAC roll up correctly.
- Bulk favorites download handles missing or invalid playlist data gracefully instead of failing the whole batch.
- Allowed GitHub API in CSP so the in-app update checker works.

## [1.5.0] — 2026-04-09

### Added

- **Download Statistics Dashboard.** View total downloads, total tracks, top artists, format breakdown, and weekly activity directly on the Downloads page.
- **Duplicate Album Detection.** Warns when an album already exists on disk before downloading.
- **Download Next.** Move pending items to the front of the download queue with one click.
- **Playlist Cover Artwork.** Playlist covers are saved as `cover.jpg` in the playlist folder, or as `{playlist name}.jpg` in the root download directory when no playlist folder is created. Covers are now saved for Deezer, Spotify, and Playlist Sync downloads.
- **Public/Private Badge** for Spotify playlists in the Link Analyzer.

### Changed

- Default concurrent downloads bumped from 3 to 5 for better out-of-box performance.
- Updated to Vue 3.5.32 and electron-builder 26.8.1.
- All HTTP calls in the downloader now have connection and stall timeouts to prevent hanging downloads.
- Compilation/sampler album tracks are now grouped under the album-level artist folder instead of being split across many per-track folders.

### Fixed

- Resolved tracks (FALLBACK / ISRC matches) now keep their original album track number instead of inheriting the alternative version's number.
- Retried failed tracks stay grouped under the parent album/playlist with preserved track counts, instead of becoming orphaned individual downloads.
- Delete Files now removes the entire playlist folder, not just a subfolder.
- M3U generation has an activity-based fallback that triggers after 30s of inactivity, plus a safety timeout for bulk playlist downloads, and only emits the `#PLAYLIST:` tag when the filename template matches.
- Share links pasted into Search now redirect to the Link Analyzer instead of running a literal-text search.
- Album track count is preserved across retries so progress reporting stays accurate.
- Failed album/playlist downloads now show the count of tracks that *did* complete instead of just reporting failure.
- Cancel-all properly stops in-flight bulk paste downloads and resets the queue.
- Playlist Sync now waits for downloads to complete and tracks them properly, only marking successful tracks as known. Force Full Sync is available via right-click on the sync button.
- Compilation albums use album-level explicit status for folder naming rather than per-track status.
- Album titles now wrap to 2 lines with a 3-line clamp at smaller font sizes for better card visibility.
- Better error messaging for inaccessible Spotify personalized playlists and failed Spotify conversions.

### Security

- Fixed all 8 outstanding npm dependency vulnerabilities.
- Expanded path-traversal blocked patterns; Spotify Client ID is masked in logs and error output.

## Earlier Releases

For releases before v1.5.0, see the [GitHub Releases page](https://github.com/DRAZY/deemix-remastered/releases). Highlights:

- **v1.4.0** (2026-03-29) — Auto-update checker, download progress in title bar, global paste, download history, settings export/import, playlist diff, retry-only-failed-tracks for partial playlists.
- **v1.3.0** — Spotify integration (playlist conversion via ISRC matching), playlist sync engine.
- **v1.2.0** — Security hardening (SSRF protection, sandboxed login window, error sanitization, ARL cookie domain hardening).
- **v1.1.x** — Multi-language support (22 languages), additional color themes.
- **v1.0.0** — Initial release.

[1.5.6]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.6
[1.5.5]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.5
[1.5.4]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.4
[1.5.3]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.3
[1.5.2]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.2
[1.5.1]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.1
[1.5.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.0
