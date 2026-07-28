# Audio Fidelity Audit

Reference for the recurring "downloads sound worse" report (#87, #99, #130). Every
claim below was verified against source or by measurement on 2026-07-28. Cite this
instead of re-deriving it.

## Verdict

Deemix Remastered cannot alter audio. The capability is not present in the tree.
All three reports remain unsupported by any byte-level evidence.

## Our download path

| Check | Method | Result |
|---|---|---|
| Audio processing deps | `package.json` | None. Only `egoroof-blowfish` (decrypt), `music-metadata` (read-only), `node-id3` (tags). No ffmpeg / lamejs / sox / DSP |
| External processes | grep `electron/` | Zero `spawn` / `execFile` / `exec`. `libffmpeg.dylib` in the release bundle is Electron's own Chromium lib, never referenced |
| Decryption | `downloader.ts:2519` | Pure byte permutation. `Buffer.alloc(input.length)` pins output length; chunks decrypted or `copy()`'d verbatim. No arithmetic on sample values |
| Tagging | measured | Cover art + ReplayGain frame grew file 120,169 bytes; audio payload SHA-256 unchanged |
| Truncation | `downloader.ts:2447` | Clean-FIN partial body rejected as `TRUNCATED`, file deleted. Plus stall timer, zero-byte, on-disk, and size checks |
| Blowfish currency | npm + upstream | Installed 4.0.2, latest 4.0.3. Changelog for 4.0.3 is "update deps and readme". No crypto changes. `npm audit` clean |

## Latent risks found and fixed

| Risk | Location | Status |
|---|---|---|
| Per-chunk catch copied still-ENCRYPTED bytes into output on decrypt failure | `downloader.ts` catch block | Fixed, commit `6f1fb15`. Unreachable today (2000/2000 decode calls under call-site contract threw zero times); now rethrows instead of corrupting |
| `PADDING.NULL` makes `decode()` strip trailing `0x00`, so ~0.4% of stripes return 2047/2046 bytes. Lossless ONLY because `Buffer.alloc` zero-fills | `downloader.ts` decrypt loop | Fixed, commit `db17e83`. Runtime guard asserts the zero-fill. Verified: silent under `Buffer.alloc`, throws at exact offset under `allocUnsafe` (which corrupts ~1 chunk in 250, still reporting success) |

## Other tools (audited 2026-07-28)

Source: `github.com/bambanah/deemix` (maintained JS port, 1123 stars).

| Question | deemix | Deemix Remastered |
|---|---|---|
| Endpoint for file URL | `media.deezer.com/v1/get_url` | Same |
| Private API | `gw-light.php` | Same |
| Cipher | `BF_CBC_STRIPE` (`deezer.ts:202`) | Same |
| Writes `REPLAYGAIN_TRACK_GAIN` | **Yes** (`tagger.ts:79`, MP3 + FLAC) | Yes |
| ReplayGain formula | `Math.round((gain + 18.4) * -100)/100` | `(-(g + 18.4)).toFixed(2)` — mathematically identical |
| ReplayGain default | `false` (`settings.ts:90`) | `false` |
| **Post-download shell hook** | **Yes — `executeCommand`** (`downloader.ts:673`) | **No equivalent** |

### The `executeCommand` finding

deemix runs an arbitrary user-supplied shell command after every track, with
`%folder%` and `%filename%` substituted. It is exposed as a plain text input at
**Settings → Other → "Command to execute after download"**
(`SettingsPage.vue:1267`, helper text "Leave blank for no action"), localized into
every shipped language including Spanish.

Default is empty, but any user who pasted an `mp3gain`, `loudgain`, or
`ffmpeg -af loudnorm` one-liner there would get:

- changed perceived loudness (the one thing #130 actually measured)
- altered dynamics (the subjective complaint)
- a still-genuine 320 CBR spectrum (what #130 verified)

This is the single most likely explanation for a real audible difference between
the two tools, and it puts the processing in deemix, not here.

**Ask first if the report resurfaces:** what is in your deemix
"Command to execute after download" box?

### Murglar

Closed source. `badmannersteam/murglar-downloads` is a README-only release repo;
only the plugin API is public. Not auditable. Do not speculate about its behavior.

## Corrections to public replies

Errors made in #130 comments, all since fixed in-thread. Do not repeat them:

| Claim | Reality |
|---|---|
| "The original Deemix, Deemix Fix, and Murglar don't write that tag" | **False.** deemix writes `REPLAYGAIN_TRACK_GAIN` with an identical formula. Softened to a conditional before the audit confirmed it wrong |
| "hundreds of issues" | 117 issues total |
| "against a user base this size" | 40 stars / 2 forks. Scale argues the other way; line removed |
| "If even one byte came out wrong, MP3 frames wouldn't decode" | Overstated. MP3 tolerates isolated byte errors. The real argument is that a systematic difference corrupts every third 2048-byte block across the whole file, which is grossly audible |
| "deterministic and bijective" | Blowfish is; the pipeline is not strictly, because `PADDING.NULL` is information-losing and recovered only by zero-fill |

## Gaps not yet raised with reporters

- **File size check.** Two 320 CBR files of the same recording are within a few KB.
  Fastest possible discriminator, never offered.
- **Track IDs.** #130 was told to compare Deezer track IDs, but the `sourceId` tag
  ("Source and song ID") is **off by default** (`settingsStore.ts:203`), so the ID
  is not in their existing files. They must enable it and re-download first.
- **The other fork is the unexamined variable.** If two tools yield audibly
  different files from the same source and ours is provably byte-exact, the
  difference originates in the other tool.
