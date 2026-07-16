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
 */
export async function downloadQobuzTrack(
  trackId: string | number,
  quality: '128' | '320' | 'flac',
  outputPath: string,
  onProgress?: (bytes: number, total: number) => void
): Promise<QobuzDownloadResult> {
  if (!qobuzAuth.isLoggedIn()) throw new Error('Qobuz: not connected — link your account in Settings')

  const formatId = qualityToFormatId(quality)
  const file = await qobuzAuth.getFileUrl(trackId, formatId)
  if (file.restricted || !file.url) {
    throw new Error(`Qobuz: track ${trackId} is not available at the requested quality on this account`)
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
