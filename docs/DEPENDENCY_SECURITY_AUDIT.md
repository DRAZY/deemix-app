# Dependency & Runtime Security Audit

Stack assessment performed 2026-08-07 against `2.4.4`. Every version claim below was
read from the npm registry, the GitHub advisory API, or the installed tree — not from
memory. Cite this instead of re-deriving it.

## Verdict

The application's own Electron hardening was already correct. The exposure was the
**runtime version**: we were shipping an end-of-life Electron that had stopped
receiving Chromium security patches three months earlier.

`bun audit` went from **32 advisories (2 critical, 20 high, 10 moderate)** to
**10 (9 high, 1 moderate)**, and all 10 remaining are one build-time package on one
path. See "Accepted" below for why that one is not worth forcing.

## Finding 1 — Electron was two majors past end of life (CRITICAL)

Electron patches only the **latest three major versions**. At audit time those were
41, 42, and 43, all released together on 2026-08-04 as a coordinated security release.

| | Was (39.8.10) | Now (43.3.0) |
|---|---|---|
| Chromium | 142.0.7444.265 | 150.0.7871.212 |
| Node (in-app) | 22.22.1 | 24.18.1 |
| Last release | 2026-05-05 | 2026-08-04 |

Eight Chromium majors, and **no security patch since 2026-05-05**. The 2026-07-01 and
2026-08-04 coordinated releases both landed after 39's final build, so every fix in
them was absent from what users ran. This is a desktop app that renders remote content
(Deezer web login, Qobuz web player, remote cover art), so the renderer is genuinely
reachable by remote input.

Nothing was wrong with our configuration — see Finding 3. The vulnerability was that
the engine underneath it had stopped being maintained.

### Why the four-major jump was safe

Every breaking change documented for 40.0 through 43.0 was checked against this
codebase. All of them miss:

| Breaking change | Why it misses us |
|---|---|
| 43: `showOpenDialog` defaults to Downloads | `main.ts:640` already passes `defaultPath` |
| 43: Linux frameless rounded corners / WCO layout | Linux gets `frame: true` (#125 fix) |
| 43: `showHiddenFiles` removed on Linux | Not used |
| 43: `NativeImage.toBitmap()` color space | Not used |
| 42: macOS notifications need code signing | No `Notification` usage |
| 42: OSR default scale factor | No offscreen rendering |
| 42: cookie `changed` cause is now `inserted` | Handler ignores `cause` (`main.ts:877`) and polls as backup |
| 42: `quotas` removed from `clearStorageData` | We pass `{storages: ['cookies']}` |
| 42: PDFs no longer get separate WebContents | No PDF handling |

The cookie one was the real risk — it sits in the Deezer ARL login capture. It is safe
because the handler destructures `cause` as `_cause` and never branches on it.

## Finding 2 — Every Linux AppImage we shipped had an unsafe library search path (HIGH)

`GHSA-7g7r-gx96-252g`, `app-builder-lib < 26.15.0`. The generated `AppRun` script set:

```bash
export LD_LIBRARY_PATH="${APPDIR}/usr/lib:${LD_LIBRARY_PATH}"
```

With `LD_LIBRARY_PATH` unset at launch this leaves a trailing `:`, which the dynamic
linker reads as an empty path component meaning **the current working directory**. Anyone
who could place a `.so` in the directory the AppImage is launched from could get code
execution. Same class as CVE-2024-41817. `PATH`, `XDG_DATA_DIRS`, and
`GSETTINGS_SCHEMA_DIR` were affected the same way.

This is worth separating from the rest of the build-chain noise: it is not a risk to our
build machine, it is **baked into the artifact users download**. It was fixed by moving
electron-builder 26.8.1 → 26.15.3, which is a patch-level move within 26.x.

**Verified in the generator, not just taken from the advisory.** In 26.15.3,
`out/targets/appimage/appImageUtil.js:192-195` emits all four affected variables with a
non-empty guard, so nothing is appended when the variable is unset:

```bash
export LD_LIBRARY_PATH="${APPDIR}/usr/lib${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
```

`PATH`, `XDG_DATA_DIRS`, and `GSETTINGS_SCHEMA_DIR` use the same `${VAR:+:${VAR}}` form.
The 26.8.1 tree has no such template — that version generated `AppRun` through the
`app-builder-bin` Go toolset, which matches the advisory's note that the flaw existed in
two independent code paths.

The advisory is titled "electron-updater: …" but the defect is in the AppImage that
app-builder-lib produces. We do not ship electron-updater (verified: no `electron-updater`
or `autoUpdater` reference in the tree), so the *sibling* advisory `GHSA-p2f4-r6v6-j797`
— credential leak on cross-origin redirect in `builder-util-runtime` — never applied to us.
It was cleared anyway.

## Finding 3 — Application Electron hardening: no changes needed

Audited and correct as shipped. Recording it so it does not get re-litigated:

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`,
  `webSecurity: true`, `allowRunningInsecureContent: false` on all three windows
  (main, Deezer login, Qobuz login)
- CSP set via `onHeadersReceived`
- `setWindowOpenHandler` denies all and routes through a validated `openExternal`
- `will-navigate` pinned to an origin allowlist
- DevTools shortcuts gated behind `isDev`
- ARL tokens encrypted with `safeStorage`

One item is worth a future look but was left alone: the CSP carries `'unsafe-inline'`
and `'unsafe-eval'` in `default-src`/`script-src`. Tightening it risks breaking Vue's
runtime and the Google reCAPTCHA frame the Deezer login needs, so it is a separate
piece of work with its own verification, not a drive-by change.

## What changed

Direct dependencies:

| Package | From | To | Why |
|---|---|---|---|
| electron | 39.8.10 | 43.3.0 | Finding 1 — EOL runtime |
| electron-builder | 26.8.1 | 26.15.3 | Finding 2 — AppImage `LD_LIBRARY_PATH` |
| electron-builder-squirrel-windows | (auto peer 26.8.1) | 26.15.3 | Pinned explicitly; see note below |
| @types/node | 20.19.27 | 24.13.3 | Match Electron 43's bundled Node 24 |
| concurrently | 8.2.2 | 10.0.4 | Pulls patched shell-quote 1.9.0 |
| vite | 6.4.2 | 6.4.3 | `server.fs.deny` Windows bypass, launch-editor NTLM leak |
| postcss | 8.5.14 | 8.5.26 | sourceMappingURL path traversal |
| vue | 3.5.32 | 3.5.41 | currency |
| music-metadata, egoroof-blowfish, fontsource, autoprefixer, vue-tsc | — | latest | currency |

Overrides added or corrected:

| Override | Value | Fixes |
|---|---|---|
| ip-address | `^10.4.0` (was `^10.1.1`, resolving to a vulnerable 10.2.0) | SSRF / trust-boundary bypasses |
| tar | `^7.5.21` | incl. the critical unlimited-input decompression DoS |
| form-data | `^4.0.6` | CRLF injection |
| tmp | `^0.2.6` | path traversal |
| js-yaml | `^4.3.1` | three quadratic-CPU advisories |
| postcss | `^8.5.23` | pinned tailwind's nested copy, which stayed on 8.5.14 |

Two notes on the override choices, because both had a wrong-looking easy answer:

- **js-yaml** appears to require 5.x, since the omap advisory says the fix was "not
  backported". It was — upstream shipped `4.3.1`, and the advisory API confirms
  `first_patched_version: 4.3.1` for the 4.x line. A minor bump inside 4.x is a drop-in
  for electron-builder's `^4.1.0`; a 5.x override would have been an unnecessary major.
- **electron-builder-squirrel-windows** is a hard peer of `app-builder-lib`, so bun
  installs it whether or not we build Squirrel targets (we do not). Bun does not apply
  `overrides` to auto-installed peers, so it stayed pinned at 26.8.1 and dragged stale
  `app-builder-lib@26.8.1` and `builder-util-runtime@9.5.1` copies back into the tree.
  Declaring it explicitly at `^26.15.3` is what actually cleared them. Keep it in
  lockstep with `electron-builder` — the peer requirement is an exact version match.

## Accepted, not fixed

`brace-expansion@5.0.5` — 10 advisories, reachable only at build time through
`app-builder-lib → @electron/universal → @electron/asar → minimatch`.

Not fixed because the available mechanisms both make things worse:

1. A flat override to `^5.0.9` rewrites **every** copy in the tree, including the
   `1.1.13` and `2.0.3` copies under minimatch 3.x and 9.x. brace-expansion 5 exports
   `{ expand }` with `__esModule: true` and **no callable `module.exports`**, while
   minimatch 3 does `require('brace-expansion')(pattern)`. That is a guaranteed break in
   asar packing, and a partial break could silently drop files from the package rather
   than fail loudly.
2. A scoped override (`"minimatch@^10": { "brace-expansion": "^5.0.9" }`) is the correct
   fix and is what npm would do. Bun rejects it: `warn: Bun currently does not support
   nested "overrides"`.

The residual risk is a denial of service triggered by crafted brace patterns. The only
patterns reaching this code are the `files` globs in our own `package.json`. An attacker
who can edit those already owns the repository. This clears itself when minimatch
publishes a release requiring `^5.0.9`, or if bun adds nested override support.

## Deferred — currency, not security

None of these carries an advisory. They are majors with real migration cost and zero
security benefit, so they were deliberately left out of a security-motivated change:

pinia 2 → 4, vue-i18n 9 → 11, vue-router 4 → 5, tailwindcss 3 → 4 (CSS-first config
rewrite, high visual-regression risk across the whole UI), typescript 5 → 7,
vite 6 → 8, @vitejs/plugin-vue 5 → 6, vite-plugin-electron 0.28 → 1.1.

## Verification

Behavioral, not just "it compiled":

- `vue-tsc --noEmit` — clean against Electron 43 typings and `@types/node` 24
- `vite build` — clean on vite 6.4.3
- `electron-builder --mac --arm64` — full build, produced
  `Deemix Remastered-2.4.4-arm64.dmg` (129.9 MB), log confirms `electron=43.3.0`
- `electron-builder --linux --x64` — full build, produced the 2.4.4 AppImage (138.3 MB)
  and `.deb` (108.3 MB), on the app-builder-lib carrying the AppRun fix
- **Packaged app launched and ran**: main process stayed alive, GPU / network / audio /
  renderer helpers all spawned, backend bound to `127.0.0.1`, no errors on stdout.
  `Electron Framework.framework` `CFBundleVersion` read back as `43.3.0`.

### Build-pipeline change worth knowing

Electron 41 removed the `postinstall` binary download (an npm supply-chain hardening
measure — the package now fetches on first `bin` invocation instead). Consequences,
both verified rather than assumed:

- `electron-builder` is **unaffected** — it downloads its own Electron zip via
  `@electron/get`. The full mac build succeeded with `node_modules/electron/dist`
  absent.
- `bun run electron:dev` pays a one-time download on first run. Confirmed:
  `./node_modules/.bin/electron --version` printed `Downloading Electron binary...`
  then `v43.3.0`, and populated `dist/`.
- `ELECTRON_SKIP_BINARY_DOWNLOAD` no longer does anything. Nothing in this repo used it.

### Sandbox note

`electron-builder --mac` fails under the LifeOS command sandbox at the DMG step —
`hdiutil` cannot create the disk image and its non-plist error output surfaces as
`plistlib.InvalidFileException`. The `.app` bundle is produced correctly before that
point. Run mac DMG builds unsandboxed.
