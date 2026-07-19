# Changelog

All notable changes to **Deemix Remastered** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries use a compact format — short bullets, one line each. Full per-version detail and release notes live on the [GitHub Releases page](https://github.com/DRAZY/deemix-remastered/releases).

## [2.0.3] — 2026-07-18

### Fixed

- **Track Total and Disc Total tags now write for Deezer downloads (#107).** With "Track total" / "Disc total" enabled, files were still tagged with a bare track/disc number (e.g. `5` instead of `5/12`, no disc-of-total). Deezer's private track metadata carries the track's own number but not the album-wide totals, so the tagger never had a value to write. The totals are now sourced from the album — the album context on album/playlist downloads, or an authoritative album lookup for standalone tracks — and applied to the Track Total / Disc Total tags and the `%tracktotal%` / `%disctotal%` filename tokens on both MP3 and FLAC.
