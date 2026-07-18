/**
 * Qobuz native download (WIP — feature/qobuz-integration).
 *
 * The Qobuz counterpart to the Deezer path in downloader.ts, minus the entire
 * decryption stage: `qobuzAuth.getFileUrl` returns a direct, unencrypted CDN
 * link to the real FLAC/MP3, so we just stream it to disk. The file arrives
 * already tagged by Qobuz (title/artist/album/cover); richer tags (ISRC/UPC from
 * the API JSON) are a later polish step.
 *
 * This module is intentionally standalone and queue-agnostic so it can be
 * verified in isolation; wiring it into the download queue + UI is the next slice.
 */
import fs from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { qobuzAuth, QOBUZ_FORMAT, type QobuzFormatId } from './qobuzAuth'

export interface QobuzDownloadResult {
  path: string
  formatId: number
  bytes: number
  bitDepth?: number
  samplingRate?: number
  mimeType?: string
}

// Map the app's quality setting to a Qobuz format_id. Qobuz negotiates down to
// the best available for the track/account, so requesting hi-res is safe.
export function qualityToFormatId(quality: '128' | '320' | 'flac'): QobuzFormatId {
  if (quality === 'flac') return QOBUZ_FORMAT.FLAC_HIRES_192
  return QOBUZ_FORMAT.MP3_320
}

/**
 * Resolve and download a single Qobuz track to `outputPath`. Returns file facts
 * for the caller to record. Throws on any resolution/download failure so the
 * queue can mark the item errored (no silent partial files — a failed stream
 * removes the partial).
 *
 * Format honesty: Qobuz negotiates down server-side (e.g. a FLAC request on a
 * lossy-only account/track returns format 5 MP3). When that happens with
 * `bitrateFallback` disabled we throw — matching the Deezer path's behavior —
 * and with it enabled we correct the file extension so MP3 bytes never land in
 * a `.flac` file. The returned formatId is always the real delivered format.
 */
export async function downloadQobuzTrack(
  trackId: string | number,
  quality: '128' | '320' | 'flac',
  outputPath: string,
  onProgress?: (bytes: number, total: number) => void,
  bitrateFallback: boolean = true
): Promise<QobuzDownloadResult> {
  if (!qobuzAuth.isLoggedIn()) throw new Error('Qobuz: not connected — link your account in Settings')

  const formatId = qualityToFormatId(quality)
  let file = await qobuzAuth.getFileUrl(trackId, formatId)
  let viaPurchase = false
  if (file.restricted || !file.url) {
    // Stream delivery refused — retry with purchase credentials, cascading down
    // the format ladder: purchased content is released only at the format the
    // user OWNS (e.g. an MP3-320 purchase refuses a hi-res request outright).
    // Harmless for non-purchased tracks: every intent/format refuses the same.
    console.log(`[QobuzDL] Stream intent refused for ${trackId} (${file.restrictionCode || 'no code'}) — trying purchase download`)
    // Format ids are quality-ordered (27 > 7 > 6 > 5): try the requested tier
    // and everything below it.
    const ladder: QobuzFormatId[] = [QOBUZ_FORMAT.FLAC_HIRES_192, QOBUZ_FORMAT.FLAC_HIRES_96, QOBUZ_FORMAT.FLAC_CD, QOBUZ_FORMAT.MP3_320]
    for (const fid of ladder.filter(f => f <= formatId)) {
      file = await qobuzAuth.getFileUrl(trackId, fid, 'download')
      if (file.url && !file.restricted) { viaPurchase = true; break }
    }
  }
  if (file.restricted || !file.url) {
    // Purchase-credential restrictions survive every intent/format combination:
    // Qobuz serves this content class (e.g. purchased mixed-version albums /
    // [Mix Cut] tracks) only through its own account-page download flow, not
    // the web-player API. Say so plainly instead of a cryptic quality error.
    if (file.restrictionCode === 'TrackRestrictedByPurchaseCredentials') {
      throw new Error('This purchased release can only be downloaded from your Qobuz account page (qobuz.com → My purchases) — Qobuz does not release it through the player API.')
    }
    const detail = file.restrictionCode ? ` (${file.restrictionCode})` : ''
    throw new Error(`Qobuz: track ${trackId} is not available at the requested quality on this account${detail}`)
  }

  // FLAC requested but Qobuz delivered lossy — honor the Bitrate Fallback
  // setting for streamed content. Purchased content is exempt: the owned
  // format is the best obtainable anywhere, so it downloads with the
  // "Lower bitrate" badge instead of erroring forever.
  const deliveredLossy = file.formatId === QOBUZ_FORMAT.MP3_320
  if (quality === 'flac' && deliveredLossy) {
    if (!bitrateFallback && !viaPurchase) {
      throw new Error('Preferred bitrate (FLAC) not available for this track on your Qobuz plan. Enable Bitrate Fallback in settings to download in a lower quality.')
    }
    // Keep the file honest: swap the templated .flac extension for .mp3.
    if (outputPath.toLowerCase().endsWith('.flac')) {
      outputPath = outputPath.slice(0, -5) + '.mp3'
    }
  }

  const res = await fetch(file.url)
  if (!res.ok || !res.body) {
    throw new Error(`Qobuz: download failed (HTTP ${res.status})`)
  }

  const total = Number(res.headers.get('content-length')) || 0
  let received = 0
  const body = Readable.fromWeb(res.body as any)
  if (onProgress) {
    body.on('data', (chunk: Buffer) => {
      received += chunk.length
      onProgress(received, total)
    })
  }

  const out = fs.createWriteStream(outputPath)
  try {
    await pipeline(body, out)
  } catch (err) {
    // Never leave a truncated file behind.
    try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
    throw err
  }

  const bytes = fs.statSync(outputPath).size
  return {
    path: outputPath,
    formatId: file.formatId,
    bytes,
    bitDepth: file.bitDepth,
    samplingRate: file.samplingRate,
    mimeType: file.mimeType,
  }
}
