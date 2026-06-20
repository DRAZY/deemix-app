import * as https from 'https'

// Quota-aware, paced client for the public Deezer API (api.deezer.com).
//
// Background (#84, #93): the public API enforces a per-IP request quota. When a
// burst of requests trips it, Deezer returns `{ error: { code: 4, type: 'Quota'
// ... } }` with HTTP 200. Code that fires raw https.get in a tight loop — e.g.
// artist-sync enumerating a 90-release discography, or several syncs running at
// once — trips this and, with no retry, silently drops whichever releases caught
// the error. This client fixes both halves of that:
//   1. Pacing: a global, serialized, jittered min-gap between request STARTS, so
//      concurrent callers can't burst the quota in the first place.
//   2. Retry: quota/transient failures back off (exponential + jitter) and retry
//      instead of dropping the item. Jitter is essential so a batch that all trip
//      at once doesn't retry in lockstep and re-trip the limit together.
//
// All public-API enumeration in the main process should go through here rather
// than calling https.get directly. See issue #84 (manual discography) and #93
// (artist sync) — same root cause, two call sites.

// --- pacing gate -----------------------------------------------------------
// Base gap between request starts (ms); jittered ±50% at the call site. Paced
// sequential access stays comfortably under the quota (verified: 90 sequential
// /album/tracks calls drop 0; an 8-wide burst drops ~45%).
const PACING_BASE_GAP_MS = 200

let nextSlotAt = 0
// Serializes slot reservation across all concurrent callers so two requests
// can't claim the same window.
let pacingChain: Promise<void> = Promise.resolve()

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function awaitPacingSlot(): Promise<void> {
  const run = pacingChain.then(async () => {
    const now = Date.now()
    const wait = Math.max(0, nextSlotAt - now)
    if (wait > 0) await sleep(wait)
    const gap = Math.round(PACING_BASE_GAP_MS * (0.5 + Math.random())) // jitter ±50%
    nextSlotAt = Date.now() + gap
  })
  // Keep the chain alive even if a waiter is interrupted.
  pacingChain = run.catch(() => {})
  return run
}

// --- error classification --------------------------------------------------
export class DeezerQuotaError extends Error {
  constructor(message = 'Quota limit exceeded') {
    super(message)
    this.name = 'DeezerQuotaError'
  }
}

function isRetryable(err: any): boolean {
  if (err instanceof DeezerQuotaError) return true
  const code = err?.code
  if (code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' || code === 'EAI_AGAIN') return true
  const msg = (err?.message || '').toLowerCase()
  return msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests')
}

// Detect a quota/rate error embedded in a 200-OK Deezer error envelope.
function quotaFromEnvelope(error: any): boolean {
  if (!error) return false
  const type = String(error.type || '').toLowerCase()
  const msg = String(error.message || '').toLowerCase()
  return error.code === 4 || type.includes('quota') || msg.includes('quota') ||
         msg.includes('rate limit') || msg.includes('too many requests')
}

// --- single GET (paced, parses the Deezer error envelope) ------------------
function rawGetJson<T = any>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 20000 }, (res) => {
      let data = ''
      res.on('data', (chunk: any) => (data += chunk))
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed && parsed.error) {
            if (quotaFromEnvelope(parsed.error)) {
              reject(new DeezerQuotaError(parsed.error.message || 'Quota limit exceeded'))
            } else {
              reject(new Error(parsed.error.message || 'Deezer API error'))
            }
            return
          }
          resolve(parsed as T)
        } catch {
          reject(new Error('Failed to parse Deezer response'))
        }
      })
    }).on('error', reject).on('timeout', function (this: any) {
      this.destroy(new Error('Deezer request timed out'))
    })
  })
}

// Paced + retrying JSON GET. Retries quota/transient errors with jittered
// exponential backoff; throws the last error if all attempts fail.
export async function fetchDeezerPublicJson<T = any>(
  url: string,
  opts: { maxRetries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 4
  const baseDelayMs = opts.baseDelayMs ?? 800
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await awaitPacingSlot()
    try {
      return await rawGetJson<T>(url)
    } catch (err: any) {
      lastError = err
      if (!isRetryable(err) || attempt === maxRetries) throw err
      // Exponential backoff with full jitter so a burst that all trip the quota
      // at once doesn't retry in lockstep and re-trip it together (#84).
      const target = baseDelayMs * Math.pow(2, attempt - 1)
      const delay = Math.round(target * (0.5 + Math.random()))
      console.log(`[DeezerPublicApi] ${opts.label || url} failed (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${delay}ms...`)
      await sleep(delay)
    }
  }
  throw lastError
}

// Convenience: follow Deezer's `next` pagination, accumulating `.data`.
export async function fetchDeezerPublicPaginated<T = any>(
  firstUrl: string,
  label?: string
): Promise<T[]> {
  const items: T[] = []
  let url: string | null = firstUrl
  while (url) {
    const page: any = await fetchDeezerPublicJson<any>(url, { label })
    for (const item of page.data || []) items.push(item)
    url = page.next || null
  }
  return items
}
