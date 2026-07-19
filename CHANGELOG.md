# Changelog

All notable changes to **Deemix Remastered** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries use a compact format — short bullets, one line each. Full per-version detail and release notes live on the [GitHub Releases page](https://github.com/DRAZY/deemix-remastered/releases).

## [2.1.2] — 2026-07-19

### Security

- **Spotify client secret is never stored in cleartext.** The legacy localStorage fallback could persist the secret unencrypted when OS-level safeStorage was unavailable; it is now stored safeStorage-encrypted only, or kept in-memory for the session.
- **Server error responses never leak stack traces.** All error-status payloads pass through a central scrub that strips stack fields and collapses raw error objects to message-only.
- **Outbound request guards hardened.** The share-link redirect resolver now also rejects non-default ports, and the Deezer API proxy pins the full origin (scheme + host + port), not just the hostname.
- **Log-forgery hygiene.** User-supplied ids are passed to loggers as arguments instead of being interpolated into format strings.
- All eight open CodeQL alerts resolved; triage log at `docs/SECURITY_TRIAGE.md`.

## [2.1.1] — 2026-07-19

### Added

- **In Library chip.** Downloads whose tracks all skipped as library duplicates show an emerald IN LIBRARY chip (queue + history) explaining nothing was re-downloaded — disambiguating the bare FLAC badge from rows with a real delivered tier.
- **Hover tooltips across the Downloads views.** Truncated album/track titles reveal their full name on hover; every action icon (open folder, retry, retry-failed, download next, delete, remove) carries an instant styled descriptor.

### Fixed

- **Download queue and history now survive app updates.** Both lived only in renderer localStorage, which proved lossy across macOS version rolls — the Transfer Rack and full download history vanished on every update. They now persist to a real file in the app's data folder (`downloads-state.json`, written atomically), with existing localStorage state migrated automatically on first launch.

- **Large Qobuz playlists and albums now download in full (#100).** Qobuz pages track listings at 50 per request, and only the first page was ever fetched — a 273-track playlist queued just 50 tracks. Track pages are now followed until the full listing is held, for both playlists and albums.
- **Qobuz no longer falsely reports "session expired" on Windows and other setups (#100).** Qobuz answers an invalid request *signature* with the same HTTP 401 as a dead session token, so a wrong/stale app secret during download-URL signing killed the whole session state — Settings said connected while everything else demanded a reconnect, forever. Signature failures are now treated as app-credential problems (never session problems); genuine token expiry is still detected on ordinary authenticated calls and via an explicit token-error check.
- **Qobuz artist pages no longer render broken for imageless duplicate catalog entities** (rolled into the final 2.1.0 build): missing artist images self-heal from an exact-name sibling entity, an initial-letter tile stands in when Qobuz truly has no image, and the empty "fans" label is hidden.
- **Open-folder icon restored on duplicate-skipped downloads.** Completions that skipped every track (already in library) never recorded a file path on the queue row, hiding the open-folder button and the delivered-tier badge.

## [2.1.0] — 2026-07-18

### Added

- **Qobuz integration (hi-res downloads).** Connect your Qobuz account (Settings → Qobuz) via a real Qobuz login window — your session token is stored encrypted in OS secure storage, never in plain files. Paste a Qobuz track, album, or playlist link into the Link Analyzer, or search/browse Qobuz directly — everything flows through the same Transfer Rack queue. Qobuz files come down DRM-free, so downloads reach true hi-res FLAC (up to 24-bit/192 kHz) when your plan and the track allow, tagged (title/artist/album/ISRC + embedded cover art) and organized with your existing folder-structure and track-naming templates. Albums and playlists download as one grouped queue item; multi-disc albums get CD subfolders. A paid Qobuz plan is required (free accounts can't download). Deezer and Spotify behavior is unchanged.
- **Channel Q — a Qobuz discover tab.** Your Purchases and Favorites lead, followed by Qobuz's editorial feeds (New Releases, Editor's Picks, Press Awards, Most Streamed) and playlists, with per-row LOAD MORE and SEE ALL full-catalog pages, genre filter chips (Qobuz's own genre taxonomy), and 30-second track previews. Search has a source toggle (Deezer/Qobuz) that sticks between sessions, and Qobuz artist pages get release-type tabs (Albums/EPs/Singles/Compilations) with download buttons throughout.
- **Quality transparency on Qobuz.** Album cards carry a quality-ceiling chip (e.g. "24/192" for hi-res, "CD" for 16-bit), and downloads report the actually-delivered tier ("FLAC 24/96"). When a hi-res stream is repeatedly cut off by the CDN, the app steps down one lossless tier only if Bitrate Fallback is enabled — never silently — and the delivered tier is always disclosed.
- **Genre browsing for Deezer too.** A Genres view with Deezer's editorial picks and per-genre charts (#106).

### Fixed

- **Qobuz downloads honor the app's settings in full parity with Deezer.** Quality follows the Quality setting exactly (a format-key mismatch made every Qobuz download silently fall back to MP3 320 even with FLAC selected); Bitrate Fallback is enforced with correct file extensions and the "Lower bitrate" indicator; playlist folder/track-template/compilation tagging, cover files, embedded artwork, duplicate-track skip (by ISRC), overwrite modes, and the full tagging option set all apply. Qobuz has no lyrics API, so lyrics settings don't apply to Qobuz downloads.
- **Large-transfer reliability.** Qobuz streams use the same battle-tested HTTPS transport as Deezer with a stall watchdog, incomplete-transfer detection, and automatic fresh-URL retries; purchased releases that Qobuz only serves through its own account page now say so plainly instead of failing cryptically.
- **Track Total and Disc Total tags write for Deezer downloads (#107)** — carried in from 2.0.3.
- Review hardening: cancelling a Qobuz download now aborts the in-flight stream immediately; duplicate GET clicks can't queue an album twice; expired preview links resolve fresh on every play; failed playlist loads show a retry instead of a blank page; search and genre browsing are protected against slow stale responses overwriting newer results.

### Security

- **Deletes are recoverable and bounded.** "Delete Files" moves to the system Trash (never permanent deletion), and the download root itself can never be deleted — enforced at the app's process boundary.
- **Credential hygiene.** The Qobuz session token lives only in OS secure storage — it is never written to the settings file, browser storage, settings/configuration exports, or Backup & Restore files (the credentials segment covers Deezer/Spotify only, by design — reconnect Qobuz after restoring on another machine). Qobuz session expiry is now detected and surfaced as a clear "reconnect in Settings" prompt.
- All Qobuz server endpoints validate ids and sanitize error messages before they reach the UI.

## [2.0.3] — 2026-07-18

### Fixed

- **Track Total and Disc Total tags now write for Deezer downloads (#107).** With "Track total" / "Disc total" enabled, files were still tagged with a bare track/disc number (e.g. `5` instead of `5/12`, no disc-of-total). Deezer's private track metadata carries the track's own number but not the album-wide totals, so the tagger never had a value to write. The totals are now sourced from the album — the album context on album/playlist downloads, or an authoritative album lookup for standalone tracks — and applied to the Track Total / Disc Total tags and the `%tracktotal%` / `%disctotal%` filename tokens on both MP3 and FLAC.
