# Dependency & Runtime Security Audit

Stack assessment performed 2026-08-07 against `2.4.4`, shipped as `2.5.0`. The minor
bump rather than a patch is deliberate: no app code changed, but the entire runtime was
replaced, and the version number is the only thing that will point at that if a display
regression is reported later. Every version claim below was
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

The generation path is single and unconditional, which is what makes the template a
sufficient check. `generateAppRunScript()` is one `return` of a template literal with no
JS branching (the `if [ -z "$APPDIR" ]` lines are bash text inside it). It is called
unconditionally by `writeAppLauncherAndRelatedFiles()`, and **both** AppImage build paths
— `buildStaticRuntimeAppImage` and `buildLegacyFuse2AppImage` — go through that function.
Unifying the two previously independent paths onto one hardened generator is how 26.15.0
fixed this. The `LD_LIBRARY_PATH` line takes no interpolated config, so there is no input
that produces a different result.

Caveat, stated rather than glossed: the AppRun bytes were **not** read back out of the
shipped `.AppImage`. Its squashfs payload is compressed and no `unsquashfs` is available
on this machine (electron-builder bundles only `mksquashfs`). The verification above is
code-path analysis of the exact generator that produced the artifact, not extraction from
it.

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

## Major upgrades — assessed 2026-08-07

None of these was urgent, so each was judged on whether it works. Every verdict below
came from installing it and testing, not from reading a changelog. Six landed, two did
not.

One nuance on "no advisories": vue-i18n does carry four (GHSA-x8qp-wqqm-57ph,
GHSA-p2ph-7g93-hw3m, GHSA-hjwq-mjwj-4x6c, GHSA-9r9m-ffp6-9x4v — prototype pollution and
DOM XSS). We were **not** exposed: they are patched in 9.14.2 / 9.14.3 / 9.14.5, and we
were already on 9.14.5. The forward-looking risk is what argued for moving anyway. The
9.x line is two majors behind (11 current, 12 in alpha) and only survives on backports.
That is the same shape as the Electron 39 problem in Finding 1 — a line that is fine
until the day it stops being maintained, at which point it becomes urgent. Moving while
it is cheap is the whole point.

| Package | From → To | Verdict |
|---|---|---|
| pinia | 2.3.1 → 4.0.2 | **Taken** |
| vue-i18n | 9.14.5 → 11.4.8 | **Taken** |
| vue-router | 4.6.4 → 5.2.0 | **Taken** |
| @vitejs/plugin-vue | 5.2.4 → 6.0.8 | **Taken** |
| vite | 6.4.3 → 8.2.1 | **Taken** |
| vite-plugin-electron(-renderer) | 0.28.8 / 0.14.7 → 1.1.1 / 1.0.0 | **Taken** |
| typescript | 5.9.3 → 7.0.2 | **Blocked** — vue-tsc incompatible |
| tailwindcss | 3.4.19 → 4.3.3 | **Rejected** — breaks layout |

### Why the Vue-side majors were nearly free

This codebase happened to sit on the right side of every deprecation:

- **pinia** — all 10 stores are setup-style (`defineStore('id', () => {…})`), and there
  are zero uses of `mapState` / `mapActions` / `storeToRefs`. Pinia 3 only removed
  option-object `defineStore({id})`, `PiniaStorePlugin`, and Vue 2. Pinia 4 is "ESM only
  plus `@vue/devtools-api` v8", and Vite bundles ESM natively.
- **vue-i18n** — already `legacy: false`, zero `$t` / `tc` / `$tc` / `v-t` usage across
  54 `useI18n` call sites. v11's headline change is deprecating Legacy API mode, which
  we were never on.

One real conflict surfaced: pinia 4 peers on `@vue/devtools-api ^8.1.5`, while
vue-router 4 and vue-i18n 11 both depend on `^6.x`. Only one copy was hoisted, leaving
pinia's peer unsatisfied. Declaring `@vue/devtools-api ^8.1.5` as a direct dependency
fixes it — 8.x hoists for pinia, 6.x nests for the other two.

### vite 8 — taken, with a known and understood size delta

Clean rebuilds on each version (`dist-electron` accumulates stale chunks across builds,
so a naive `du` comparison is meaningless — see below):

| | vite 6.4.3 | vite 8.2.1 |
|---|---|---|
| `dist-electron/main.js` | 327,647 B | 609,495 B (+86%) |
| `dist-electron` total | 567,954 B | 843,213 B |
| `dist` (renderer) | 3,154,594 B | 3,167,552 B (+0.4%) |

The renderer is unchanged; the growth is entirely in the main-process bundle, and it is
benign. Externals are still correct — `electron` stays external and `fs` / `path` /
`crypto` / `http` / `https` remain `require`d rather than bundled. The extra weight is
music-metadata parser chunks (`APEv2Parser`, `BasicParser`, `ID3v1Parser`, `lib-*`) that
vite 6 left on disk and vite 8 bundles, which makes the output more self-contained. In a
131 MB app, 275 KB is noise.

### typescript 7 — blocked, not deferred

TypeScript 7 is the native Go port; it ships per-platform binaries and exposes only a
`tsc` bin. `vue-tsc` 3.3.9 resolves `typescript/lib/tsc` internally, which the native
port does not export:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined
by "exports" in node_modules/typescript/package.json
```

`vue-tsc`'s declared peer range (`typescript >=5.0.0`) admits 7.x, so this only shows up
at runtime. Revisit when Volar ships native-port support; there is nothing to do at our
end.

### tailwindcss 4 — rejected on measured evidence

Attempted with the lowest-risk path: keep the JS config via `@config`, swap
`@tailwind base/components/utilities` for `@import "tailwindcss"`, and move PostCSS to
`@tailwindcss/postcss`. It built, and the custom theme survived (`primary-*`, `qobuz`,
`deezer`, `bg-main` all present in the output CSS).

It is still broken. Computed styles were captured over CDP from the packaged app for 40
elements across 4 routes on both versions — 2,240 values compared:

| | |
|---|---|
| identical | 2,016 |
| differing | 224 (10.0%) |

Breakdown: `borderColor` 112, **`padding` 94**, `backgroundColor` 6, `color` 4,
`borderRadius` 4, `margin` 4.

Most of the `borderColor` drift is cosmetic notation (`rgba(255,255,255,0.06)` →
`oklab(…)`, the same color) plus v4's documented default border change. The `padding`
drift is a genuine layout break — `px-4` resolved to `0px`:

```css
.px-4 { padding-inline: calc(var(--spacing) * 4) }   /* --spacing is never defined */
```

v4 emits spacing utilities against a `--spacing` theme variable that comes from its
`@theme` layer. Using `@config` with a legacy JS config suppresses that layer, so the
`calc()` is invalid and every horizontal/vertical padding utility collapses to zero.

The consequence: there is no shim path. A real v4 migration means porting the theme into
CSS `@theme` blocks and then visually re-checking all 39 components — a deliberate piece
of work with its own QA pass, not a dependency bump. It buys no security.

### Incidental finding: `dist-electron` accumulates stale chunks

`dist-electron` is written by vite-plugin-electron as a secondary output directory, and
`emptyOutDir` does not apply to it. Before cleaning, it held 70 files dated across three
separate build days — orphaned content-hashed chunks from every prior build.

`package.json` `build.files` includes `dist-electron/**/*`, so **every stale chunk gets
packaged into the shipped app**. It is dead weight rather than a vulnerability, and the
practical fix is `rm -rf dist dist-electron` before a release build. Worth folding into
the build scripts.

### Verification of the accepted set

Same standard as the security work — the packaged app, not just a compile:

- `vue-tsc --noEmit` clean; `vite build` clean; full `electron-builder --mac --arm64`
  producing a 131.4 MB DMG
- Packaged app launched with `--remote-debugging-port`, confirming
  **Chrome/150.0.7871.212, Electron/43.3.0** in the renderer
- DOM read back over CDP: Vue mounted, Tailwind applied
  (`background-color: rgb(18,18,22)`, matching `--bg-main`), all 12 i18n nav labels
  rendered ("Home", "Search", "Charts", …), and live store data present
  ("Q:LINKED", "QUALITY · FLAC/1411") — which exercises vue-i18n 11 and pinia 4 together
- Route changes driven across `/downloads`, `/settings`, `/favorites`, `/analyzer`,
  `/about`, `/` — each resolved its hash and rendered its own view
  (`/downloads` → "DOWNLOAD STATISTICS", `/settings` → "QUICK PRESETS",
  `/about` → "WHAT'S NEW"), with no console errors
- `bun audit` unchanged at 10 — vite 8 introduced nothing new

### Full cross-platform build (2026-08-07)

`bun run build:all` completed with exit code 0, producing all ten artifacts. Every
target reports Electron 43.3.0, and the Linux binaries report Chromium 150.0.7871.212:

Rebuilt and re-verified at `2.5.0` before release; the sizes below are the shipped set.

| Artifact | Size |
|---|---|
| Deemix Remastered-2.5.0-universal.dmg | 217.7 MB |
| Deemix Remastered-2.5.0-arm64.dmg | 125.3 MB |
| Deemix Remastered-Setup-2.5.0-x64.exe | 103.7 MB |
| Deemix Remastered-Setup-2.5.0-arm64.exe | 100.2 MB |
| Deemix Remastered-Portable-2.5.0-x64.exe | 103.5 MB |
| Deemix Remastered-Portable-2.5.0-arm64.exe | 100.0 MB |
| Deemix Remastered-2.5.0.AppImage | 133.4 MB |
| Deemix Remastered-2.5.0-arm64.AppImage | 131.9 MB |
| deemix-app_2.5.0_amd64.deb | 104.0 MB |
| deemix-app_2.5.0_arm64.deb | 97.5 MB |

Both Windows targets cross-built from macOS without incident, as did both Linux
architectures (fpm and the linux tools are fetched into the electron-builder cache).
The whole set runs unsandboxed because of the `hdiutil` limitation noted above.

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
