# Changelog

All notable changes to **Deemix Remastered** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries use a compact format, short bullets, one line each. Full per-version detail and release notes live on the [GitHub Releases page](https://github.com/DRAZY/deemix-remastered/releases).

> **Releasing:** add entries under `## [Unreleased]` as you work. At release time, rename that heading to `## [X.Y.Z], <date>`, add a fresh empty `## [Unreleased]` above it, then run `scripts/release-notes.sh X.Y.Z` to emit that version's notes for `gh release create --notes-file`.

## [Unreleased]

### Changed

- **Linux window can be sized narrower (#125).** On Linux the window minimum width is lowered from 1024 to 800, so it can be resized smaller than before, which helps on smaller displays and for placing it side by side manually. macOS and Windows keep the 1024 minimum.

## [2.4.1] - 2026-07-24

### Fixed

- **Linux window frame corrected (#125).** 2.4.0 applied the window frame logic backwards, which left Linux with no title bar and no window controls, and put a duplicate title bar on Windows. Linux now correctly uses a native title bar with working minimize, maximize, and top-snap, and Windows is back to a single custom title bar. macOS unaffected. Reported by username227.

## [2.4.0] - 2026-07-24

### Added

- **Multi-service Link Analyzer (#117).** A Spotify link can be converted to Deezer, Qobuz, or both, with the service picker on the analyzer. Requested by alex5908 and cisko99za.
- **Cross-service availability matrix.** In Both mode, every track shows whether it is on Deezer, Qobuz, or both, and how it matched (ISRC or search). A preferred service with automatic fallback resolves each track, and any track can be overridden by clicking its cell. Tracks on neither service are listed and skipped.
- **Per-track source chips and expandable track lists.** Every album and playlist row expands to its full track list, each track tagged with a D (Deezer) or Q (Qobuz) chip. A mixed-source download carries both chips on the row, and downloads across the app are now uniformly source-tagged.
- **Live conversion progress.** Converting a large playlist shows a progress bar with real per-track match counts instead of a static message.

## [2.3.2] - 2026-07-23

### Changed

- **Clearer, more complete disclaimers.** The in-app About disclaimer now names Deezer, Qobuz, and Spotify, states that the app is for personal use with your own accounts, and asks users to follow local laws, copyright, and each service's terms of service (it previously mentioned only Deezer and Spotify). Short per-service reminders were also added at each connect section in Settings. Localized across all 21 languages.

## [2.3.1] - 2026-07-23

### Fixed

- **Maximized window is remembered across launches.** A window closed while maximized reopened at its normal size, because only the size and position were restored, not the maximized state. It now re-maximizes on launch, and the restore-down size is saved correctly so un-maximizing still lands where expected. Reported by cisko99za.

## [2.3.0] - 2026-07-23

### Added

- **Advanced Qobuz connect (from #105).** Settings, Qobuz gains an optional Advanced section where a token minted by another tool (streamrip, qobuz-dl, and similar) can be paired with that tool's App ID and App Secret (and an optional User ID). Qobuz binds tokens to the app that created them, so a token from elsewhere previously read as "expired"; supplying the matching app credentials lets it connect and downloads sign correctly. The username and password login window and plain token paste are unchanged. Confirmed with alex5908 and cisko99za.
- **Album M3U files (#121, legacy Deemix parity).** With "create playlist file" enabled, album downloads now write an .m3u8 into the album folder alongside the tracks, matching the behavior playlists already had. Reported by username227.

### Security

- **Removed the unused `sharp` dependency (Dependabot #46, high).** `sharp` 0.34.5 carried high-severity inherited libvips CVEs but was never imported anywhere in the app (artwork sizing uses CDN-served sizes, not local resizing). Removing it resolves the alert outright and trims a native dependency from the build.

## [2.2.3] - 2026-07-22

### Changed

- **Album covers now open the album (#105 follow-up).** Clicking an album cover opens its detail page and track list, matching Spotify, Apple Music, and Deezer's own client, instead of downloading the whole album. The one-click whole-album download is now the explicit **GET** button that appears on hover. This resolves the common confusion where users clicked the cover expecting to open the album and instead queued a download, never finding the tracklist.
- **Paste-to-bulk-download is now discoverable.** A hint under the search box tells users they can paste Deezer / Spotify / Qobuz links, and that pasting several downloads them in bulk, a capability that already existed but was invisible. Localized across all 21 languages.

### Fixed

- **Spotify → Deezer conversion no longer misreports a rate-limit as "no match."** The converter's Deezer client now retries transient failures (with jittered backoff) via the shared hardened helper, and a real rate-limit surfaces as a clear "Deezer is rate-limiting, try again" message instead of silently marking every track unmatched.
- **Truncated downloads are now detected.** If a transfer closes cleanly but delivers fewer bytes than promised, it's rejected and cleaned up instead of being saved as a corrupt file.
- **Download-row cover art no longer flashes when a cover fails to load.** A failed cover (e.g. a flaky CDN response) used to trigger an infinite reload loop against a broken placeholder; it now settles on a fallback tile.
- **Track preview button now has a tooltip.**

## [2.2.2] - 2026-07-22

### Fixed

- **Spotify Link Analyzer no longer fails opaquely (#119).** The Spotify client used to collapse every non-JSON response into a bare "Failed to parse Spotify response," hiding the real cause (a transient gateway error, a rate-limit, an empty body, or a proxy page) and never retrying. It now retries transient failures (429/5xx and network errors) with backoff honoring Retry-After, and when a response genuinely can't be read it reports the HTTP status and a snippet instead of a dead-end message. The editorial-playlist error now names the real cause, Spotify's late-2024 API change that made its own curated/algorithmic playlists (Today's Top Hits, RapCaviar, Discover Weekly, links starting `37i9`) require a personal login this app doesn't use. Reported by lazside and alex5908.
- **Playlist M3U is saved with the music (#121).** With "create playlist folder" on, the `.m3u8` was written to the download root while the tracks went into the playlist's own subfolder, so it appeared to be missing. It's now written inside the playlist folder, next to the songs, with correct relative paths. Reported by username227.

## [2.2.1] - 2026-07-22

### Fixed

- **Canceling a download actually stops it (#118).** Trash-canning a queue row previously only removed it from the screen, the server kept downloading every remaining track (an entire album, in the report) until the app was quit. Cancel now stops the server-side work: pending tracks are dequeued, the in-flight stream is aborted mid-transfer with its partial file cleaned up, and completed tracks are left untouched. Clear All had the same defect and now aborts in-flight work too. Canceling in the instant before the server has even replied with download ids is also handled. Reported by cisko99za.

## [2.2.0] - 2026-07-20

### Added

- **Token-based Qobuz login (#114).** Settings → Qobuz gains an "Or connect with a token" field: paste a bare `user_auth_token` (e.g. from another tool's configuration, or when the login window is unavailable in your region) and Qobuz identifies the account from the token itself, single-field paste, validated with a plan check, stored through the same encrypted path as the login window. A bad token can never disturb an existing session.
- **Retagger Qobuz fallback (#108).** Files Deezer can't match by ISRC now fall back to Qobuz's catalog (search-then-verify, a candidate is only accepted when its ISRC equals the file's). Retag rows disclose cross-catalog sourcing with a Q chip; fields Qobuz doesn't expose stay untouched rather than guessed.
- **Full localization of the Qobuz era (#109).** Every Channel Q / Genres / token-login / downloads-UX string is keyed and translated across all 20 non-English locales.
- **Qobuz artist Top Tracks wired.** Qobuz artist pages now load the artist's popularity-ordered top tracks (the same list Qobuz's own artist page shows), so the Top Tracks section renders and Download Top Tracks queues them; the button is disabled instead of silently inert when no top tracks exist.
- **Duplicate toast covers album-downloaded tracks.** Album and playlist rows remember the catalog ids of their contained tracks, so re-queuing one of those songs as a single is refused with the familiar "already downloaded" toast instead of creating a row the ISRC library check then skips. Failed tracks inside an album stay re-downloadable.

### Performance

- **Album/playlist downloads skip a per-track metadata round-trip (#112).** The queue reuses the listing's own track metadata, falling back to a live fetch only when essentials are missing.
- **The Downloads view stays smooth with huge queues (#113).** Queue and history rows use browser-native windowing (content-visibility) so a 1,000-row Transfer Rack renders at the cost of the visible screen; the queue endpoint no longer logs a status reduce on every poll.

## [2.1.2] - 2026-07-19

### Added

- **Full genre browsing.** The Genres tab is now dual-service. Qobuz (primary): every primary genre, with a feed-tabbed (New Releases / Most Streamed / Press Awards / Editor's Picks), continuously paginated catalog grid that goes to the end of the genre. Deezer: editorial picks plus Top Tracks / Top Albums now paginate toward Deezer's 100-per-chart API cap (the public API's per-genre limit; its editorial releases endpoint is dead upstream).

- **Qobuz album covers are fetched once per album, not once per track.** The Qobuz path was missing the artwork cache the Deezer path has always had, every track re-downloaded the album cover (at >600px settings, the multi-megabyte original scan), a major share of per-track overhead on large album/playlist runs.

- **Permanent Qobuz link indicator + expiry toast.** The title-bar Q readout no longer disappears when disconnected, it shows Q:LINKED (lit cyan LED) or Q:OFFLINE (dark LED) at all times, with a tooltip. When Qobuz rejects the session token, a toast now announces it immediately ("reconnect your Qobuz account in Settings") and the indicator drops to Q:OFFLINE, previously the user only found out when a download failed.

### Security

- **Spotify client secret is never stored in cleartext.** The legacy localStorage fallback could persist the secret unencrypted when OS-level safeStorage was unavailable; it is now stored safeStorage-encrypted only, or kept in-memory for the session.
- **Server error responses never leak stack traces.** All error-status payloads pass through a central scrub that strips stack fields and collapses raw error objects to message-only.
- **Outbound request guards hardened.** The share-link redirect resolver now also rejects non-default ports, and the Deezer API proxy pins the full origin (scheme + host + port), not just the hostname.
- **Log-forgery hygiene.** User-supplied ids are passed to loggers as arguments instead of being interpolated into format strings.
- All eight open CodeQL alerts resolved; triage log at `docs/SECURITY_TRIAGE.md`.

## [2.1.1] - 2026-07-19

### Added

- **In Library chip.** Downloads whose tracks all skipped as library duplicates show an emerald IN LIBRARY chip (queue + history) explaining nothing was re-downloaded, disambiguating the bare FLAC badge from rows with a real delivered tier.
- **Hover tooltips across the Downloads views.** Truncated album/track titles reveal their full name on hover; every action icon (open folder, retry, retry-failed, download next, delete, remove) carries an instant styled descriptor.

### Fixed

- **Download queue and history now survive app updates.** Both lived only in renderer localStorage, which proved lossy across macOS version rolls, the Transfer Rack and full download history vanished on every update. They now persist to a real file in the app's data folder (`downloads-state.json`, written atomically), with existing localStorage state migrated automatically on first launch.

- **Large Qobuz playlists and albums now download in full (#100).** Qobuz pages track listings at 50 per request, and only the first page was ever fetched, a 273-track playlist queued just 50 tracks. Track pages are now followed until the full listing is held, for both playlists and albums.
- **Qobuz no longer falsely reports "session expired" on Windows and other setups (#100).** Qobuz answers an invalid request *signature* with the same HTTP 401 as a dead session token, so a wrong/stale app secret during download-URL signing killed the whole session state, Settings said connected while everything else demanded a reconnect, forever. Signature failures are now treated as app-credential problems (never session problems); genuine token expiry is still detected on ordinary authenticated calls and via an explicit token-error check.
- **Qobuz artist pages no longer render broken for imageless duplicate catalog entities** (rolled into the final 2.1.0 build): missing artist images self-heal from an exact-name sibling entity, an initial-letter tile stands in when Qobuz truly has no image, and the empty "fans" label is hidden.
- **Open-folder icon restored on duplicate-skipped downloads.** Completions that skipped every track (already in library) never recorded a file path on the queue row, hiding the open-folder button and the delivered-tier badge.

## [2.1.0] - 2026-07-18

### Added

- **Qobuz integration (hi-res downloads).** Connect your Qobuz account (Settings → Qobuz) via a real Qobuz login window, your session token is stored encrypted in OS secure storage, never in plain files. Paste a Qobuz track, album, or playlist link into the Link Analyzer, or search/browse Qobuz directly, everything flows through the same Transfer Rack queue. Qobuz files come down DRM-free, so downloads reach true hi-res FLAC (up to 24-bit/192 kHz) when your plan and the track allow, tagged (title/artist/album/ISRC + embedded cover art) and organized with your existing folder-structure and track-naming templates. Albums and playlists download as one grouped queue item; multi-disc albums get CD subfolders. A paid Qobuz plan is required (free accounts can't download). Deezer and Spotify behavior is unchanged.
- **Channel Q, a Qobuz discover tab.** Your Purchases and Favorites lead, followed by Qobuz's editorial feeds (New Releases, Editor's Picks, Press Awards, Most Streamed) and playlists, with per-row LOAD MORE and SEE ALL full-catalog pages, genre filter chips (Qobuz's own genre taxonomy), and 30-second track previews. Search has a source toggle (Deezer/Qobuz) that sticks between sessions, and Qobuz artist pages get release-type tabs (Albums/EPs/Singles/Compilations) with download buttons throughout.
- **Quality transparency on Qobuz.** Album cards carry a quality-ceiling chip (e.g. "24/192" for hi-res, "CD" for 16-bit), and downloads report the actually-delivered tier ("FLAC 24/96"). When a hi-res stream is repeatedly cut off by the CDN, the app steps down one lossless tier only if Bitrate Fallback is enabled, never silently, and the delivered tier is always disclosed.
- **Genre browsing for Deezer too.** A Genres view with Deezer's editorial picks and per-genre charts (#106).

### Fixed

- **Qobuz downloads honor the app's settings in full parity with Deezer.** Quality follows the Quality setting exactly (a format-key mismatch made every Qobuz download silently fall back to MP3 320 even with FLAC selected); Bitrate Fallback is enforced with correct file extensions and the "Lower bitrate" indicator; playlist folder/track-template/compilation tagging, cover files, embedded artwork, duplicate-track skip (by ISRC), overwrite modes, and the full tagging option set all apply. Qobuz has no lyrics API, so lyrics settings don't apply to Qobuz downloads.
- **Large-transfer reliability.** Qobuz streams use the same battle-tested HTTPS transport as Deezer with a stall watchdog, incomplete-transfer detection, and automatic fresh-URL retries; purchased releases that Qobuz only serves through its own account page now say so plainly instead of failing cryptically.
- **Track Total and Disc Total tags write for Deezer downloads (#107)**, carried in from 2.0.3.
- Review hardening: cancelling a Qobuz download now aborts the in-flight stream immediately; duplicate GET clicks can't queue an album twice; expired preview links resolve fresh on every play; failed playlist loads show a retry instead of a blank page; search and genre browsing are protected against slow stale responses overwriting newer results.

### Security

- **Deletes are recoverable and bounded.** "Delete Files" moves to the system Trash (never permanent deletion), and the download root itself can never be deleted, enforced at the app's process boundary.
- **Credential hygiene.** The Qobuz session token lives only in OS secure storage, it is never written to the settings file, browser storage, settings/configuration exports, or Backup & Restore files (the credentials segment covers Deezer/Spotify only, by design, reconnect Qobuz after restoring on another machine). Qobuz session expiry is now detected and surfaced as a clear "reconnect in Settings" prompt.
- All Qobuz server endpoints validate ids and sanitize error messages before they reach the UI.

## [2.0.3] - 2026-07-18

### Fixed

- **Track Total and Disc Total tags now write for Deezer downloads (#107).** With "Track total" / "Disc total" enabled, files were still tagged with a bare track/disc number (e.g. `5` instead of `5/12`, no disc-of-total). Deezer's private track metadata carries the track's own number but not the album-wide totals, so the tagger never had a value to write. The totals are now sourced from the album, the album context on album/playlist downloads, or an authoritative album lookup for standalone tracks, and applied to the Track Total / Disc Total tags and the `%tracktotal%` / `%disctotal%` filename tokens on both MP3 and FLAC.

## [2.0.2] - 2026-07-16

### Fixed

- **Restored the "New Releases" section on Home, now showing genuinely new, dated releases.** Deezer retired the public endpoint that fed it, so the section had quietly disappeared. It now reads Deezer's real new-release feed, including your personalized "New releases for you" list when signed in, newest first from the last 90 days. Home shows the 30 most recent; See All shows the full window. Old catalog stays out.

## [2.0.1] - 2026-07-15

### Fixed

- **Lyrics files now match their audio file's name (#104).** Synced `.lrc` and plain `.txt` lyrics were named from the bare track title, so with a template like `03 - Song` the lyrics file was called `Song.lrc` and players that match by filename never found it. Lyrics files now take their name directly from the audio file, on every download path including playlist and artist sync.

## [2.0.0] - 2026-07-14

### Changed

- **A complete redesign: "Signal Deck."** The app moves to an industrial-console look: acid chartreuse on blue-black, bold display type, hard edges, and monospaced readouts. The title bar is a live status strip (connection LED, region, quality, real-time throughput, clock), the sidebar is a numbered channel rail with a download-activity sparkline, and the download panel is a "Transfer Rack" where each download is a hardware-style unit with a 16-segment meter and a status edge-light. Search is a QUERY command bar with dense console rows. Signal is the new default theme, every previous theme is kept, and light mode gets a tuned "paper console" variant. Downloads, sync, retag, and settings behave exactly as before.

### Added

- **New DM/RM "Console Stack" app icon**, stacked chartreuse letters with a cyan cursor, on the Dock/taskbar, sidebar, and every OS build.
- **Live album and playlist download speed, plus a clickable "Alternate version" badge** that lists exactly which tracks were fulfilled from an ISRC-matched alternate release, in the panel and in history.

## Earlier releases

Versions before 2.0.0 (the 1.10.x line and earlier) are not detailed here. See the [GitHub Releases page](https://github.com/DRAZY/deemix-remastered/releases) for the full history.
