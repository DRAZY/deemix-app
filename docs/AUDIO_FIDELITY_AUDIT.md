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

### Full hash table (all 14 files)

Attachment IDs are the GitHub `user-attachments/files/<id>` path segment, so any of
these can be re-fetched and re-verified independently.

| # | Thread | Attachment | Bytes | Full-file SHA-256 | Audio-frames SHA-256 | ID3v1 |
|---|---|---|---|---|---|---|
| 1 | 130 | 30511313 | 8,275,008 | `8a36cb242242400a` | `285ce9b23b43dc0f` | yes |
| 2 | 130 | 30511388 | 8,397,167 | `d54e2e5c9ca41cc2` | `285ce9b23b43dc0f` | yes |
| 3 | 130 | 30511431 | 13,533,156 | `bfa681850db897c7` | `20dfc51612a75d76` | yes |
| 4 | 130 | 30511459 | 13,533,156 | `bfa681850db897c7` | `20dfc51612a75d76` | yes |
| 5 | 130 | 30511517 | 7,435,442 | `38e431ec90f6b601` | `58e4e56bd173a1c2` | yes |
| 6 | 130 | 30511537 | 7,496,488 | `e1ad0c32a8a58199` | `58e4e56bd173a1c2` | yes |
| 7 | 130 | 30511553 | 13,175,487 | `4f18c34a26f2c825` | `dfc6a8f0c856ef9d` | yes |
| 8 | 130 | 30511562 | 13,129,644 | `1a76646caa26ecc3` | `dfc6a8f0c856ef9d` | yes |
| 9 | 130 | 30511571 | 11,351,906 | `fabe61952ba664aa` | `75fe8011e68b2b79` | yes |
| 10 | 130 | 30511573 | 11,449,164 | `5e3cb473e3fcd785` | `75fe8011e68b2b79` | yes |
| 11 | 87 | 28805831 | 10,430,759 | `9d8f16cebf0f8860` | `5c51c87e660ec09b` | **no** |
| 12 | 87 | 28805847 | 10,430,887 | `63cfc93063e50f26` | `5c51c87e660ec09b` | yes |
| 13 | 87 | 28806061 | 8,300,515 | `a0e3c8fd8ed01536` | `f32ac7bc75f6463e` | no |
| 14 | 87 | 28806086 | 8,300,515 | `a0e3c8fd8ed01536` | `f32ac7bc75f6463e` | no |

Full 64-char audio-frame hashes, one per pair:

```
Pégate Más       285ce9b23b43dc0f5ebe0765025297d33b984b765a7d39058613c9dcede32714
La Ocasión       20dfc51612a75d763cf2876122c896d69e5ab911c309cedfed698321316935a5
Chiquetete       58e4e56bd173a1c2bb6feabd63f3d460dc44b8141f5cf7ea3f370f70fe1adfd9
Isabel Pantoja   dfc6a8f0c856ef9d14aac8d3238a9a16779fe9827ace99b73086e2444a7cf997
Maná             75fe8011e68b2b79e84276eef508db86206a0dc78f54d200af25f08d7180ea28
Mojando Asientos 5c51c87e660ec09bcb8571e39b3185890c9f84f0dfe66690946130c2ee4ecd49
Me Rehúso        f32ac7bc75f6463ebc7116d9a010603cb4db7864da752a396f2117735a56f88f
```

### Findings worth keeping

1. **Two separate same-file-twice cases, from two different reporters.**
   - **La Ocasión** (#130, files 3 and 4): identical whole-file SHA `bfa681850db897c7`.
   - **Me Rehúso** (#87, files 13 and 14): identical whole-file SHA `a0e3c8fd8ed01536`,
     posted as "deemix original" vs "deemixfix".

   In both cases the reported audible difference was between a file and itself. Two
   independent occurrences, in two threads, months apart, is the strongest available
   evidence that this comparison is unreliable done by ear.

2. **The #87 pair is not a test of this app.** Labeled "(deemix original)" and
   "(deemixfix)", it compares two other tools. Their audio is byte-identical too, so
   all three tools demonstrably deliver the same bytes.

3. **The Mojando pair differs by exactly 128 bytes** (10,430,887 − 10,430,759), which
   is precisely one ID3v1 tag: file 11 has none, file 12 does. That is the entire
   difference between "deemix original" and "deemixfix" output for that track. A
   metadata trailer, and nothing else.

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

## Bitrate selection audit (2026-07-30)

Different question from everything above. The rest of this document asks "are the
bytes we wrote the bytes Deezer sent." This asks "did we request the right tier,
and did we handle what came back correctly."

**The request path was already correct.** `getTrackUrl` (`deezerAuth.ts:1599`)
builds an ordered format chain, sends the whole chain to
`media.deezer.com/v1/get_url`, and lets Deezer pick the best entry it can serve.
The delivered tier is read back from `media.format` and drives the extension, the
output path, the tagger branch, and the UI badge. With Bitrate Fallback off it
hard-fails rather than quietly stepping down.

**Empirical baseline.** A purpose-built parser read actual MPEG frame headers and
FLAC STREAMINFO (ignoring filenames, extensions and tags) across all 8,809 files
in the maintainer's own library:

| Result | Count |
|---|---|
| Valid FLAC (real STREAMINFO, correct depth/rate) | 8,793 |
| — 16-bit/44.1 kHz (Deezer HiFi) | 7,687 |
| — 24-bit at 48/96/176.4/192 kHz (Qobuz hi-res) | 1,106 |
| MP3 at 320 CBR | 10 |
| MP3 at 128 CBR | 6 |
| Parse failures | 0 |
| Lossy audio inside a FLAC container | 0 |
| Wrong sample rate or unexpected mono | 0 |

Spectral check on a normal FLAC shows energy sloping smoothly to 20 kHz, which is
genuine lossless. The 128s are tracks (karaoke, lofi) Deezer only carries at that
tier, so the fallback behaved correctly. Note the corpus only exercises "request
FLAC" — it does not test the 320-versus-128 selection.

### Defect found: bitrate-blind skip (fixed, commit `0ae8e57`)

The naming templates have no bitrate placeholder — there is no `%bitrate%` or
`%quality%` token anywhere in the template engine — so MP3_128 and MP3_320 both
resolve to the identical `<name>.mp3`. Default `overwriteFiles` is `'no'`.

1. A track sits on disk at 128, from an earlier fallback or an earlier setting.
2. The user switches to MP3 320 and re-downloads it.
3. `reserveOutputPath` sees the path exists and returns null, so the download is skipped.
4. `progress.actualFormat` was set to `MP3_320` *before* the skip check, so the UI
   reports MP3 320 and `isDowngraded()` compares 320 to 320 and shows no badge.
5. The file on disk is still 128.

FLAC was never affected: `.flac` is a different filename. The trap is specifically
128 → 320 upgrades. The opt-in `skipDuplicateTracks` path was broader still,
matching on ISRC alone with no tier comparison, so it would keep a 128 MP3 when
the download would have been FLAC.

Fixed by `electron/services/audioProbe.ts`, which reads the real encoded
parameters out of the bitstream and compares tiers before skipping. Only
mp3-vs-mp3 needs the probe; across containers the extension settles it. The probe
answers "unknown" rather than guessing, and every caller treats unknown as "leave
the previous behavior alone" — a wrong answer there either destroys a good file or
re-downloads an entire library.

### Also closed

| Gap | Location | Fix |
|---|---|---|
| `media.format \|\| formats[0]` — an absent format field silently labels the file with the BEST tier we asked for | `deezerAuth.ts:1832` | Every completed download is now verified against its bitstream; a tier mismatch corrects the label, a container mismatch deletes the file and fails the download |
| Nothing anywhere compared delivered bytes to the claimed tier | — | Same verification pass |
| Qobuz asserted `MP3_320` for any non-FLAC delivery | `downloader.ts` Qobuz path | Reads the tier off the bitstream instead |

Verification: the shipped probe agrees exactly with an independently written sweep
across all 8,809 files (8,793 / 10 / 6, zero unidentified) at 0.23 ms per file, and
the skip decision passes all 13 cases including both never-downgrade directions
(never replace a 320 with a 128, never replace a FLAC with an MP3) and every
unsure input.

Still untested end to end: one live download per tier (128 / 320 / FLAC) of the
same track, probed afterward. That is the only thing that would close the MP3 tier
selection question with direct evidence rather than inference.

## Other tools (audited 2026-07-28)

Source: `github.com/bambanah/deemix` (maintained JS port, 1123 stars), at commit
**`d0ac6b434f6fe78eccb0b57cbb1b67ead880e4ec`** (2026-07-27). Line numbers below
refer to that commit. Re-clone and check out that SHA to reproduce; the working
copy used for this audit was temporary and is gone.

**Scope — read this before citing any of it.** Exactly one third-party codebase was
audited: `bambanah/deemix`. **Original Deemix and DeemixFix were NOT examined**; the
RemixDev repos live on GitLab and `git.freezer.life`, both unreachable from here.
Murglar is closed source. So every source-level claim below describes the maintained
JS port only, and says nothing about what the other forks do or do not contain. The
one thing known about original Deemix and DeemixFix is empirical, not source-level:
the #87 sample pair shows them producing byte-identical audio to each other and to
us. That is easy to misremember as "the other forks lack feature X" — it is not.

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

#### Does it ship a non-empty default? No. Checked twice.

The obvious follow-on theory is that deemix ships default parameters in that box
which quietly process audio. It does not, and this was verified two independent
ways at commit `d0ac6b4`.

**1. Nothing in the code sets it.** Every occurrence of `executeCommand` in the
whole repo, translations aside:

| Location | Value |
|---|---|
| `deemix/src/settings.ts:70` | `""` (the shipped default) |
| `webui/.../SettingsPage.vue:28` | `""` (initial UI state) |
| `deemix/src/downloader.ts:673, 811` | guard `!== ""` plus the `exec` call |
| `deemix/src/types/Settings.ts:39` | type declaration only |
| `deemix/src/downloader.test.ts:43` | test fixture, `""` |
| `webui/CHANGELOG.md:86` | historical "Fix executeCommand not being saved" |

Two defaults, both empty. Searched every `.json`, `.yml`, `.yaml`, `Dockerfile`,
and `.env*` in the tree for the key: **zero hits**, so no docker preset, config
template, or example file sets it either. With the shipped default the `!== ""`
guard means the hook never executes. The rest of the defaults block is filenames,
artwork sizes, casing, and tag toggles, with nothing audio-processing in it.

**2. The samples rule it out regardless of config.** This is the stronger leg,
because it holds no matter what any install's config contains:

- `ffmpeg -af loudnorm` re-encodes, changing the encoder string, frame count, and
  length. All fourteen files report **LAME 3.99**, durations matching to 0.01s,
  identical frame byte-counts.
- `mp3gain` is subtler: it rewrites the global gain field inside each MP3 frame
  *without* re-encoding, so the LAME tag survives. But it must change frame bytes,
  and the frames hashed identical across all seven pairs.

Neither tool touched any of these files. That includes the #87 pair, which was
original Deemix vs DeemixFix, two forks never audited here: their output is
byte-identical to each other and to ours, so whatever defaults they ship applied
no processing either.

Conclusion: a hidden default is dead as a theory. Any real difference would
require a user to have typed a command in themselves.

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
