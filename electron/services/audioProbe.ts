/**
 * Reads the ACTUAL encoded parameters out of an audio file's bitstream.
 *
 * Every other part of the pipeline takes the delivered quality tier on faith:
 * `media.deezer.com/v1/get_url` reports which format it served, and we label the
 * file, pick its extension, choose the tagger, and drive the UI badge from that
 * one string. This module is the only place that checks the claim against the
 * bytes on disk.
 *
 * It exists for two jobs:
 *
 *   1. Skip decisions. MP3_128 and MP3_320 both write `<name>.mp3` — the naming
 *      templates have no bitrate placeholder — so with the default overwrite
 *      mode of 'no' a 320 re-download over an existing 128 file used to skip and
 *      keep the 128, while the UI reported 320. Comparing tiers needs the real
 *      bitrate of the file already on disk.
 *
 *   2. Post-download verification. If the API's format label were ever wrong or
 *      absent, nothing downstream would notice.
 *
 * Deliberately dependency-free and synchronous: it reads at most 64 KB and runs
 * on paths that are already doing far heavier I/O.
 */
import * as fs from 'fs'

export type AudioTier = 'FLAC' | 'MP3_320' | 'MP3_128' | 'MP3_OTHER'

export interface AudioProbeResult {
  /** Normalized tier, comparable against a DownloadOptions quality or an API format label. */
  tier: AudioTier
  container: 'flac' | 'mp3'
  /** kbps, MP3 only. The dominant frame bitrate. */
  bitrate?: number
  sampleRate?: number
  channels?: number
  /** FLAC only. */
  bitsPerSample?: number
  /** MP3 only. True when frames disagree or a Xing header is present. */
  vbr?: boolean
}

// MPEG audio frame header tables. Layer III only — Deezer serves nothing else.
const BITRATES_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BITRATES_V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000],  // MPEG 2.5
}

const PROBE_WINDOW = 64 * 1024

interface FrameHeader {
  bitrate: number
  sampleRate: number
  frameLen: number
  channelMode: number
}

function parseFrameHeader(buf: Buffer, off: number): FrameHeader | null {
  if (off + 4 > buf.length) return null
  if (buf[off] !== 0xff || (buf[off + 1] & 0xe0) !== 0xe0) return null

  const verBits = (buf[off + 1] >> 3) & 0x03    // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5, 1 = reserved
  const layerBits = (buf[off + 1] >> 1) & 0x03  // 1 = Layer III
  const brIndex = (buf[off + 2] >> 4) & 0x0f
  const srIndex = (buf[off + 2] >> 2) & 0x03
  const padding = (buf[off + 2] >> 1) & 0x01
  const channelMode = (buf[off + 3] >> 6) & 0x03

  if (verBits === 1 || layerBits !== 1) return null
  if (brIndex === 0 || brIndex === 15 || srIndex === 3) return null

  const bitrate = (verBits === 3 ? BITRATES_V1L3 : BITRATES_V2L3)[brIndex]
  const sampleRate = SAMPLE_RATES[verBits][srIndex]
  if (!bitrate || !sampleRate) return null

  const samplesPerFrame = verBits === 3 ? 1152 : 576
  const frameLen = Math.floor((samplesPerFrame / 8) * bitrate * 1000 / sampleRate) + padding
  if (frameLen < 24) return null

  return { bitrate, sampleRate, frameLen, channelMode }
}

/** Length of the ID3v2 tag at the head of the buffer, or 0 if there isn't one. */
function id3v2Length(header: Buffer): number {
  if (header.length < 10) return 0
  if (header.toString('latin1', 0, 3) !== 'ID3') return 0
  // Syncsafe integer: 7 significant bits per byte.
  const size = ((header[6] & 0x7f) << 21) | ((header[7] & 0x7f) << 14) |
               ((header[8] & 0x7f) << 7) | (header[9] & 0x7f)
  return 10 + size
}

function probeFlac(fd: number): AudioProbeResult | null {
  const buf = Buffer.alloc(26)
  const read = fs.readSync(fd, buf, 0, 26, 0)
  if (read < 26) return null
  if (buf.toString('latin1', 0, 4) !== 'fLaC') return null
  // METADATA_BLOCK_HEADER at byte 4; STREAMINFO is required to come first.
  if ((buf[4] & 0x7f) !== 0) return null

  // STREAMINFO body starts at byte 8. Sample rate is 20 bits at bit offset 80,
  // then 3 bits of channel count minus one, then 5 bits of bit depth minus one.
  const s = buf.subarray(8)
  const sampleRate = (s[10] << 12) | (s[11] << 4) | (s[12] >> 4)
  const channels = ((s[12] >> 1) & 0x07) + 1
  const bitsPerSample = (((s[12] & 0x01) << 4) | (s[13] >> 4)) + 1
  if (!sampleRate) return null

  return { tier: 'FLAC', container: 'flac', sampleRate, channels, bitsPerSample }
}

function probeMp3(fd: number, size: number): AudioProbeResult | null {
  // Seek past the ID3v2 tag before hunting for frames. Deezer embeds full-size
  // cover art, so these tags routinely run to ~1 MB; a fixed window anchored at
  // byte 0 lands inside the JPEG and finds nothing, which looks like a corrupt
  // file when the audio is fine.
  const header = Buffer.alloc(10)
  if (fs.readSync(fd, header, 0, 10, 0) < 10) return null
  const audioStart = Math.min(id3v2Length(header), size)

  const len = Math.min(PROBE_WINDOW, size - audioStart)
  if (len <= 4) return null
  const buf = Buffer.alloc(len)
  fs.readSync(fd, buf, 0, len, audioStart)

  // Resync: accept only a frame whose successor also parses at the predicted
  // offset. A lone 11-bit sync pattern turns up by chance inside tag and audio
  // data often enough to matter; two consecutive valid headers essentially never
  // do.
  let first: { h: FrameHeader; at: number } | null = null
  for (let i = 0; i < buf.length - 4; i++) {
    const h = parseFrameHeader(buf, i)
    if (!h) continue
    const next = parseFrameHeader(buf, i + h.frameLen)
    if (next && next.sampleRate === h.sampleRate) {
      first = { h, at: i }
      break
    }
  }
  if (!first) return null

  // A Xing/Info header occupies the first frame and carries no audio, so its
  // nominal bitrate is meaningless — skip it before tallying, whichever it is.
  // The two are not interchangeable though: 'Xing' marks a VBR stream, 'Info' is
  // the same structure written for CBR. Only the former implies variable rate.
  const firstFrame = buf.subarray(first.at, first.at + first.h.frameLen + 4).toString('latin1')
  const hasXing = firstFrame.includes('Xing')
  const hasHeaderFrame = hasXing || firstFrame.includes('Info')

  const tally = new Map<number, number>()
  let pos = first.at + (hasHeaderFrame ? first.h.frameLen : 0)
  let sampleRate = first.h.sampleRate
  let channelMode = first.h.channelMode
  let frames = 0
  while (pos < buf.length - 4 && frames < 2000) {
    const h = parseFrameHeader(buf, pos)
    if (!h) break
    tally.set(h.bitrate, (tally.get(h.bitrate) || 0) + 1)
    sampleRate = h.sampleRate
    channelMode = h.channelMode
    pos += h.frameLen
    frames++
  }
  if (frames === 0) return null

  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1])
  const bitrate = ranked[0][0]
  const vbr = ranked.length > 1 || hasXing

  // Deezer serves exactly two MP3 tiers. Anything else came from somewhere we
  // don't model, so it gets MP3_OTHER and is never used to justify a skip.
  const tier: AudioTier = bitrate === 320 ? 'MP3_320' : bitrate === 128 ? 'MP3_128' : 'MP3_OTHER'

  return {
    tier,
    container: 'mp3',
    bitrate,
    sampleRate,
    channels: channelMode === 3 ? 1 : 2,
    vbr,
  }
}

/**
 * Identify what a file on disk actually contains.
 *
 * Returns null when the container can't be identified with confidence — callers
 * treat that as "no information" and fall back to their previous behavior. This
 * is deliberate: a probe that guesses would be worse than no probe at all, since
 * every caller uses the result to decide whether to destroy or keep a file.
 */
export function probeAudioFile(filePath: string): AudioProbeResult | null {
  let fd: number | undefined
  try {
    // Open first, then stat the descriptor. Statting the path and reopening it
    // leaves a window in which the file can be replaced between the two calls,
    // so the size could describe a different file than the one being read.
    fd = fs.openSync(filePath, 'r')
    const size = fs.fstatSync(fd).size
    if (size < 32) return null
    // FLAC's magic is unambiguous, so test it first and only fall through to the
    // (heuristic) MP3 frame scan when it fails.
    return probeFlac(fd) ?? probeMp3(fd, size)
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd) } catch { /* already gone */ }
    }
  }
}

/**
 * Quality ordering shared by the skip checks and the UI's downgrade badge.
 *
 * Accepts requested labels ('FLAC' | 'MP3_320' | 'MP3_128'), API format labels,
 * and the Qobuz delivered-tier strings ('FLAC 24/192'). Returns 0 for anything
 * unrecognized, which callers must read as "unknown", never as "lowest".
 */
export function tierRank(format?: string | null): number {
  if (!format) return 0
  const f = format.toUpperCase()
  if (f.startsWith('FLAC')) return 3
  if (f === 'MP3_320' || f === '320') return 2
  if (f === 'MP3_128' || f === '128') return 1
  return 0
}

/** Container a given quality tier is expected to arrive in. */
export function expectedContainer(format?: string | null): 'flac' | 'mp3' | null {
  if (!format) return null
  return format.toUpperCase().startsWith('FLAC') ? 'flac' : 'mp3'
}

/**
 * True when the file already on disk is a strictly worse quality tier than the
 * one about to be downloaded — i.e. the caller should re-download rather than
 * skip.
 *
 * This is the whole reason the probe exists. The naming templates have no
 * bitrate placeholder, so MP3_128 and MP3_320 resolve to the identical
 * `<name>.mp3`. With the default overwrite mode of 'no', re-downloading a 128
 * file at 320 hit a bare existsSync, skipped, reported success, and left the 128
 * in place while the UI showed MP3 320 with no downgrade badge.
 *
 * Answers false whenever it cannot tell — unrecognized tier, unreadable file, an
 * MP3 at a bitrate the services don't sell. Being wrong here either destroys a
 * good file or re-downloads an entire library, so "unsure" has to mean "leave
 * the existing behavior alone".
 */
export function isLowerTier(existingPath: string, expectedFormat?: string | null): boolean {
  const wantRank = tierRank(expectedFormat)
  if (!wantRank) return false
  // The cross-container branch below answers from the extension alone and never
  // opens the file, so without this a path pointing at nothing would come back
  // "lower tier". Callers reach this either just after an existsSync or with a
  // library-index hit, so a miss means a stale entry — and false keeps that case
  // behaving exactly as it did before this check existed.
  if (!fs.existsSync(existingPath)) return false

  const haveFlac = existingPath.toLowerCase().endsWith('.flac')
  // Across containers the extension already settles it — no need to read bytes.
  if (expectedContainer(expectedFormat) === 'flac') return !haveFlac
  // Asked for MP3 and there's a FLAC sitting there: that's an upgrade, keep it.
  if (haveFlac) return false

  // Both MP3. The only ambiguous case, and the one the templates collide on.
  const probe = probeAudioFile(existingPath)
  if (!probe || probe.tier === 'MP3_OTHER') return false
  return tierRank(probe.tier) < wantRank
}
