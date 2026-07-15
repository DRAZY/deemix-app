# Changelog

All notable changes to **Deemix Remastered** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries from v1.7.5 onward use a compact format — short bullets, one line each. Full per-version detail and release notes live on the [GitHub Releases page](https://github.com/DRAZY/deemix-remastered/releases).

## [2.0.0] — 2026-07-14

### Changed

- **Complete UI redesign: "Signal Deck."** The entire interface moves to an industrial-console aesthetic — acid chartreuse on blue-black, Archivo Black display type, IBM Plex Sans/Mono (bundled, fully offline), hard edges throughout. Highlights: the title bar is a live status strip (link LED, region, quality, live throughput, clock); the sidebar is a numbered channel rail with a download-activity sparkline; the download panel is a "Transfer Rack" of hardware-style units with 16-segment VU meters and status-coded edge lights; search is a QUERY command bar with dense console-row results and GET ↓ buttons; every view carries display-type headers with mono kickers; and a subtle scanline + vignette atmosphere overlays the Signal theme only. Ships as a new default "Signal" color theme — all previous themes remain available, existing installs keep their saved theme, and light mode gets a tuned "paper console" olive variant. No functional changes: every download, sync, retag, and settings behavior is carried over intact.
- **Readability bump on core reading type.** Sidebar nav labels and track titles 13 → 14.5 px, track artist line 11.5 → 12.5 px, mono index/duration 11 → 12 px — same weights, colors, and spacing; deliberate mono micro-labels are unchanged.
- **New app icon: "DM/RM Console Stack."** The brand mark is now the DM/RM monogram — chartreuse stacked letters with a cyan block cursor on blue-black — replacing the legacy icon across every surface: macOS Dock (`icon.icns`, Apple rounded-rect with proper alpha margins), Windows taskbar/Explorer (`icon.ico`, 16–256 px), Linux (`icon.png`), the in-app sidebar mark, and the dev favicon.

### Added

- **Live throughput for album/playlist downloads.** Group rows aggregate the in-flight per-track speeds, so the Transfer Rack, sidebar sparkline, and title-bar meter show real numbers during batch downloads instead of 0.
- **Alternate-version drill-down.** The "Alternate version" badge on album/playlist downloads is now clickable with a count, opening a list of exactly which tracks were fulfilled by an ISRC-matched alternate release; rack units show an ALT count and download history keeps the list.

## [1.10.34] — 2026-07-13

### Fixed

- **Resync no longer creates wrong-numbered duplicate tracks (#102, #103).** When an unavailable track was resolved to an alternate release (the ISRC/FALLBACK "Alternate version" path), the downloader wrote the original track/disc numbers into a *shared cached* metadata object. A later download of the resolved track within the hour-long cache window then inherited another release's numbering — so a force resync could re-download a track that already existed, but named as e.g. track 1 or `1-01` instead of its real position, and the "skip existing files" check couldn't match the wrongly-named file. Track metadata now comes back as a defensive copy so one download can never poison another, and album downloads additionally pass the album tracklist's authoritative position as a backstop when Deezer's private record for a restricted track is missing its numbers.

## [1.10.33] — 2026-07-08

### Changed

- Security hardening and minor improvements.

## [1.10.32] — 2026-07-08

### Changed

- Some minor feature enhancements and refinements.

## [1.10.31] — 2026-07-08

### Added

- **ReplayGain tag writing, now actually wired.** The app has long had a "Replay Gain" toggle under Settings → Metadata tags, but nothing was ever written when it was on. It now writes a standard `REPLAYGAIN_TRACK_GAIN` tag, computed from Deezer's own per-track gain value using the same formula as the original Deemix, to both MP3 (an ID3v2 `TXXX` frame) and FLAC (a Vorbis comment). ReplayGain-aware players such as foobar2000, VLC, and Rockbox read this tag to normalize playback loudness toward Deezer's reference, so a download can sound closer to in-app Deezer playback instead of playing at the master's full un-normalized level. This is metadata only: the tag is a loudness hint a player may act on, and no audio bytes are changed (verified: the decoded audio is byte-identical before and after the tag is written). It is **off by default** and only written when you opt in. The same tag is available on the Refresh-tags path and the standalone Retag view, so existing files can be backfilled without re-downloading. Most DJ software runs its own gain analysis and ignores file ReplayGain tags, so this mainly benefits ReplayGain-aware music players.

## [1.10.30] — 2026-07-06

### Added

- **Downloads now surface quality fallbacks and track substitutions (follow-up to #99).** Two things the downloader already did quietly are now visible in the Downloads list and history. When a track is delivered at a lower bitrate than requested (you asked for FLAC or 320 kbps but Deezer only had a lower quality for that specific track), the row shows a **Lower bitrate** badge whose tooltip names the requested and actual format and makes clear the audio was served at the catalog's available quality, not re-encoded. When the exact track is unavailable for your account and the downloader resolves an ISRC/FALLBACK-matched copy from a different release, the row shows an **Alternate version** badge whose tooltip explains the audio is an exact copy of that release but may be a different master, so it can sound slightly different from the track you picked. This is purely a surfacing change: the download path, the bit-exact copy of Deezer's source, and the existing fallback behavior are all unchanged. It exists so a mismatch between what you hear and what you expected has a visible, checkable explanation instead of being silent.

## [1.10.29] — 2026-07-03

### Fixed

- **Album/playlist download progress bar now matches the track count.** The percentage next to an album download was a byte-weighted average across every track in flight, while the "X/Y" count next to it only counts tracks that have fully finished. Because the concurrency limit lets several tracks download at once, the byte progress ran ahead of the finished count, so an album could show "1/10" tracks alongside a 59% bar, which reads as contradictory. The bar is now the fraction of tracks finished, measured against the album's original total, so it always agrees with the count you see (1/10 shows as 10%). This also corrects the bar for retried albums, which previously measured only against the retried subset. Single-track downloads still show smooth byte-level progress, and the detailed bytes line is unchanged.

## [1.10.28] — 2026-06-30

### Added

- **Optionally resume interrupted downloads on startup (#98).** Since v1.10.6 a download that was still in progress when the app closed is flagged on the next launch as retryable, so you can click Retry to continue it (already-downloaded tracks are skipped). This adds a setting — **Settings → Downloads → "Resume interrupted downloads on startup"**, off by default — that does that automatically: when enabled, any download interrupted by the app closing is continued for you the next time you open the app. It runs only after you're logged in (a resume re-queues real downloads that hit Deezer), reuses the existing retry path so already-downloaded tracks are skipped, and respects your concurrency and pacing limits. Off by default, so nothing changes unless you turn it on.

## [1.10.27] — 2026-06-29

### Fixed

- **Download concurrency could briefly run at the default during startup syncs (#97).** The download concurrency limit is global and shared across all syncs and manual downloads, so running several syncs at once can never exceed the configured number (verified directly: with up to 20 sync workers competing at a setting of 5, the peak simultaneous downloads stayed at exactly 5). The one edge that existed: the downloader kept its built-in default (5 concurrent, pacing off) until the app's window pushed settings to it, so a sync triggered on launch could race that push and briefly run at the default instead of a value you had lowered. The app now applies your saved concurrency and pacing the moment the backend starts, before any sync can run, so a launch sync always uses your setting. No effect on the normal path.

## [1.10.26] — 2026-06-25

### Fixed

- **Album tag could disagree with the folder name during sync (#96).** The folder name is sourced from the album context (the release being downloaded), but the written ALBUM tag was sourced only from the track's own metadata (`ALB_TITLE`). For most releases these are identical, but when a track is relinked to a different release (e.g. a single whose audio resolves to the album version) the folder and the tag could name different albums. The ALBUM tag now uses the same source as the folder name (`albumContext` → track metadata), mirroring how the ALBUMARTIST tag already works — so the tag and folder always agree. Applied to both the MP3 and FLAC tag writers (the FLAC refresh path already did this). Note: this aligns the tag with the folder; it does not de-duplicate separate single-release folders, which is tracked separately.

## [1.10.25] — 2026-06-24

### Fixed

- **Sync ignored the "create CD folders" setting for multi-disc albums (#95).** Artist sync downloaded every track of a multi-disc album straight into the album root instead of `CD1`/`CD2` subfolders, even with the setting enabled — which also produced duplicates against albums previously pulled (correctly, into CD folders) from the artist page. Root cause: the sync download path passed neither the track's disc number nor the album's disc count, so the CD-folder rule (`createCDFolder && discNumber && totalDiscs > 1`) could never fire. Sync now builds the same authoritative album context a manual album-page download uses and passes `discNumber` per track, so multi-disc albums land in CD subfolders during sync — and, more broadly, synced downloads now match album-page downloads for folder naming, the RELEASETYPE tag (#82), and `%upc%`/`%label%` templates. The album-context builder is now a shared single source of truth (`electron/services/albumContext.ts`) used by both paths. Verified against a real 2-disc album via the sync engine.

## [1.10.24] — 2026-06-24

### Fixed

- **"Retry failed tracks" sent the retried tracks to the root download folder instead of the original album/playlist folder (#94).** The retry posted only the bare track ID, with no album/playlist context, so the server treated each retried track as a standalone single and filed it under the download root — leaving users to hunt down the files and move them back by hand. Retry now forwards the parent item's context: album items send the `albumId` (the server rebuilds the authoritative album context — same folder, tags, disc layout as the original download), and playlist items send the `playlistName` (the playlist folder is recreated). The album-context builder is now a single shared source of truth in `electron/server.ts`, so a retry can't drift to a different folder than the original. Standalone single downloads are unaffected (they have no parent folder). Verified end-to-end against the live gateway: a retried album track lands in `…/Artist/Artist - Album/`, a context-less single stays in the artist root.

## [1.10.23] — 2026-06-22

### Fixed

- **Artist sync silently skipping albums marked "already existing" that weren't on disk (#93 follow-up).** Sync trusted its internal `knownAlbumIds` ledger over the filesystem, and an album was added to that ledger if *even one* track downloaded — so partially-downloaded albums (and, via the old `subscribe-forward` default, entire un-downloaded catalogs) were marked complete and skipped on every future sync, never surfacing in the failed list. Now an album earns a `knownAlbumIds` entry **only when every track is accounted for**. Per-track failures are classified via the downloader's `errorDetails.code`: permanent failures (`GEO_RESTRICTED`/`TRACK_UNAVAILABLE`) are accepted and surfaced ("N unavailable in your region"); transient failures keep the album out of the ledger so the next sync retries just the missing tracks (the downloader skips files already on disk), **bounded by a 3-attempt cap** so nothing retries forever. New persisted `partialAlbums` ledger on each synced artist; **Force Full Sync** now also clears it. Verified end-to-end against the real sync engine (transient→heal, permanent→accept, cap→stop).

### Changed

- **Pin-to-Sync now asks how to handle an artist's existing catalog (#93).** Pinning an artist from Favourites (single or "sync all") opens a mode chooser — **Download full discography now** (new default), **Watch for new releases only**, or **From a date** — instead of silently using `subscribe-forward`, which downloaded nothing and made pinning look broken. The first-sync mode labels in the Add-Artist dialog were reworded to make each option's effect explicit.

## [1.10.22] — 2026-06-19

### Fixed

- **Full artist sync silently skipping albums under load (#93).** Artist sync enumerated a discography through its own raw `https.get` calls with no pacing or retry — so a quota burst on a large discography (or several syncs at once) made Deezer return "Quota limit exceeded" and the affected albums were dropped straight into `failedAlbums` with no recovery. Random-looking, load-dependent, hard to reproduce. Both sync engines now route every public-API lookup through a new paced, quota-aware client (`electron/services/deezerPublicApi.ts`): a global jittered min-gap between request starts plus exponential-backoff-with-jitter retry. This extends the #84 quota fix to the one set of call sites it never reached. Verified against a 90-release artist: ~40 albums dropped under an 8-wide burst → **0** through the new client.

### Changed

- **Reliable Sync-view tooltips.** The synced-playlist and synced-artist row buttons (sync, edit, enable/disable, remove) used native HTML `title`, which showed inconsistently — often only one label, sometimes the wrong text bleeding from an adjacent button. New dependency-free `v-tooltip` directive (`src/directives/tooltip.ts`) renders a single body-teleported tooltip per element: instant, correctly positioned, keyboard-accessible (`aria-label`), and reactive (the enable/disable label flips live). Applied to the Sync view; native `title` remains elsewhere for now.

## [1.10.21] — 2026-06-16

### Added

- **Skip duplicate tracks by ISRC (#91/#92).** New opt-in setting (Settings → Downloads, off by default): before downloading, skip any recording already in your library, matched by **ISRC** rather than filename. This catches the same song appearing on a different album, single, or compilation — the common cause of "why do I have two copies of this track?" Tracks with no ISRC are always downloaded, nothing is ever deleted, and a one-click **Index existing library** button backfills the index so it works on a collection downloaded before the feature existed. Applies to single, album, playlist, batch, and both sync engines. New `library-index.json` (ISRC → path) in userData; new `electron/services/libraryIndex.ts`. Setting + backfill UI translated across all 21 locales.

## [1.10.20] — 2026-06-15

### Added

- **Sort and filter the Sync view (#90).** Finding a specific playlist or artist in a long sync list is now quick. Each section (synced playlists and synced artists) gets its own controls: a name filter box and a sort dropdown — by date added (default, unchanged from before), name, last synced, status, or tracks downloaded — plus an ascending/descending toggle. Sort choice persists between sessions; the filter resets each visit. Controls only appear once a section has more than one entry, and an empty filter shows a "No matches" line. Sort/filter labels are translated across all 21 locales.

### Changed

- **Clearer artist-separator label (#89).** The default comma+space separator was labeled "Standard specification (null byte)," which hid it from users looking for `Artist A, Artist B` output. Renamed to "Comma + space (, ) — default" and translated across all locales. Label only — separator behavior is unchanged.

## [1.10.19] — 2026-06-10

### Fixed

- **Pause now actually stops an in-progress download.** v1.10.18 wired up the Pause button, but the app's pause only set a flag that blocked *new* downloads from starting — the in-flight track had no abort hook, so it streamed to completion (you could pause and the current download would still finish). Each active CDN fetch now gets an `AbortController`; `pauseQueue()` aborts the in-flight download(s) mid-stream and re-queues them, and `resumeQueue()` restarts them. Verified end-to-end on a real FLAC download: paused at 44% → download aborted and re-queued (no completion) → resume → downloaded to completion. (Paused tracks restart from the beginning on resume — near-instant for music files; true byte-level resume was intentionally not pursued as over-engineering for small files.)

## [1.10.18] — 2026-06-09

### Fixed

- **Slow skip of already-downloaded files with pacing on (#88).** When Natural Download Pacing (v1.10.17) was set to Balanced/Cautious, the pacing gate sat in `processQueue()` and delayed *every* queued item before the downloader checked whether the file already existed — so re-downloading a library you already had crawled (each skip waited the full ~2.5s/~7s jittered gap), even though a skip makes no Deezer request. Pacing now lives in `processDownload()`, **after** the skip check and right before the actual CDN fetch (via a concurrency-safe `awaitPacingSlot`), so already-downloaded files skip instantly and only genuinely-new downloads are paced.
- **Pause button on the bottom download bar did nothing.** The Pause control in `DownloadBar.vue` had no click handler wired. It now pauses/resumes the queue and shows a play icon while paused (matching the Downloads page).

### Changed

- **Drag-and-drop in the download list now reprioritizes for real.** Previously dragging only rearranged the on-screen list; the actual download order was unchanged. A drag now pushes the new order to the backend queue (`POST /api/queue/reorder` → `downloader.reorderPending`), flattening album/playlist rows into their track IDs, so the order you see is the order that downloads. The ↑ "Download next" button still jumps a track to the front.
- **Clearer Release Type tag label.** Settings → Metadata tags now shows "Release Type (Album / Single / EP)" with an info tooltip, instead of the cryptic "Release Type (RELEASETYPE)".

## [1.10.17] — 2026-06-07

### Added

- **Natural download pacing — tiered opt-in (#86).** A new "Natural Download Pacing" setting under Settings → Downloads with three tiers: **Off** (default), **Balanced**, and **Cautious**. When set to Balanced or Cautious, the downloader spaces out the start of each new download with a small randomized (jittered) delay instead of firing them back-to-back, so a large discography or sync run doesn't hit Deezer as a single burst — the pattern that can trip Deezer's "unusual activity" detection and force a password reset. Balanced spaces starts ~2.5s apart (jittered); Cautious ~7s apart for the most natural cadence. Off is a true no-op: the pacing gate is bypassed entirely and downloads behave exactly as before at full speed. The gate lives in the shared download queue, so it also covers Artist Sync and Playlist Sync automatically. Concurrency is untouched; for the most natural pattern, pair Cautious with Concurrent Downloads set to 1. Honest scope: this reduces burst volume (the main trigger), it does not make downloading undetectable.

## [1.10.15] — 2026-06-05

### Fixed

- **Applying an ARL token in Settings now logs the app in everywhere.** The Deezer Account panel showed "Logged in as &lt;user&gt;" after Apply, but the sidebar still showed "Login with Deezer / Login required to download" and downloads stayed gated. Root cause (present since v1.0.0): `SettingsView`'s Apply handler made its own `POST /api/auth/login` and updated only the panel's local state — it never touched the shared `authStore` that the sidebar and download gating read, so the server session was valid while the app's global auth state stayed logged out. Apply (and the on-mount status) now go through `authStore.login()`, so a successful Apply flips the whole app to logged-in (and persists the ARL via the encrypted credential store).

## [1.10.14] — 2026-06-05

### Fixed

- **RELEASETYPE tag now actually written on download (#85).** The tag only appeared after a manual retag. Root cause: the server's `/api/settings` handler validated incoming tags against a hardcoded key allowlist that didn't include `releaseType`, so the setting was silently dropped when the frontend synced settings — the downloader then saw no `releaseType` and skipped it (retag paths bypass that allowlist, which is why retagging worked). Fixed by adding `releaseType` to the settings allowlist and the server's default tags, and making the download writer default the tag on when the key is absent (only an explicit opt-out suppresses it). Verified end-to-end on real MP3 and FLAC downloads.

## [1.10.13] — 2026-06-04

### Added

- **Backfill RELEASETYPE onto existing libraries (#82 follow-up).** The retag path now writes the release type too, so the v1.10.12 tag isn't limited to new downloads. Both **Retag Library** (with a new "Release Type" field checkbox) and the album/playlist **Refresh tags** action now embed `RELEASETYPE` + `MusicBrainz Album Type` (MP3) / `RELEASETYPE` + `MUSICBRAINZ_ALBUMTYPE` (FLAC), derived from Deezer's `record_type`. Retag-in-folder uses the authoritative album, so it can be more accurate than a bare single lookup. Same EP caveat as v1.10.12 (Deezer mislabels many EPs). Verified end-to-end on real MP3 and FLAC files.

## [1.10.12] — 2026-06-04

### Added

- **RELEASETYPE tag for Navidrome album/single/EP separation (#82).** Downloads now embed the release type (`Album` / `Single` / `EP` / `Compilation`) derived from Deezer's `record_type`. Written for MP3 as `TXXX:RELEASETYPE` + `TXXX:MusicBrainz Album Type`, and for FLAC as `RELEASETYPE` + `MUSICBRAINZ_ALBUMTYPE` Vorbis comments — matching Navidrome's releasetype tag aliases so it auto-separates releases. New **Release Type** toggle under Settings → Metadata tags (on by default). Caveat: Deezer's type is reliable for albums/singles/compilations but frequently mislabels EPs, so EP detection is best-effort. Verified end-to-end on real MP3 and FLAC downloads.

## [1.10.11] — 2026-06-04

### Fixed

- Extended the #84 quota fix to every remaining bulk-enumeration path. v1.10.10 paced the artist-page discography download and the pasted-artist-link flow; this release applies the same pacing, second-pass retry, and "couldn't load N releases" reporting to **Favorites → Download all** (albums and playlists), **Search → download selected**, and the **bulk paste-links** loop. The gateway/download path (`deezerAuth.withRetry`) now also retries Deezer rate-limit/quota responses with jittered backoff, not just network errors.

## [1.10.10] — 2026-06-04

### Fixed

- Discography downloads no longer trip Deezer's "Quota limit exceeded" rate limit while building the queue (#84). The list-build fired metadata requests in an un-paced burst — independent of the "max concurrent downloads" setting — which on large discographies exceeded Deezer's limit and silently dropped releases. Requests are now paced, retried with longer jittered backoff, and the 20-wide detail fetch is throttled; any release that still fails after a second pass is surfaced to the user instead of disappearing.

## [1.10.9] — 2026-06-03

### Fixed

- **"Various Artists" releases now write the correct ALBUMARTIST tag.** On a compilation download, the folder was named "Various Artists" correctly but the embedded `ALBUMARTIST` tag was getting the individual track's performer instead. The folder and tag were computed from two different sources — folder naming consults the public-API album artist (via `albumContext`), while the MP3/FLAC tag writers only read the private-API per-track fields. The tag writers now use the same album-artist precedence as folder naming (`albumContext.albumArtist` → public-API resolved → private track fields), so the tag matches the folder. Normal single-artist albums are unaffected, and the "keep Various Artists" opt-out still works. (#83, `downloader.ts`)

## [1.10.8] — 2026-05-30

### Fixed

- **Tracks that failed with "Track unavailable on Deezer" despite being playable now download.** This typically hit the compilation/playlist version of a song whose streaming rights are restricted on that specific release (the public catalog still shows it as available). The download fallback chain gains a final rung: it resolves the track's ISRC against Deezer's public catalog to find the canonical original-single release and downloads that instead — the same workaround you'd do by hand. Metadata is refreshed from the resolved track while the original album/playlist track position is preserved. (`deezerAuth.getTrackUrl`)

## [1.10.7] — 2026-05-29

### Fixed

- **Interrupted downloads are now retryable instead of getting stuck.** If you closed the app mid-download (common with large queues), those items came back showing "downloading" forever with no way to continue — you had to delete and re-add the link. On startup, any download that was still in progress is now marked as interrupted so the existing **Retry** button appears; retrying re-runs it and skips already-downloaded tracks, so it effectively resumes. (Refresh-tags operations are left alone.)

## [1.10.6] — 2026-05-27

### Added

- **Retag Library: pick exactly which files to retag.** Every scanned file now has a checkbox (all selected by default, so one click still retags the whole folder). "Preview" and "Retag" act only on the files you've selected, with a **Select all** toggle and a live selected-count.
- **Recover from a Deezer timeout without redoing the list.** If a track errors mid-scan, each failed row has an inline **Retry**, plus **Select failed (N)** and **Retry failed (N)** shortcuts — retag just the affected files, reusing your last preview/write mode, without disturbing the rows that already succeeded.

### Changed

- The per-file status on the right no longer repeats "Preview changes" on every row — it now reads **"Preview"**, and the summary reads "N would change" in preview mode.

## [1.10.5] — 2026-05-27

### Fixed

- **Playlist "Refresh tags" now actually finds your files.** Refresh recomputes where a track's file should be from your current settings, but for a playlist it built a playlist-layout path (`Playlist/NNN - Artist - Title`). When the track actually lived in an **album folder** (downloaded via album) or the **playlist order had shifted** (changing the position prefix), that path didn't exist — so refresh silently did nothing, which looked like "it ignored my tag settings / dropped artists." Refresh now locates the real file across layouts: the album-folder location and a position-agnostic match by title, in addition to the playlist path. Same-title tracks in one folder are disambiguated by track number, and a genuinely ambiguous match is skipped rather than risk retagging the wrong file. (The tag-writing itself was already correct in 1.10.4 — this was a file-location bug, playlist-only.)

## [1.10.4] — 2026-05-27

### Fixed

- **"Refresh tags" now respects your tag selection.** Previously the album/playlist *Refresh tags* action wrote the full set of available tags regardless of which ones you'd disabled in Settings — so a disabled tag like Genre still got written. It now writes only the tags you have enabled (a tag missing from older saved settings still defaults to enabled, so nothing is silently dropped).
- **All credited artists are now written, not just the main one.** Both *Refresh tags* and the standalone Retag Library wrote only the primary artist. They now write every credited artist (main + featured) — e.g. "Chris Brown, Lil Wayne, Tyga" — honoring your artist-separator and *Save only main artist* / *Remove artist combinations* settings.

## [1.10.3] — 2026-05-27

### Fixed

- **Retag Library is now album-aware — fixes wrong track numbers/totals for tracks also released as singles.** Previously the scanner looked up each file's ISRC independently, and Deezer returns whatever release it ties to that ISRC — for songs pre-released as singles, that's the *single* (1 track, position 1, the single's barcode), which mangled track number, track total, album title, and UPC. Now, for an album folder, Deemix resolves the **one authoritative Deezer album** the files belong to and maps every track into it by ISRC — so all tracks get the album's UPC/label/genre, the correct track total, and their real sequential track numbers, regardless of single releases. Files genuinely not part of that album fall back to per-file lookup.

### Added

- **"✓ Already correct" indicator.** The Retag Library now shows which selected tags already match Deezer (instead of a silent skip), alongside the existing "Not available on Deezer" note.

## [1.10.2] — 2026-05-27

### Changed

- **"Refresh tags" on albums/playlists now writes the full freemode tag set** (barcode, label, genre, BPM, track length, etc.) from the exact release you're viewing, independent of the Settings → Metadata toggles. "Refresh" now means "make this match the authoritative Deezer release." Merge semantics still preserve anything Deezer doesn't provide; the Retag Library page remains the place for per-tag control.

### Fixed

- **Retag results now explain non-changes instead of silently skipping.** Each file reports "Already up to date" when its tags match Deezer, and "Not available on Deezer: <fields>" when Deezer has no value for a selected tag (e.g. albums with no genre — `genres:{data:[]}`). This resolves the confusion where a genre that doesn't exist upstream looked like a broken write.

## [1.10.1] — 2026-05-26

### Fixed

- **"Refresh tags" no longer behaves like a download in the queue.** Refresh runs are now labeled "Refreshing tags / Tags refreshed", are excluded from download history and stats, and never set an album/playlist's "downloaded" status. In particular, refreshing an album whose files aren't on disk no longer falsely marks it as downloaded. Playlist M3U files are left untouched during a refresh. Normal downloads are unaffected.

## [1.10.0] — 2026-05-26

### Added

- **"Refresh tags" on albums & playlists — exact-match, no re-download ([#77](https://github.com/DRAZY/deemix-remastered/issues/77) follow-up).** A new button on every Album and Playlist view rewrites tags on the files you already have, using the **exact** Deezer release you're viewing. Because it uses the authoritative album/track IDs (not a reverse ISRC guess), the barcode/label/genre come from the right edition every time — fixing the "matching doesn't always line up" cases from the standalone scanner. Audio is untouched and existing tags are preserved (merge). Driven by the download engine's new `refresh-tags` mode (skips download/decrypt; tags the existing file in place).
- **More retaggable fields.** Genre, Track Length, and Explicit are now writable by the retag tools, sourced from Deezer's public catalog (no account). ReplayGain was intentionally excluded — Deezer's gain value isn't standard ReplayGain and the app doesn't write it on download.

## [1.9.0] — 2026-05-26

### Added

- **Retag Library — metadata-only rewrite of existing files ([#77](https://github.com/DRAZY/deemix-remastered/issues/77)).** A new sidebar tool that scans a folder of `.mp3`/`.flac` files, matches each by its ISRC against Deezer's **public** catalog (no account, no re-download), and rewrites only the tags you select. Audio bytes are left byte-identical and existing tags/artwork are preserved (merge, not replace). UPC and Label are enabled by default so libraries downloaded before v1.8.2 can be backfilled in place. Files without an ISRC are reported and skipped (fuzzy matching planned for a later release). Includes a dry-run preview. New dependency: `music-metadata` (pure-JS tag reader).

## [1.8.2] — 2026-05-25

### Fixed

- **UPC and Label tags were never written into downloaded files even when selected ([#76](https://github.com/DRAZY/deemix-remastered/issues/76)).** The embedded-tag writers (ID3 `BARCODE`/`publisher` and FLAC Vorbis `BARCODE`/`LABEL`) were gated on `trackInfo.ALB_UPC` / `trackInfo.LABEL_NAME`, fields the Deezer private `song.getData` API leaves empty — so the guard was always false. Now sourced from the public album API via the same `albumContext` / `_resolvedAlbum*` cascade the v1.8.1 template fix uses. Verified against live album data (UPC + label both populate).

## [1.8.1] — 2026-05-24

### Fixed

- **`%barcode%` / `%upc%` template substitution returned empty for every download ([#75](https://github.com/DRAZY/deemix-remastered/issues/75)).** v1.8.0 wired the substitution but read `trackInfo.ALB_UPC`, a field the Deezer private `song.getData` API does not populate. Now sourced from the public album API via `albumContext.upc` / `_resolvedAlbumUpc` — same cascade as `folderArtist`. Latent filename `%upc%` bug fixed by the same cascade.

## [1.8.0] — 2026-05-24

### Added

- **`%barcode%` / `%upc%` folder template variable ([#74](https://github.com/DRAZY/deemix-remastered/issues/74)).** Album UPC substitutes into folder templates so same-titled releases land in distinct folders. Both aliases work; the data is already fetched (`trackInfo.ALB_UPC`).
- **Per-profile picker in Backup and Restore.** Expandable nested list on both Export and Restore previews. Pick only the profiles you want; full selection produces a backup file byte-identical to v1.7.9.

### Changed

- About > What's New section compacted — short bullets, older patch releases grouped into ranges, full detail linked to GitHub Releases.

## [1.7.9] — 2026-05-24

### Added

- New "Semicolon + space" artist-separator option ([#73](https://github.com/DRAZY/deemix-remastered/issues/73)) emits `; `. Existing "Semicolon" choice unchanged.

### Fixed

- Restore-from-backup no longer duplicates profiles on name collision. Custom-name match overwrites in place; built-in name match renames to `(Restored)`.

### Changed

- CI workflow switched from `npm ci` to `bun install --frozen-lockfile`; deleted stale `package-lock.json`.

## [1.7.8] — 2026-05-22

### Fixed

- Restore modal now closes on completion and surfaces a confirmation toast (v1.7.6/1.7.7 regression).
- Closed Dependabot GHSA-58qx-3vcg-4xpx (CVE-2026-45736) in `ws` via `engine.io-client` override.

### Changed

- Backup section renamed to "Backup and Restore Settings" for clarity.

## [1.7.5] — 2026-05-21

### Added

- Selectable release types for artist sync ([#71](https://github.com/DRAZY/deemix-remastered/issues/71)) — Albums / Singles / EPs / Compilations / Features filters per artist.

### Fixed

- Bulk "Sync all favourites" works at any scale ([#70](https://github.com/DRAZY/deemix-remastered/issues/70)) via new bulk endpoints (`POST /api/sync/playlists/bulk`, `POST /api/sync/artists/bulk`).
- Stale-favourite detection now works for entries pinned from Favourites view (latent [#64](https://github.com/DRAZY/deemix-remastered/issues/64) bug).

## [1.7.4] — 2026-05-20

### Added

- **Editable sync entries — rename, schedule, path, first-sync mode ([#69](https://github.com/DRAZY/deemix-remastered/issues/69)).** Every synced playlist and synced artist card on the Sync page now has a pencil-icon button that opens an edit dialog pre-filled with the entry's current values. Editable fields are **Name**, **Sync schedule**, and **Download path** for both entity types, plus **First-sync mode** for artists. The backend update endpoints (`playlistSync.updatePlaylist`, `artistSync.updateArtist`) and HTTP PUT routes already supported every one of these fields — this release exposes them in the UI. Schedule changes take effect on the next scheduler tick (60s). Folder-name changes apply to *future* downloads only; files already on disk stay in their existing folder, and the dialog includes an in-line notice making that explicit so renaming never silently orphans an existing library.
- Twelve new `sync.*` i18n keys land in `en.json` for the dialog (other locales fall back to English until the next translation pass).

## [1.7.3] — 2026-05-20

### Fixed

- **"Sync all favourite playlists" silently dropped 20-30 of 50+ entries on Windows ([#68](https://github.com/DRAZY/deemix-remastered/issues/68)).** Both `playlistSync` and `artistSync` called `saveState()` from multiple code paths without serialization. During a bulk-add, each new `addPlaylist` fired a `saveState()` *and* a fire-and-forget `syncPlaylist()` whose own `saveState()` checkpoints ran in the background — so multiple writers raced on the shared `.tmp` sibling of `safeWriteJson` (write to tmp + atomic rename). `saveState` swallowed errors with a single `console.error`, so torn writes and lost updates on NTFS surfaced as missing playlists in the user-visible sync list rather than as toasts. In-memory state held all 50; on-disk state held whatever the last successful rename had landed.
- Fix in `electron/services/playlistSync.ts` and `electron/services/artistSync.ts`: each engine now serializes every `saveState()` call through a single Promise chain. Each chained `.then()` captures a fresh `JSON.stringify(this.state)` snapshot *after* the previous rename has landed, making "last write wins" deterministic and guaranteeing every push is included in some subsequent successful write. No two saves race on the same tmp path anymore.

### Changed

- **3-concurrent-sync cap no longer throws; soft-skips instead.** Previously `syncPlaylist`/`syncArtist` threw `Maximum concurrent syncs reached (3)` once the cap was hit, which under the bulk-add flow produced ~47 console errors per 50-favourites operation and broke fire-and-forget callers. Now over-cap calls return a no-op result and trust the 60-second scheduler to retry once active syncs drain. No behavior change for users — just quieter logs.
- **Bulk "Sync all favourites" now surfaces failures.** The `syncAllFavorites()` and `syncAllFavoriteArtists()` handlers in `FavoritesView.vue` count failed adds alongside `added` and `skipped`, and show an error toast (`syncBulkPartial` / `artistSyncBulkPartial`) when any add fails. Before, failures were `console.error`'d but the toast only mentioned successes — the user had no way to know anything had gone wrong. New i18n keys land in `en.json`; other locales fall back to English until the next translation pass.

## [1.7.2] — 2026-05-20

### Fixed

- **Sync froze mid-run when existing files were skipped (#67).** v1.7.1 wired the user's `overwriteFiles` setting through to sync, which made the downloader's skip-existing-files path get exercised inside sync for the first time. That skip path emitted only `'progress'` (with `status: 'completed'`) and never `'complete'` — but both `playlistSync` and `artistSync` resolve their per-track Promise on the `'complete'` event. Each skipped track silently stranded its worker for the full 5-minute timeout, and with 3-5 parallel workers all hitting skipped files, the whole sync pool stalled. Manual downloads were unaffected because they don't subscribe to the `'complete'` event the way the sync engines do.
- Fix is one line in `electron/services/downloader.ts`: the skip path now emits `'complete'` after `'progress'`, matching the success path's contract. No changes to the sync engines or to the skip logic itself — the asymmetry was always in the emitter.

## [1.7.0] — 2026-05-15

### Security

- **Closed the remaining 16 Electron Dependabot alerts (5 high, 8 medium, 3 low) by bumping the Electron runtime from 35.x to 39.8.5+** (npm installed 39.8.10). This closes every open security advisory the project had as of this release — the repo now reports zero vulnerabilities locally.
- The bump is the runtime/Chromium/Node refresh promised in v1.6.6's release notes. All of the CVE-listed Electron APIs (`desktopCapturer.getSources`, `app.setLoginItemSettings`, `app.setAsDefaultProtocolClient`, `app.moveToApplicationsFolder`, `commandLineSwitches webPreference`, `nativeImage.createFromPath` with SVG, the legacy `autoUpdater` module, etc.) are not used by this codebase — confirmed via grep before the bump. The Electron APIs we *do* use (`safeStorage`, `BrowserWindow`, `ipcMain.handle`, `session`, `Menu`, `dialog`, `shell`) are all rock-stable across 35 → 39.
- Zero native node modules ship in the app bundle, so the ABI change between Electron 35 and 39 has no runtime impact for us (the historically biggest source of Electron upgrade pain).
- **Why minor-version bump (1.7.0) instead of patch (1.6.7)?** The underlying runtime — Chromium and Node — moved several majors. Even though our code didn't change, the application's runtime substrate did. SemVer-wise that's a minor bump for the app.

### Engineering

- `electron` `^35.0.0` → `^39.8.5` in `package.json` (installed 39.8.10). No other code touched.
- All six OS build targets (mac universal, mac arm64, win x64, win arm64, linux x64, linux arm64) produce on Electron 39.

## [1.6.6] — 2026-05-15

### Security

- **Closed 24 Dependabot alerts (10 high, 12 medium, 2 low) via pure dependency version bumps.** No functional changes, no API surface touched, no behavior changes — only version numbers moved.
- `axios` `^1.6.0` → `^1.15.2` (installed 1.16.1): closes 14 alerts including 5 highs around prototype pollution, header injection, NO_PROXY SSRF bypass, and the CVE-2025-62718 incomplete-fix chain.
- `vite` `^6.0.0` → `^6.4.2`: closes 2 alerts including a high-severity arbitrary file read via the dev-server WebSocket.
- `postcss` `^8.4.0` → `^8.5.10` (installed 8.5.14): closes 1 medium XSS-via-unescaped-`</style>` alert.
- New `overrides` block in package.json pins transitive build-time dependencies: `lodash ^4.18.0`, `@xmldom/xmldom ^0.8.13`, `ip-address ^10.1.1`, `follow-redirects ^1.16.0`. These are all under `electron-builder` / `concurrently` (dev-only) and never shipped in the app bundle; the bumps close 7 more alerts including 4 highs (lodash code injection via `_.template`, xmldom XML injection chain).

### Engineering

- The Electron 35 → 39 major bump (16 remaining alerts) is deliberately split into v1.7.0 to keep the rollback surface here clean. v1.6.6 is metadata-only; v1.7.0 will be the runtime version refresh.

## [1.6.5] — 2026-05-15

### Fixed

- **Sync list could be silently destroyed by a torn write on Windows.** Both sync engines (`playlistSync`, `artistSync`) wrote their state with a single non-atomic `writeFile`. If the process was killed mid-write — Windows Update reboot, antivirus quarantine, sudden power loss — the on-disk JSON could end up truncated. On the next launch, `loadState()` caught the parse error, silently reset the in-memory state to an empty list, and the next mutation (or shutdown) overwrote the corrupt-but-recoverable file with the empty default. The user's pinned playlists and artists were gone for good. Surfaced on Windows first because torn writes are more common there, but the underlying anti-pattern was platform-agnostic.
- Two surgical changes close the data-loss invariant:
  1. **Atomic writes.** State JSON is now staged to a sibling `.tmp` file and `rename`d into place. NTFS, APFS, and ext4 all guarantee `rename` is atomic, so readers either see the previous good file or the new good file — never a torn one.
  2. **Quarantine on corruption.** If `loadState()` fails to parse the file for any non-`ENOENT` reason, the bad file is renamed to `playlist-sync.json.corrupt-<ISO-timestamp>` (or `artist-sync.json.corrupt-…`) before in-memory state resets to default. The bytes are preserved next to the live file for forensic recovery, instead of being overwritten on the next save.

### Engineering

- New exported helpers in `electron/services/playlistSync.ts`: `safeWriteJson(path, data)` (atomic via `.tmp` + `rename`) and `quarantineCorruptFile(path)` (timestamped sibling on read failure). Both consumed by `playlistSync` and `artistSync` so the two engines share one durability contract.
- Surface area is intentionally tight: only the two sync engines are touched this release. Credentials, settings, and profiles in `electron/main.ts` follow the same legacy anti-pattern and will get the same treatment in a follow-up — split deliberately to keep this patch small and easy to review.

## [1.6.4] — 2026-05-15

### Fixed

- **No way to remove a playlist or artist from favorites from inside the app.** v1.6.3 added the prune-on-import flow for un-favorited Deezer items, but the favorite playlist and artist cards themselves still had no remove affordance — only a Sync button. v1.6.4 adds a small "X" remove button in the top-left corner of every playlist and artist card on the Favorites tabs. Clicking it removes the item from the local favorites cache, and also auto-removes any sync entry sourced from that playlist/artist (the user's clear intent is "make this go away"). Doesn't touch Deezer; re-importing will bring it back if it's still on Deezer's side.
- **No way to unpin/unsync from the favorite cards.** The Sync and Pin to Sync buttons used to flip to a *disabled* "Synced" / "Pinned" state once added — meaning the only way to unsync a favorite was to navigate to the Sync page and remove it manually. Both buttons are now toggles: click once to pin, click again (the button hover-flips to "Unsync" / "Unpin") to remove just the sync entry while keeping the playlist/artist in favorites.

### Engineering

- New handlers in `FavoritesView.vue`: `unfavoritePlaylist()`, `unfavoriteArtist()`, `toggleSyncPlaylist()`, `toggleSyncArtist()`.
- All four interactions wired with informative toasts (Removed "X" / Stopped syncing "X" / Unpinned "X" / etc).

## [1.6.3] — 2026-05-15

### Fixed

- **Un-favorited playlists and artists no longer linger in Favorites or Sync ([#64](https://github.com/DRAZY/deemix-remastered/issues/64)).** Two bugs were stacking up to produce one symptom:
  - `favoritesStore.importDeezerFavorites` was additive-only — it imported new favorites from Deezer but never removed locally-cached entries that had been un-favorited on Deezer's side. Clicking **Import from Deezer** multiple times only ever grew the list. The function is now bidirectional: imports new + prunes removed in one pass.
  - The sync engines (`playlistSync`, `artistSync`) had no link to favorites at all. Pinning a playlist for sync and then un-favoriting it on Deezer left the sync entry running indefinitely. Both engines now track a per-entry `origin: 'favorites' | 'manual'` and `lastSeenInFavoritesAt`. After every "Import from Deezer" run, the renderer cross-checks: entries whose source playlist/artist is no longer in the user's Deezer favorites get flagged.
- **Import-from-Deezer toast is now informative.** Was "Imported N favorites from Deezer"; now shows `{N imported, M pruned, K unchanged}` and follows with a second toast counting any sync entries that just went stale.
- **Sync page shows a "No longer in your Deezer favorites" notice on stale entries**, with a one-click **Remove** button. Manual-origin entries (added directly via the Sync page, not via Favorites → Pin to Sync) are never auto-flagged.

### Engineering

- New `markFavoriteMembership(favoriteIds: string[])` method on both engines.
- New `POST /api/sync/refresh-favorites` route — accepts the renderer's already-fetched favorite IDs and routes them to both engines, avoiding a second Deezer round trip.
- New `lastFavoritesRefreshAt` global timestamp persisted in each engine's state file; renderer compares against per-entry `lastSeenInFavoritesAt` to compute staleness.
- Backwards-compatible state migration: pre-1.6.3 sync entries default to `origin: 'manual'` on first load so they're never auto-flagged.

### Reversed product decision

- This release reverses the "leave-in-place" call I made when designing #60 (favorite playlist sync) — at the time I argued sync was a separate, explicit commitment from favoriting. Real-user feedback (#64) showed that mental model was wrong for the pain point (bandwidth and disk waste from syncing playlists the user has clearly stopped caring about). The current behavior surfaces staleness without auto-deleting, so the user still confirms before destructive action.

## [1.6.2] — 2026-05-14

### Performance

- **Sync is now parallel — 3-5x faster for large playlists.** The playlist-sync and artist-sync engines previously downloaded tracks one at a time, awaiting each `download.complete` event before queueing the next. This serialized every sync run to a single in-flight download regardless of the user's `maxConcurrentDownloads` setting — for a 400-track favorite playlist that's ~30 minutes at the default. Both engines now use a bounded worker pool (size = `maxConcurrentDownloads`, default 5) that downloads tracks in parallel. Same playlist now finishes in ~6 minutes at the default setting, or ~3 minutes if the user bumps the setting to 10. Per-track retry semantics, success/failure aggregation, and the `knownTrackIds`-only-on-success rule are preserved. For artist sync, parallelism is *within-album* — the cross-album loop stays sequential so the "Album X/Y, currently downloading Z" progress UI remains meaningful.

### Engineering

- Extracted a reusable `runPool<T, R>(items, concurrency, worker)` helper in `electron/services/playlistSync.ts` (also imported by `artistSync.ts`) — N workers each pull from a shared cursor until items exhaust. Returns results in original order. Bounds in-flight downloader event listeners to N×3 instead of unbounded.

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

## [1.4.0] — 2026-03-29

### Added

- Auto-update checker on startup; live download progress shown in the window title bar.
- Global paste — paste a Deezer link anywhere to route it to Search and start a bulk download.
- Download history (last 500 entries), settings export/import (credentials excluded), and playlist diff (already-downloaded vs. new).
- Bulk link paste in the Search bar, including artist links that expand to the full discography with correct artist naming.
- Sorting for Favorites and Artist Discography, persisted across navigation.
- Customizable M3U playlist filename template; `%owner%` folder-template variable for playlists.
- Track count on playlist and album cards; playlist cards show full title and creator name (2-line wrap).

### Fixed

- Three-tier track resolution with fresh-token retry and legacy CDN fallback for unavailable playlist tracks.
- M3U now mirrors the actual folder structure and real track/disc numbers instead of reconstructed guesses; added a safety timeout for bulk playlists.
- Album titles wrap to 2 lines instead of truncating; album-level explicit data drives folder naming for playlist tracks.
- Cancel-all stops bulk-paste downloads and resets the queue; unavailable albums in bulk artist downloads are handled gracefully.

## [1.3.0] — 2026-03-23

### Added

- Batch favorites download; `%explicit%` and `%date%` folder-template variables with hint chips.

### Fixed

- Explicit status is derived from actual track data (`explicit_content_lyrics` code) rather than the album flag, fixing the explicit tag being wrongly applied to non-explicit albums.
- Deezer favorites import paginates for large libraries; saved language setting is restored on launch.
- Tag defaults, M3U paths, and playlist naming corrected; empty brackets are auto-removed from template variables.

## [1.2.1] — 2026-03-22

### Security

- Hardened Electron configuration — fixed SSRF and tightened CSP and CORS.

### Fixed

- Restored `unsafe-inline`/CORS for Electron `file://` compatibility after the CSP hardening regressed it.

## [1.2.0] — 2026-03-22

### Added

- Import Deezer account favorites into the Favorites tab.

### Fixed

- Deezer share links resolve in the Link Analyzer; charts view shows all tabs when navigating from Home.

## [1.1.1] — 2026-03-17

### Fixed

- Playlist cards now download as playlists instead of failing.
- Spotify username persists in credentials storage; settings load before syncing to the server.

## [1.1.0] — 2026-03-17

### Added

- Playlist sync engine with Spotify and Deezer support.
- Link Analyzer batch downloads with cover art and retry support, plus a batch download endpoint that applies user settings.

## [1.0.0] — 2026-03-03

- Initial release.

[1.10.9]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.9
[1.10.8]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.8
[1.10.7]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.7
[1.10.6]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.6
[1.10.5]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.5
[1.10.4]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.4
[1.10.3]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.3
[1.10.2]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.2
[1.10.1]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.1
[1.10.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.10.0
[1.9.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.9.0
[1.8.2]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.8.2
[1.8.1]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.8.1
[1.8.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.8.0
[1.7.9]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.7.9
[1.7.8]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.7.8
[1.7.5]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.7.5
[1.7.4]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.7.4
[1.7.3]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.7.3
[1.7.2]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.7.2
[1.7.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.7.0
[1.6.6]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.6.6
[1.6.5]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.6.5
[1.6.4]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.6.4
[1.6.3]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.6.3
[1.6.2]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.6.2
[1.6.1]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.6.1
[1.6.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.6.0
[1.5.8]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.8
[1.5.7]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.7
[1.5.6]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.6
[1.5.5]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.5
[1.5.4]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.4
[1.5.3]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.3
[1.5.2]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.2
[1.5.1]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.1
[1.5.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.5.0
[1.4.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.4.0
[1.3.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.3.0
[1.2.1]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.2.1
[1.2.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.2.0
[1.1.1]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.1.1
[1.1.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.1.0
[1.0.0]: https://github.com/DRAZY/deemix-remastered/releases/tag/v1.0.0
