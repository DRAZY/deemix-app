# Audio Fidelity Audit

Reference for the recurring "downloads sound worse" report (#87, #99, #130). Source
and measurement claims verified 2026-07-28; reporter-supplied sample analysis added
2026-07-29. Cite this instead of re-deriving it.

## Verdict

Deemix Remastered cannot alter audio. The capability is not present in the tree.

This is no longer only a structural argument. On 2026-07-29 the reporters supplied
fourteen files, and **all seven pairs proved bit-identical in the audio.** The
question is settled on their evidence, not ours.

## Reporter-supplied samples (2026-07-29) — DEFINITIVE

Both reporters posted files as GitHub attachments. Every pair was tested: strip the
ID3v2 tag off the front, strip the ID3v1 tag off the end, SHA-256 the remaining MPEG
frames. That is an arithmetic null test, immune to volume, hardware, and expectation.

| Pair | Thread | Audio frames | Result |
|---|---|---|---|
| Dyland & Lenny, Pégate Más | #130 | 8,038,399 B | Identical |
| DJ Luian, La Ocasión | #130 | 13,448,880 B | Identical |
| Chiquetete, Aprende A Soñar | #130 | 7,361,305 B | Identical |
| Isabel Pantoja, Así Fue | #130 | 13,063,313 B | Identical |
| Maná, El Verdadero Amor Perdona | #130 | 11,248,325 B | Identical |
| Maluma & Feid, Mojando Asientos | #87 | 10,089,533 B | Identical |
| Danny Ocean, Me Rehúso | #87 | 8,231,705 B | Identical |

**Seven of seven.** Every differing byte in the whole set lives in the 128-byte ID3v1
trailer:

- Pégate Más, Chiquetete: **1 byte**, the genre field (`0xFF` unset vs `0x0D` = Pop)
- Isabel Pantoja: **2 bytes**, year `2016` vs `2017`
- Maná: **3 bytes**, artist `Mana` vs `Maná` (the accent, in UTF-8)

Out of 8–13 MB per file. Not one differing byte inside an audio frame.

Two findings worth keeping:

1. **The La Ocasión pair is the same file twice** — identical whole-file SHA-256
   `bfa681850db897c7...`, tags included. The reported difference was between a file
   and itself.
2. **The #87 pair is not a test of this app.** Labeled "(deemix original)" and
   "(deemixfix)", it compares two other tools. Their audio is byte-identical too, so
   all three tools demonstrably deliver the same bytes.

All fourteen files: LAME 3.99, 320 CBR, 44.1 kHz stereo, durations matching to 0.01s.
That is Deezer's own encode. No tool in the comparison re-encoded anything.

### Version-regression claim (#130, armijos2333)

Claim: audio degraded after 2.2.3, still bad in 2.4.2. Tested by extracting
`decryptFile` and `handleDownloadResponse` from every tag in that range and hashing:

```
v2.2.3 / v2.3.0 / v2.3.1 / v2.3.2 / v2.4.0 / v2.4.1 / v2.4.2
decryptFile            = 2fc1e5c2fa15   (identical at all seven)
handleDownloadResponse = b0afba2e0272   (identical at all seven)
```

The fetch and decrypt paths did not change by one character across those releases.
Reproduce with `git show <tag>:electron/services/downloader.ts` (brace the variable
in zsh: `${v}:path`, since `$v:e` parses as a modifier).

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

Source: `github.com/bambanah/deemix` (maintained JS port, 1123 stars), at commit
**`d0ac6b434f6fe78eccb0b57cbb1b67ead880e4ec`** (2026-07-27). Line numbers below
refer to that commit. Re-clone and check out that SHA to reproduce; the working
copy used for this audit was temporary and is gone.

| Question | deemix | Deemix Remastered |
|---|---|---|
| Endpoint for file URL | `media.deezer.com/v1/get_url` | Same |
| Private API | `gw-light.php` | Same |
| Cipher | `BF_CBC_STRIPE` (`deezer.ts:202`) | Same |
| Audio processing deps | **None** — `browser-id3-writer`, `metaflac-js2`, `deezer-sdk`, `got`, `async`, `tough-cookie`, `html-entities`, Spotify SDK. No ffmpeg / lamejs / DSP | None |
| Writes `REPLAYGAIN_TRACK_GAIN` | **Yes** (`tagger.ts:79`, MP3 + FLAC) | Yes |
| ReplayGain formula | `Math.round((gain + 18.4) * -100)/100` | `(-(g + 18.4)).toFixed(2)` — mathematically identical |
| ReplayGain default | `false` (`settings.ts:90`) | `false` |
| **Post-download shell hook** | **Yes — `executeCommand`** (`downloader.ts:673`) | **No equivalent** |

deemix also queries more public `api.deezer.com` routes than we do, but those are
metadata only and never touch audio.

**Important framing:** deemix's own download path is as clean as ours. It carries
no encoder or DSP dependency either. The two tools are functionally identical from
request through decrypt to tag write. `executeCommand` is therefore not evidence
that deemix processes audio; it is the single point at which a *user* can make it
do so. Any difference between the two tools originates outside both codebases.

### The `executeCommand` finding

deemix runs an arbitrary user-supplied shell command after every track, with
`%folder%` and `%filename%` substituted. It is exposed as a plain text input at
**Settings → Other → "Command to execute after download"**
(`SettingsPage.vue:1267`, helper text "Leave blank for no action"), localized into
every shipped language including Spanish.

Default is empty, but a user who pasted an `mp3gain`, `loudgain`, or
`ffmpeg -af loudnorm` one-liner there would get:

- changed perceived loudness (the one thing #130 actually measured)
- altered dynamics (the subjective complaint)
- a still-genuine 320 CBR spectrum (what #130 verified)

#### Status of this theory: mechanism confirmed, usage NOT evidenced

Read carefully before citing this. The hook is real and verified in source. What
is **not** established is that anyone actually uses it for audio processing.

A web sweep on 2026-07-28 found no supporting evidence at all: web search for
`executeCommand` + ffmpeg/normalize, Reddit-targeted queries for
deemix + replaygain/mp3gain, a search for the literal UI label
"Command to execute after download", GitHub **code** search for
`executeCommand deemix` (zero results), the deemix issue tracker (one unrelated
release PR), and the deemix man page (fetched: "contains no information about
post-download commands... or audio processing"). No guide, forum post, or config
example anywhere recommends using it this way.

So the honest framing is: **this is the only known mechanism** by which a deemix
download could differ from ours, given that endpoints, cipher, and ReplayGain
handling are otherwise identical. It is NOT a demonstrated cause, and it should
not be described as the likely explanation. That was reasoning from capability
to conclusion, and the evidence does not carry it.

Two caveats keep the absence of evidence weak rather than conclusive: deemix's
main community is a **Telegram group**, which is unindexed and unsearchable (both
#87 and #130 reporters linked Telegram), and the original RemixDev repos live on
GitLab and `git.freezer.life`, which were unreachable from here.

**If the report resurfaces, ask neutrally:** what is in your deemix "Command to
execute after download" box? Frame it as eliminating the last unseen variable,
not as an accusation. An empty box is a useful result: it rules out the only
remaining known difference between the two tools.

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

## Superseded lines of inquiry

These mattered while the question was open. The 2026-07-29 sample analysis answered
it directly, so none of them need pursuing unless a *new* report arrives without
files.

- **File size check.** Was the fastest discriminator to offer a reporter. Moot now
  that the frames themselves have been hashed.
- **Track IDs.** #130 was asked to compare Deezer track IDs, but the `sourceId` tag
  ("Source and song ID") is off by default (`settingsStore.ts:203`), so the ID is not
  in files already downloaded. Enabling it and re-downloading is required first. Still
  the right ask for a future report, since a track-ID mismatch means two different
  recordings and voids the comparison before any hashing is needed.
- **The other fork as unexamined variable.** Resolved: the #87 pair showed original
  Deemix and DeemixFix producing byte-identical audio to each other and to us. No
  fork in the comparison alters anything.
- **deemix `executeCommand`.** Still the only known mechanism by which any of these
  tools could process audio, and still unevidenced as ever being used that way. It is
  now also unnecessary as an explanation, since the files came back identical. Ask
  only if a future reporter supplies files that genuinely differ.

## If this comes up again

1. Ask for both files as attachments. Everything else is impressions.
2. Strip ID3v2 (front) and ID3v1 (last 128 bytes), then SHA-256 the MPEG frames.
   Skipping the ID3v1 strip produces false "differs" results: metadata alone
   accounted for every difference in all seven pairs above.
3. If frames match, it is playback-side or a different master. Nothing to fix.
4. If frames genuinely differ, compare Deezer track IDs first, then reopen.
