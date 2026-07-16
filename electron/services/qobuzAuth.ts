/**
 * Qobuz authentication + API client (WIP — feature/qobuz-integration).
 *
 * Native-downloader counterpart to deezerAuth.ts. Unlike Deezer, Qobuz serves
 * UNENCRYPTED files: `track/getFileUrl` returns a direct, time-limited CDN link
 * to the real FLAC/MP3, so there is no Blowfish/decrypt stage downstream.
 *
 * Auth model (reverse-engineered, same surface the Qobuz web player uses):
 *   - app_id + app_secret  → scraped from play.qobuz.com's bundle.js (see
 *     fetchAppCredentials). app_secret is used ONLY to sign requests, never sent.
 *   - user_auth_token      → from user/login with the subscriber's email+password.
 *
 * SECURITY: credentials are NEVER hardcoded or committed. login() takes them from
 * the caller, which sources them from safeStorage / env — the same posture as the
 * Deezer ARL and Spotify secret.
 *
 * STATUS: scaffold. fetchAppCredentials + signRequest are implemented and
 * verified against the live 8.2.0 bundle. login/getFileUrl/catalog are wired but
 * pending end-to-end validation against a real subscriber account (needs creds).
 */
import crypto from 'crypto'

const QOBUZ_API_BASE = 'https://www.qobuz.com/api.json/0.2'
const QOBUZ_LOGIN_PAGE = 'https://play.qobuz.com/login'
const QOBUZ_PLAY_BASE = 'https://play.qobuz.com'

// Qobuz format_id → quality. 6/7/27 are all FLAC; 5 is lossy.
export const QOBUZ_FORMAT = {
  MP3_320: 5,
  FLAC_CD: 6, // 16-bit / 44.1 kHz
  FLAC_HIRES_96: 7, // 24-bit / ≤96 kHz
  FLAC_HIRES_192: 27, // 24-bit / ≤192 kHz
} as const

export type QobuzFormatId = (typeof QOBUZ_FORMAT)[keyof typeof QOBUZ_FORMAT]

export interface QobuzAppCredentials {
  appId: string
  appSecret: string
}

export interface QobuzSession {
  userAuthToken: string
  userId: number
  credentialLabel?: string // subscription label, e.g. "Studio"
  isValid: boolean
}

export interface QobuzFileUrl {
  url: string
  formatId: number
  mimeType?: string
  bitDepth?: number
  samplingRate?: number
  restricted?: boolean // true when the account isn't eligible at the requested quality
}

class QobuzAuth {
  private appCreds: QobuzAppCredentials | null = null
  private session: QobuzSession | null = null

  isLoggedIn(): boolean {
    return this.session?.isValid === true
  }

  getSession(): QobuzSession | null {
    return this.session
  }

  /**
   * Scrape app_id + app_secret from the web-player bundle. This is the single
   * most fragile dependency: Qobuz reships bundle.js periodically, so we try the
   * cheapest signal first and keep the seed-reconstruction fallback documented.
   *
   * Verified 2026-07-16 against bundle 8.2.0-b034: appId 798273057, and a literal
   * appSecret is present in-bundle (older bundles only carried the obfuscated
   * per-timezone seed split — kept as fallback below).
   */
  async fetchAppCredentials(force = false): Promise<QobuzAppCredentials> {
    if (this.appCreds && !force) return this.appCreds

    const loginHtml = await this.httpText(QOBUZ_LOGIN_PAGE)
    const bundlePath = loginHtml.match(/\/resources\/[0-9.]+-[a-z0-9]+\/bundle\.js/)?.[0]
    if (!bundlePath) throw new Error('Qobuz: could not locate bundle.js in login page')

    const bundle = await this.httpText(QOBUZ_PLAY_BASE + bundlePath)

    const appId = bundle.match(/production:\{[^}]*?api:\{[^}]*?appId:"(\d+)"/)?.[1]
    if (!appId) throw new Error('Qobuz: could not extract app_id from bundle')

    // Preferred: literal secret present in current bundles.
    let appSecret = bundle.match(/appSecret:"([a-z0-9]{32})"/)?.[1] ?? ''

    // Fallback: reconstruct from the obfuscated per-timezone seed/info/extras
    // split used by older bundles (seed + info + extras, drop trailing 44, b64
    // decode → utf8). Implemented lazily only if the literal is absent.
    if (!appSecret) {
      appSecret = this.reconstructSecretFromSeeds(bundle)
    }
    if (!appSecret) throw new Error('Qobuz: could not extract app_secret from bundle')

    this.appCreds = { appId, appSecret }
    return this.appCreds
  }

  /**
   * Legacy fallback secret extraction. Older bundles split the secret across
   * `initialSeed("<seed>", window.utimezone.<tz>)` plus per-timezone
   * `info`/`extras` base64 chunks; concatenate seed+info+extras, strip the
   * trailing 44 chars, base64-decode. Returns '' if the layout isn't found.
   */
  private reconstructSecretFromSeeds(bundle: string): string {
    const seedMatch = bundle.match(/initialSeed\("([a-zA-Z0-9=]+)",window\.utimezone\.([a-z]+)\)/)
    if (!seedMatch) return ''
    const seed = seedMatch[1]
    const tzInfo = bundle.match(
      new RegExp(`name:"[a-z]+/[a-zA-Z_]+",info:"([a-zA-Z0-9=]+)",extras:"([a-zA-Z0-9=]+)"`)
    )
    if (!tzInfo) return ''
    const combined = seed + tzInfo[1] + tzInfo[2]
    try {
      return Buffer.from(combined.slice(0, -44), 'base64').toString('utf-8')
    } catch {
      return ''
    }
  }

  /**
   * Sign a request. Per Qobuz's own docs only track/getFileUrl needs signing.
   * sig = md5(object + method + <params sorted, minus app_id/user_auth_token> + ts + app_secret)
   * Params must be concatenated as `key + value` in alphabetical key order.
   */
  private signRequest(
    objectName: string,
    methodName: string,
    params: Record<string, string | number>,
    timestamp: number,
    appSecret: string
  ): string {
    const serialized = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join('')
    const raw = `${objectName}${methodName}${serialized}${timestamp}${appSecret}`
    return crypto.createHash('md5').update(raw).digest('hex')
  }

  /** Authenticate a subscriber. Credentials come from the caller (secure store). */
  async login(email: string, password: string): Promise<QobuzSession> {
    const { appId } = await this.fetchAppCredentials()
    const params = new URLSearchParams({ email, password, app_id: appId })
    const json = await this.apiGet(`user/login?${params.toString()}`)

    const token = json?.user_auth_token
    if (!token) throw new Error('Qobuz: login failed (no user_auth_token returned)')

    // Free accounts cannot download; the API returns no usable credential params.
    const label = json?.user?.credential?.parameters?.short_label
    if (!json?.user?.credential?.parameters) {
      throw new Error('Qobuz: this account has no active subscription — downloads require a paid plan')
    }

    this.session = {
      userAuthToken: token,
      userId: json.user.id,
      credentialLabel: label,
      isValid: true,
    }
    return this.session
  }

  restoreSession(userAuthToken: string, userId: number): void {
    this.session = { userAuthToken, userId, isValid: true }
  }

  logout(): void {
    this.session = null
  }

  /** Resolve a signed, direct download URL for a track at a requested format. */
  async getFileUrl(trackId: string | number, formatId: QobuzFormatId): Promise<QobuzFileUrl> {
    const { appId, appSecret } = await this.fetchAppCredentials()
    if (!this.session) throw new Error('Qobuz: not logged in')

    const ts = Math.floor(Date.now() / 1000)
    const sig = this.signRequest(
      'track',
      'getFileUrl',
      { format_id: formatId, intent: 'stream', track_id: trackId },
      ts,
      appSecret
    )
    const params = new URLSearchParams({
      request_ts: String(ts),
      request_sig: sig,
      track_id: String(trackId),
      format_id: String(formatId),
      intent: 'stream',
      app_id: appId,
    })
    const json = await this.apiGet(`track/getFileUrl?${params.toString()}`, true)

    if (!json?.url) {
      return { url: '', formatId, restricted: true }
    }
    return {
      url: json.url,
      formatId: json.format_id ?? formatId,
      mimeType: json.mime_type,
      bitDepth: json.bit_depth,
      samplingRate: json.sampling_rate,
    }
  }

  async getTrack(trackId: string | number): Promise<any> {
    const { appId } = await this.fetchAppCredentials()
    return this.apiGet(`track/get?track_id=${trackId}&app_id=${appId}`, true)
  }

  async getAlbum(albumId: string | number): Promise<any> {
    const { appId } = await this.fetchAppCredentials()
    return this.apiGet(`album/get?album_id=${albumId}&app_id=${appId}`, true)
  }

  async getPlaylist(playlistId: string | number): Promise<any> {
    const { appId } = await this.fetchAppCredentials()
    return this.apiGet(`playlist/get?playlist_id=${playlistId}&extra=tracks&app_id=${appId}`, true)
  }

  // --- transport helpers ---

  private async apiGet(pathAndQuery: string, auth = false): Promise<any> {
    const headers: Record<string, string> = {}
    if (this.appCreds) headers['X-App-Id'] = this.appCreds.appId
    if (auth && this.session) headers['X-User-Auth-Token'] = this.session.userAuthToken

    const res = await fetch(`${QOBUZ_API_BASE}/${pathAndQuery}`, { headers })
    if (!res.ok) {
      throw new Error(`Qobuz API ${pathAndQuery.split('?')[0]} failed: HTTP ${res.status}`)
    }
    return res.json()
  }

  private async httpText(url: string): Promise<string> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Qobuz: fetch ${url} failed: HTTP ${res.status}`)
    return res.text()
  }
}

export const qobuzAuth = new QobuzAuth()
