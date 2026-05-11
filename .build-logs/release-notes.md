## Deemix Remastered v1.5.7

> **Critical fix release** — resolves `getaddrinfo ENOTFOUND e-cdns-proxy-*.dzcdn.net` download failures introduced when Deezer retired its legacy track CDN in May 2026.

### Fixed

- **`getaddrinfo ENOTFOUND e-cdns-proxy-*.dzcdn.net` download failures.** Deezer retired the legacy sharded track CDN (`e-cdns-proxy-{0-f}.dzcdn.net`) in May 2026 — Amazon Route 53 now returns NXDOMAIN for every shard from the authoritative `dzcdn.net` SOA. The v1.5.6 legacy-CDN fallback for region-shifted releases (issue [#57](https://github.com/DRAZY/deemix-remastered/issues/57)) was added against this CDN, so it stopped working the moment Deezer cut the records. All track downloads now go exclusively through Deezer's modern Media API (`https://media.deezer.com/v1/get_url`), which is the only path Deezer continues to support — it returns signed URLs against whichever CDN Deezer currently routes to, so it survives future CDN migrations without client changes.
- **Clearer error when a track is genuinely unavailable.** The previous "all versions exhausted" message has been replaced with an explanation that the track is likely geo-restricted, requires Premium, or has been removed from Deezer's catalog — surfacing the real cause instead of the misleading DNS failure that v1.5.6 would emit at the end of the fallback chain.

### Changed

- Removed the dead `generateTrackUrl` AES-signed-URL builder from `deezerAuth.ts` and its never-called sibling `generateDownloadUrl` from `downloader.ts`. Both constructed URLs against the retired CDN. Dropped the `aes-js` dependency (only used by those two functions).
- Removed the unused `getLegacyMediaUrl` stub from `deezerAuth.ts`.

### Known limitations

- Region-shifted releases (the v1.5.6 use case — e.g., a New Zealand–registered account hitting NZ-only early releases from a Bulgarian IP) cannot currently be recovered. The modern Media API enforces IP geo, and Deezer no longer publishes a signature-based escape hatch. The download will now fail cleanly with the new error message instead of producing a confusing DNS failure.

---

### Downloads

| OS | Architecture | File |
|---|---|---|
| **macOS** | Apple Silicon | `Deemix Remastered-1.5.7-arm64.dmg` |
| **macOS** | Intel + Apple Silicon (universal) | `Deemix Remastered-1.5.7-universal.dmg` |
| **Windows** | x64 (installer) | `Deemix Remastered-Setup-1.5.7-x64.exe` |
| **Windows** | x64 (portable) | `Deemix Remastered-Portable-1.5.7-x64.exe` |
| **Windows** | arm64 (installer) | `Deemix Remastered-Setup-1.5.7-arm64.exe` |
| **Windows** | arm64 (portable) | `Deemix Remastered-Portable-1.5.7-arm64.exe` |
| **Linux** | x64 (AppImage) | `Deemix Remastered-1.5.7.AppImage` |
| **Linux** | x64 (Debian) | `deemix-app_1.5.7_amd64.deb` |
| **Linux** | arm64 (AppImage) | `Deemix Remastered-1.5.7-arm64.AppImage` |
| **Linux** | arm64 (Debian) | `deemix-app_1.5.7_arm64.deb` |

### Note on code signing

These builds are **unsigned**. On first launch:

- **macOS** — Gatekeeper will say "Apple cannot verify the developer." Right-click the app → **Open**, or go to *System Settings → Privacy & Security* and click **Open Anyway**.
- **Windows** — SmartScreen will say "Windows protected your PC." Click **More info → Run anyway**.
- **Linux** — AppImages need to be made executable: `chmod +x "Deemix Remastered-1.5.7.AppImage"`.

---

**Full changelog:** [CHANGELOG.md](https://github.com/DRAZY/deemix-remastered/blob/main/CHANGELOG.md)
