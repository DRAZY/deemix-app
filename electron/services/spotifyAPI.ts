import * as https from 'https'
import { isSpotifyUrl as isSpotifyUrlByHost } from '../utils/urlHost'

/**
 * Error from the Spotify API carrying the HTTP status, so callers can
 * distinguish transient (429/5xx), not-found (404), auth (401/403), and
 * non-JSON responses instead of pattern-matching a message string (#119).
 */
export class SpotifyApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'SpotifyApiError'
  }
}

/**
 * Spotify returned the playlist, but without its contents.
 *
 * Since the February 2026 Web API changes, a Development Mode app is only given
 * the songs for playlists the authorising user owns or collaborates on. Every
 * other playlist comes back as a normal 200 carrying name, artwork and
 * description, with the contents object simply absent. That is a success as far
 * as HTTP is concerned, so it cannot be represented as a `status >= 400` and
 * needs its own type (reported by @alex5908, 2026-08-15).
 */
export class SpotifyContentsUnavailableError extends SpotifyApiError {
  constructor(message: string) {
    super(message, 200)
    this.name = 'SpotifyContentsUnavailableError'
  }
}

/**
 * The playlist contents object, under either the old or the new field name.
 *
 * February 2026 renamed the container and the per-entry key: `tracks` became
 * `items`, and each entry's `track` became `item`. Both shapes are live at the
 * same time — an app registered before the migration is still served the old
 * one, a Client ID created today gets the new one — so the reader accepts
 * either rather than picking a side. Everything downstream keeps seeing the old
 * shape because `getPlaylist` normalises before returning.
 */
interface RawContents {
  entries: Array<Record<string, any>>
  total: number | null
  next: string | null
}

function readContents(playlist: any): RawContents | null {
  const container = playlist?.tracks ?? playlist?.items
  if (!container || typeof container !== 'object') return null
  const entries = container.items ?? container.tracks
  if (!Array.isArray(entries)) return null
  return {
    entries,
    total: typeof container.total === 'number' ? container.total : null,
    next: typeof container.next === 'string' ? container.next : null,
  }
}

/** A contents entry holds its track under `track` (old) or `item` (new). */
function entryTrack(entry: Record<string, any>): SpotifyTrack | null {
  return (entry?.track ?? entry?.item ?? null) as SpotifyTrack | null
}

/** `next` is an absolute URL; apiRequest wants the path after the version. */
function nextEndpoint(next: string | null): string | null {
  if (!next) return null
  const marker = 'api.spotify.com/v1'
  const at = next.indexOf(marker)
  return at === -1 ? null : next.slice(at + marker.length)
}

/**
 * Spotify playlists whose id begins with this prefix are owned by Spotify
 * itself: editorial ("All Out 60s", "RapCaviar") and algorithmic ("Discover
 * Weekly"). Since Spotify's November 2024 endpoint changes these are invisible
 * to Web API apps, which report them as a plain 404 rather than a permission
 * error. Verified 2026-08-11 against a live app: All Out 60s, Today's Top Hits,
 * RapCaviar and Discover Weekly all return 404 "Resource not found", while
 * every user-owned playlist tested returned 200.
 */
const SPOTIFY_OWNED_PLAYLIST_PREFIX = /^37i9dQZ/

export function isSpotifyOwnedPlaylistId(id: string | null | undefined): boolean {
  return !!id && SPOTIFY_OWNED_PLAYLIST_PREFIX.test(id)
}

/**
 * Turn a raw Spotify failure into something a user can act on.
 *
 * Two failure modes dominate and they look identical in the raw API response
 * layer, which is what made issues #117 and #137 hard to tell apart:
 *
 *  - 404 on a Spotify-owned playlist. Nothing is wrong with the user's setup;
 *    the playlist simply cannot be read by any third-party app any more.
 *  - 403 naming a premium subscription. Spotify's February 2026 developer
 *    update made Development Mode require the *app owner* to hold Premium,
 *    effective 9 March 2026. Token issuance still succeeds, so this only
 *    surfaces on real reads.
 *
 * `playlistId` is optional context; when present it lets a 404 be attributed
 * to the Spotify-owned case rather than a generic "not found".
 */
export function describeSpotifyError(err: unknown, playlistId?: string | null): string {
  const status = err instanceof SpotifyApiError ? err.status : 0
  const raw = err instanceof Error ? err.message : String(err)

  // Checked first, and by type rather than status: this one arrives as a 200.
  //
  // The advice here was wrong in 2.5.7 and cost a user real time: it suggested
  // copying the tracks into a playlist of your own. That cannot help, because
  // this app signs in with a client ID and secret and no user login, so there is
  // no authorising account for any playlist to be owned by. @alex5908 tried it
  // on a playlist he had just created himself and got the identical response.
  if (err instanceof SpotifyContentsUnavailableError) {
    return 'Spotify sent the playlist details but not the songs in it. Since February 2026 a ' +
      'developer app only receives the contents of playlists belonging to the account that ' +
      'authorised it. This app signs in with a Client ID and Secret and no personal login, so ' +
      'there is no such account, and Spotify withholds the songs for every playlist including ' +
      'your own. Nothing is wrong with your credentials, and Spotify Premium does not change it. ' +
      'This affects apps whose Spotify credentials were created recently; older ones are still ' +
      'served the songs. The only fix is on Spotify\'s side: request extended access for your app ' +
      'in the Spotify Developer Dashboard so it is no longer in Development Mode.'
  }

  if (status === 404 && isSpotifyOwnedPlaylistId(playlistId)) {
    return 'Spotify no longer lets other apps read its own playlists, and this is one of them ' +
      '(the editorial and auto-generated ones such as "All Out 60s" or "Discover Weekly"). ' +
      'Nothing is wrong with your setup. If your Spotify Client ID was created before February ' +
      '2026, you can open the playlist in Spotify, add its tracks to a playlist of your own, and ' +
      'sync that one instead. If you created it recently, copying will not help either: Spotify ' +
      'withholds the songs from newer developer apps for every playlist including your own, and ' +
      'the way out is to request extended access for your app in the Spotify Developer Dashboard.'
  }
  if (status === 404) {
    return 'Spotify could not find this playlist. It may have been deleted, made private, or it ' +
      'may be one of Spotify\'s own playlists, which other apps are no longer allowed to read.'
  }
  if (status === 403 && /premium/i.test(raw)) {
    return 'Spotify now requires the account that created your developer app to have Spotify ' +
      'Premium. This started on 9 March 2026 and applies to the app owner only, not to anyone ' +
      'whose playlists you are reading. Upgrading that account fixes it, and Spotify notes it can ' +
      'take a few hours to take effect.'
  }
  if (status === 403) {
    return `Spotify refused the request: ${raw}`
  }
  if (status === 401) {
    return 'Spotify rejected the credentials. Re-copy the Client ID and Client Secret from the ' +
      'Spotify Developer Dashboard and test the connection again.'
  }
  if (status === 429) {
    return 'Spotify is rate-limiting requests. Wait a few minutes and try again.'
  }
  return raw
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: Array<{ id: string; name: string }>
  album: {
    id: string
    name: string
    images: Array<{ url: string; width: number; height: number }>
    release_date: string
  }
  duration_ms: number
  explicit: boolean
  external_ids?: {
    isrc?: string
  }
  preview_url: string | null
  popularity: number
}

export interface SpotifyAlbum {
  id: string
  name: string
  artists: Array<{ id: string; name: string }>
  images: Array<{ url: string; width: number; height: number }>
  release_date: string
  total_tracks: number
  tracks: {
    items: SpotifyTrack[]
    total: number
  }
  label: string
  genres: string[]
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  owner: { id: string; display_name: string }
  images: Array<{ url: string; width: number; height: number }>
  tracks: {
    items: Array<{ track: SpotifyTrack }>
    total: number
  }
  public: boolean
}

export interface SpotifyArtist {
  id: string
  name: string
  images: Array<{ url: string; width: number; height: number }>
  genres: string[]
  followers: { total: number }
  popularity: number
}

class SpotifyAPI {
  private accessToken: string | null = null
  private tokenExpiry: number = 0
  private clientId: string = ''
  private clientSecret: string = ''

  /**
   * Set credentials for Spotify API
   */
  setCredentials(clientId: string, clientSecret: string): void {
    this.clientId = clientId
    this.clientSecret = clientSecret
    // Reset token when credentials change
    this.accessToken = null
    this.tokenExpiry = 0
  }

  /**
   * Check if credentials are configured
   */
  hasCredentials(): boolean {
    return !!(this.clientId && this.clientSecret)
  }

  /**
   * Authenticate with Spotify using Client Credentials flow
   */
  async authenticate(): Promise<boolean> {
    if (!this.clientId || !this.clientSecret) {
      console.error('[SpotifyAPI] No credentials configured')
      return false
    }

    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')

      const response = await this.makeRequest<{
        access_token: string
        token_type: string
        expires_in: number
      }>({
        hostname: 'accounts.spotify.com',
        path: '/api/token',
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      })

      this.accessToken = response.access_token
      // Set expiry 5 minutes before actual expiry to ensure we refresh in time
      this.tokenExpiry = Date.now() + (response.expires_in - 300) * 1000
      console.log('[SpotifyAPI] Successfully authenticated')
      return true
    } catch (error: any) {
      console.error('[SpotifyAPI] Authentication failed:', error.message)
      this.accessToken = null
      this.tokenExpiry = 0
      return false
    }
  }

  /**
   * Ensure we have a valid token, refreshing if needed
   */
  private async ensureToken(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      const success = await this.authenticate()
      if (!success) {
        throw new Error('Failed to authenticate with Spotify')
      }
    }
  }

  /**
   * Perform a single HTTP request. Resolves with { status, body } — parsing and
   * retry decisions are the caller's (requestWithRetry), so transport stays
   * dumb and every status/body is observable rather than collapsed to a string.
   */
  private rawRequest(options: {
    hostname: string
    path: string
    method?: string
    headers?: Record<string, string>
    body?: string
  }): Promise<{ status: number; body: string; retryAfter?: number }> {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: options.hostname,
        path: options.path,
        method: options.method || 'GET',
        headers: options.headers
      }, (res) => {
        // Collect as Buffers and decode once, so multi-byte UTF-8 split across
        // chunk boundaries can't corrupt the JSON (string += Buffer decoded per
        // chunk).
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(Buffer.from(chunk)))
        res.on('end', () => {
          const ra = parseInt(String(res.headers['retry-after'] || ''), 10)
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf-8'),
            retryAfter: Number.isFinite(ra) ? ra : undefined
          })
        })
      })

      req.on('error', reject)

      if (options.body) {
        req.write(options.body)
      }
      req.end()
    })
  }

  /**
   * Make an HTTP request with diagnostics and transient-failure retry.
   *
   * - 2xx non-JSON body → SpotifyApiError with status + a body snippet, so a
   *   gateway HTML page / empty body is legible instead of the old opaque
   *   "Failed to parse Spotify response".
   * - 429 and 5xx → retried up to `maxRetries` with backoff (honoring
   *   Retry-After), since these are the transient responses that surface as
   *   non-JSON bodies from Spotify's edge (issue #119).
   * - 4xx (non-429) → SpotifyApiError carrying Spotify's own error message and
   *   status, no retry.
   */
  private async makeRequest<T>(options: {
    hostname: string
    path: string
    method?: string
    headers?: Record<string, string>
    body?: string
  }, maxRetries = 3): Promise<T> {
    let lastErr: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: { status: number; body: string; retryAfter?: number }
      try {
        res = await this.rawRequest(options)
      } catch (e: any) {
        // Network-layer failure (DNS, reset, timeout) — transient, retry.
        lastErr = new SpotifyApiError(`Spotify request failed: ${e.message}`, 0)
        if (attempt < maxRetries) { await this.backoff(attempt); continue }
        throw lastErr
      }

      const { status, body, retryAfter } = res

      // Transient server/edge errors and rate limits — retry with backoff.
      if (status === 429 || status >= 500) {
        lastErr = new SpotifyApiError(
          status === 429 ? 'Spotify is rate-limiting requests' : `Spotify service error (HTTP ${status})`,
          status
        )
        if (attempt < maxRetries) {
          await this.backoff(attempt, retryAfter)
          continue
        }
        throw lastErr
      }

      // Parse the body. Spotify sends JSON for every normal response including
      // 4xx; a parse failure here means a non-JSON body (empty, HTML block
      // page, proxy interception) — surface status + snippet, don't retry.
      let parsed: any
      try {
        parsed = JSON.parse(body)
      } catch {
        const snippet = body.trim().slice(0, 120).replace(/\s+/g, ' ')
        throw new SpotifyApiError(
          snippet
            ? `Spotify returned a non-JSON response (HTTP ${status}): ${snippet}`
            : `Spotify returned an empty response (HTTP ${status})`,
          status
        )
      }

      if (status >= 400) {
        throw new SpotifyApiError(parsed?.error?.message || `HTTP ${status}`, status)
      }
      return parsed as T
    }

    throw lastErr || new SpotifyApiError('Spotify request failed', 0)
  }

  /** Backoff between retries: Retry-After (capped) when given, else exponential. */
  private backoff(attempt: number, retryAfterSec?: number): Promise<void> {
    const ms = retryAfterSec != null
      ? Math.min(retryAfterSec * 1000, 10000)
      : Math.min(500 * 2 ** attempt, 4000)
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Make an authenticated API request
   */
  private async apiRequest<T>(endpoint: string): Promise<T> {
    await this.ensureToken()

    return this.makeRequest<T>({
      hostname: 'api.spotify.com',
      path: `/v1${endpoint}`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    })
  }

  /**
   * Parse a Spotify URL or URI
   */
  parseSpotifyUrl(url: string): { type: string; id: string } | null {
    // Handle Spotify URIs: spotify:track:4iV5W9uYEdYUVa79Axb7Rh
    const uriMatch = url.match(/^spotify:(track|album|playlist|artist):([a-zA-Z0-9]+)$/)
    if (uriMatch) {
      return { type: uriMatch[1], id: uriMatch[2] }
    }

    // Handle Spotify URLs: https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
    const urlMatch = url.match(/open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/)
    if (urlMatch) {
      return { type: urlMatch[1], id: urlMatch[2] }
    }

    // Handle link.spotify.com URLs
    const shortMatch = url.match(/link\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/)
    if (shortMatch) {
      return { type: shortMatch[1], id: shortMatch[2] }
    }

    return null
  }

  /**
   * Check if a URL is a Spotify URL
   */
  isSpotifyUrl(url: string): boolean {
    return isSpotifyUrlByHost(url)
  }

  /**
   * Verify the credentials can actually READ, not merely mint a token.
   *
   * authenticate() only performs the client-credentials exchange, and that
   * exchange keeps succeeding under both of the failure modes users hit: the
   * premium requirement and the Spotify-owned-playlist block. So a token-only
   * check reported "Connected to Spotify" to users for whom every subsequent
   * request was guaranteed to fail, which is exactly what happened in #137.
   *
   * A search costs one request and exercises the same authenticated read path
   * a sync uses, so a 403 shows up here instead of hours later on a schedule.
   */
  async verifyReadAccess(): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await this.apiRequest<unknown>('/search?q=a&type=track&limit=1')
      return { ok: true }
    } catch (err) {
      return { ok: false, message: describeSpotifyError(err) }
    }
  }

  /**
   * Get track info
   */
  async getTrack(id: string): Promise<SpotifyTrack> {
    return this.apiRequest<SpotifyTrack>(`/tracks/${id}`)
  }

  /**
   * Get album info with all tracks
   */
  async getAlbum(id: string): Promise<SpotifyAlbum> {
    return this.apiRequest<SpotifyAlbum>(`/albums/${id}`)
  }

  /**
   * Get playlist info with tracks (paginated)
   */
  async getPlaylist(id: string, market: string = 'US'): Promise<SpotifyPlaylist> {
    const playlist = await this.apiRequest<any>(`/playlists/${id}?market=${market}`)

    const first = readContents(playlist)
    if (!first) {
      // 200 with the contents object absent. Not an error status, so this is the
      // only place it can be caught before a caller dereferences nothing.
      throw new SpotifyContentsUnavailableError(
        'Spotify returned this playlist without its contents.'
      )
    }

    const entries = [...first.entries]
    const total = first.total

    // Page until exhausted. Prefer the paging object's own `next` link so the
    // endpoint name is never guessed; fall back to offset paging for responses
    // that omit it. `total` is advisory only — the loop ends when Spotify stops
    // handing back pages, not when a counter says it should.
    let next = nextEndpoint(first.next)
    let offset = entries.length
    while (true) {
      if (!next && (total === null || offset >= total || entries.length === 0)) break
      const page = await this.apiRequest<any>(
        next ?? `/playlists/${id}/tracks?offset=${offset}&limit=100&market=${market}`
      )
      const pageContents = readContents({ tracks: page }) ?? readContents(page)
      if (!pageContents || pageContents.entries.length === 0) break
      entries.push(...pageContents.entries)
      offset = entries.length
      next = nextEndpoint(pageContents.next)
      if (!next && total === null) break
    }

    // Hand every caller the pre-February shape regardless of what arrived, so
    // playlistSync, spotifyConverter and server.ts need no knowledge of this.
    playlist.tracks = {
      items: entries
        .map(entry => ({ track: entryTrack(entry) }))
        .filter((entry): entry is { track: SpotifyTrack } => !!entry.track),
      total: total ?? entries.length,
    }
    delete playlist.items

    return playlist as SpotifyPlaylist
  }

  /**
   * Get artist info
   */
  async getArtist(id: string): Promise<SpotifyArtist> {
    return this.apiRequest<SpotifyArtist>(`/artists/${id}`)
  }

  /**
   * Get artist's top tracks
   */
  async getArtistTopTracks(id: string, market: string = 'US'): Promise<SpotifyTrack[]> {
    const response = await this.apiRequest<{ tracks: SpotifyTrack[] }>(
      `/artists/${id}/top-tracks?market=${market}`
    )
    return response.tracks
  }

  /**
   * Get artist's albums
   */
  async getArtistAlbums(id: string, limit: number = 50): Promise<SpotifyAlbum[]> {
    const response = await this.apiRequest<{ items: SpotifyAlbum[] }>(
      `/artists/${id}/albums?include_groups=album,single&limit=${limit}`
    )
    return response.items
  }
}

export const spotifyAPI = new SpotifyAPI()
