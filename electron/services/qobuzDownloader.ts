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
import https from 'https'
import { qobuzAuth, QOBUZ_FORMAT, type QobuzFormatId } from './qobuzAuth'

// Stream a URL to disk over node https — the SAME transport the Deezer
// downloader has proven at scale. Electron's bundled undici (global fetch)
// deterministically dies with 'terminated' at byte 1 on some Qobuz CDN
// transfers that curl, system-node fetch, and node https all handle fine.
function httpsStreamToFile(
  url: string,
  outputPath: string,
  onProgress?: (bytes: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://play.qobuz.com/',
        'Accept': '*/*',
      },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume()
        reject(new Error(`Qobuz: download failed (HTTP ${res.statusCode})`))
        return
      }
      const total = Number(res.headers['content-length']) || 0
      let received = 0
      // Stall watchdog — no bytes for 60s aborts the attempt (mirrors Deezer).
      let stall: NodeJS.Timeout | null = null
      const resetStall = () => {
        if (stall) clearTimeout(stall)
        stall = setTimeout(() => res.destroy(new Error('stream stalled — no data for 60s')), 60000)
      }
      resetStall()
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (onProgress) onProgress(received, total)
        resetStall()
      })
      const out = fs.createWriteStream(outputPath)
      res.pipe(out)
      out.on('finish', () => {
        if (stall) clearTimeout(stall)
        if (total > 0 && received < total) {
          reject(new Error(`incomplete stream: ${received} of ${total} bytes`))
        } else {
          resolve()
        }
      })
      res.on('error', (e) => { if (stall) clearTimeout(stall); reject(e) })
      out.on('error', (e) => { if (stall) clearTimeout(stall); reject(e) })
    })
    req.on('timeout', () => { req.destroy(new Error('connection timeout')) })
    req.on('error', reject)
  })
}

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

  // Stream with retries. Hi-res files run hundreds of MB and Qobuz's CDN
  // occasionally aborts a stream ('terminated' — observed dying at byte 1 of a
  // 280 MB track); one abort must not fail the track. Each attempt re-resolves
  // a FRESH signed URL (the old one may be expired/poisoned) and cleans up the
  // partial file. Only network-class failures retry — real HTTP errors don't.
  const STREAM_ATTEMPTS = 3
  const isNetworkError = (e: any) =>
    /terminated|aborted|ECONNRESET|ETIMEDOUT|EPIPE|socket|network|fetch failed|premature close|stalled|incomplete stream|connection timeout/i.test(e?.message || String(e))
  let lastStreamError: any
  let streamed = false
  for (let attempt = 1; attempt <= STREAM_ATTEMPTS && !streamed; attempt++) {
    if (attempt > 1) {
      console.log(`[QobuzDL] Stream attempt ${attempt}/${STREAM_ATTEMPTS} for ${trackId} (fresh URL) after: ${lastStreamError?.message}`)
      await new Promise(r => setTimeout(r, attempt * 1500))
      const refreshed = await qobuzAuth.getFileUrl(trackId, file.formatId as QobuzFormatId, viaPurchase ? 'download' : 'stream')
      if (refreshed.url && !refreshed.restricted) file = refreshed
    }
    try {
      try {
        await httpsStreamToFile(file.url, outputPath, onProgress)
      } catch (err) {
        // Never leave a truncated file behind.
        try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
        throw err
      }
      streamed = true
    } catch (err: any) {
      lastStreamError = err
      if (!isNetworkError(err) || attempt === STREAM_ATTEMPTS) {
        let host = ''
        try { host = new URL(file.url).host } catch { /* diagnostic only */ }
        const friendly = isNetworkError(err)
          ? `Qobuz stream interrupted (${err?.message || 'connection lost'}) after ${attempt} attempt${attempt > 1 ? 's' : ''} — CDN ${host || 'unknown'}; retry the download`
          : (err?.message || String(err))
        throw new Error(friendly)
      }
    }
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
