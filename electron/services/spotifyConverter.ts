import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist, spotifyAPI } from './spotifyAPI'
import { fetchDeezerPublicJson, DeezerQuotaError } from './deezerPublicApi'
import { qobuzAuth } from './qobuzAuth'

export interface DeezerMatch {
  spotifyTrack: SpotifyTrack
  deezerTrack: DeezerTrackInfo | null
  matchType: 'isrc' | 'search' | 'none'
  confidence: number // 0-100
}

/** The download services the Link Analyzer can resolve a Spotify link against. */
export type MusicService = 'deezer' | 'qobuz'

/**
 * Service-neutral matched track, normalized from either Deezer or Qobuz so the
 * server and UI can treat both uniformly. The Deezer path keeps its own
 * DeezerMatch/DeezerTrackInfo shape for backward compatibility; this is the
 * shape the multi-service (2.4) path speaks.
 */
export interface ServiceTrackInfo {
  service: MusicService
  id: number | string
  title: string
  artist: { id: number | string; name: string }
  album: { id: number | string; title: string; cover: string }
  duration: number
}

/** Service-neutral match result. Mirrors DeezerMatch but carries the service. */
export interface ServiceMatch {
  spotifyTrack: SpotifyTrack
  service: MusicService
  track: ServiceTrackInfo | null
  matchType: 'isrc' | 'search' | 'none'
  confidence: number
}

export interface ServiceConversionResult {
  matched: ServiceMatch[]
  unmatched: SpotifyTrack[]
  matchRate: number
}

export interface DeezerTrackInfo {
  id: number
  title: string
  artist: { id: number; name: string }
  album: { id: number; title: string; cover_medium: string }
  duration: number
  preview: string
  readable: boolean
}

export interface ConversionResult {
  matched: DeezerMatch[]
  unmatched: SpotifyTrack[]
  matchRate: number // Percentage of tracks matched
}

class SpotifyConverter {
  private enableFallbackSearch: boolean = true

  setFallbackSearch(enabled: boolean): void {
    this.enableFallbackSearch = enabled
  }

  /**
   * Make a request to the Deezer public API.
   *
   * Routed through the shared hardened helper (retry + jittered backoff + quota
   * detection) instead of a bare https.get. Before this, a transient Deezer
   * blip or a rate-limit during a playlist conversion was swallowed into a null
   * match, so the user saw "0% matched" and concluded Deezer didn't have their
   * music — when the API was actually throttling (#audit). A real rate-limit
   * now throws DeezerQuotaError, which callers re-raise so it surfaces as
   * "Deezer is rate-limiting" rather than a false miss.
   */
  private async deezerRequest<T>(endpoint: string): Promise<T> {
    return fetchDeezerPublicJson<T>(`https://api.deezer.com${endpoint}`, { label: `convert ${endpoint}` })
  }

  /**
   * Normalize a string for comparison
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Calculate similarity between two strings (0-100)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = this.normalizeString(str1)
    const s2 = this.normalizeString(str2)

    if (s1 === s2) return 100

    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
      const longer = Math.max(s1.length, s2.length)
      const shorter = Math.min(s1.length, s2.length)
      return Math.round((shorter / longer) * 90)
    }

    // Simple word overlap calculation
    const words1 = new Set(s1.split(' '))
    const words2 = new Set(s2.split(' '))
    const intersection = [...words1].filter(w => words2.has(w))
    const union = new Set([...words1, ...words2])

    return Math.round((intersection.length / union.size) * 80)
  }

  /**
   * Try to find a Deezer track by ISRC
   */
  async matchByIsrc(isrc: string): Promise<DeezerTrackInfo | null> {
    try {
      const result = await this.deezerRequest<DeezerTrackInfo>(`/track/isrc:${isrc}`)
      if (result && result.id) {
        return result
      }
    } catch (error) {
      // A genuine "ISRC not found" is just a miss → null. But a rate-limit is
      // NOT a miss — re-raise it so the conversion reports "Deezer throttling"
      // instead of silently marking every track unmatched.
      if (error instanceof DeezerQuotaError) throw error
    }
    return null
  }

  /**
   * Try to find a Deezer track by searching
   */
  async matchBySearch(spotifyTrack: SpotifyTrack): Promise<{ track: DeezerTrackInfo; confidence: number } | null> {
    try {
      const artistName = spotifyTrack.artists[0]?.name || ''
      const trackName = spotifyTrack.name

      // Build search query
      const query = encodeURIComponent(`artist:"${artistName}" track:"${trackName}"`)
      const result = await this.deezerRequest<{ data: DeezerTrackInfo[] }>(`/search?q=${query}&limit=10`)

      if (!result.data || result.data.length === 0) {
        // Try simpler search
        const simpleQuery = encodeURIComponent(`${artistName} ${trackName}`)
        const simpleResult = await this.deezerRequest<{ data: DeezerTrackInfo[] }>(`/search?q=${simpleQuery}&limit=10`)

        if (!simpleResult.data || simpleResult.data.length === 0) {
          return null
        }
        result.data = simpleResult.data
      }

      // Find best match
      let bestMatch: { track: DeezerTrackInfo; confidence: number } | null = null

      for (const deezerTrack of result.data) {
        const titleSim = this.calculateSimilarity(trackName, deezerTrack.title)
        const artistSim = this.calculateSimilarity(artistName, deezerTrack.artist.name)

        // Weight title more heavily than artist
        const confidence = Math.round(titleSim * 0.6 + artistSim * 0.4)

        // Check duration similarity (within 5 seconds)
        const durationDiff = Math.abs((spotifyTrack.duration_ms / 1000) - deezerTrack.duration)
        const durationMatch = durationDiff <= 5

        // Boost confidence if duration matches
        const adjustedConfidence = durationMatch ? Math.min(confidence + 10, 100) : confidence

        if (!bestMatch || adjustedConfidence > bestMatch.confidence) {
          bestMatch = { track: deezerTrack, confidence: adjustedConfidence }
        }
      }

      // Only return if confidence is reasonable (> 60%)
      if (bestMatch && bestMatch.confidence >= 60) {
        return bestMatch
      }

    } catch (error: any) {
      // Rate-limit re-raised (real miss stays null) — see matchByIsrc.
      if (error instanceof DeezerQuotaError) throw error
      console.error('[SpotifyConverter] Search failed:', error.message)
    }

    return null
  }

  /**
   * Convert a single Spotify track to Deezer
   */
  async convertTrack(spotifyTrack: SpotifyTrack): Promise<DeezerMatch> {
    // Try ISRC first (most accurate)
    if (spotifyTrack.external_ids?.isrc) {
      const deezerTrack = await this.matchByIsrc(spotifyTrack.external_ids.isrc)
      if (deezerTrack) {
        return {
          spotifyTrack,
          deezerTrack,
          matchType: 'isrc',
          confidence: 100
        }
      }
    }

    // Fallback to search if enabled
    if (this.enableFallbackSearch) {
      const searchResult = await this.matchBySearch(spotifyTrack)
      if (searchResult) {
        return {
          spotifyTrack,
          deezerTrack: searchResult.track,
          matchType: 'search',
          confidence: searchResult.confidence
        }
      }
    }

    // No match found
    return {
      spotifyTrack,
      deezerTrack: null,
      matchType: 'none',
      confidence: 0
    }
  }

  /**
   * Convert a Spotify playlist to Deezer tracks
   */
  async convertPlaylist(playlist: SpotifyPlaylist, onProgress?: (current: number, total: number) => void): Promise<ConversionResult> {
    const tracks = playlist.tracks.items
      .map(item => item.track)
      .filter(track => track && track.id) // Filter out null/deleted tracks

    return this.convertTracks(tracks, onProgress)
  }

  /**
   * Convert a Spotify album to Deezer tracks
   */
  async convertAlbum(album: SpotifyAlbum, onProgress?: (current: number, total: number) => void): Promise<ConversionResult> {
    // Album tracks may not have full info, fetch each track if needed
    const tracks = album.tracks.items
      .filter(track => track && track.id)

    return this.convertTracks(tracks, onProgress)
  }

  /**
   * Convert an array of Spotify tracks
   */
  async convertTracks(tracks: SpotifyTrack[], onProgress?: (current: number, total: number) => void): Promise<ConversionResult> {
    const matched: DeezerMatch[] = []
    const unmatched: SpotifyTrack[] = []

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]

      // Rate limiting: wait 100ms between requests to avoid hitting Deezer limits
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const result = await this.convertTrack(track)

      if (result.deezerTrack) {
        matched.push(result)
      } else {
        unmatched.push(track)
      }

      if (onProgress) {
        onProgress(i + 1, tracks.length)
      }
    }

    const matchRate = tracks.length > 0
      ? Math.round((matched.length / tracks.length) * 100)
      : 0

    return { matched, unmatched, matchRate }
  }

  // ==================== Qobuz matching (service-neutral) ====================
  //
  // Qobuz has no ISRC lookup endpoint the way Deezer does (/track/isrc:XXX). So
  // the Qobuz path searches by artist + title, then CONFIRMS the hit by matching
  // the candidate's own isrc field against Spotify's. That preserves ISRC-grade
  // accuracy without a dedicated endpoint; it just costs one search call per
  // track instead of a direct lookup. Falls back to fuzzy scoring like Deezer.

  /** Normalize a raw Qobuz track object into the service-neutral shape. */
  private normalizeQobuzTrack(t: any): ServiceTrackInfo {
    const img = t.album?.image || {}
    return {
      service: 'qobuz',
      id: t.id,
      title: t.title || '',
      artist: {
        id: t.performer?.id ?? t.album?.artist?.id ?? 0,
        name: t.performer?.name || t.album?.artist?.name || 'Unknown Artist'
      },
      album: {
        id: t.album?.id ?? 0,
        title: t.album?.title || '',
        cover: img.large || img.small || img.thumbnail || ''
      },
      duration: t.duration || 0
    }
  }

  /** Run a Qobuz catalog search and return the raw track items (may be empty). */
  private async qobuzSearchTracks(query: string, limit = 15): Promise<any[]> {
    const results = await qobuzAuth.search(query, limit)
    const items = results?.tracks?.items
    return Array.isArray(items) ? items : []
  }

  /**
   * Find a Qobuz track by ISRC. No direct endpoint exists, so we search by
   * artist + title and confirm on the isrc field. Returns null on a clean miss.
   */
  async matchQobuzByIsrc(isrc: string, spotifyTrack: SpotifyTrack): Promise<ServiceTrackInfo | null> {
    const artistName = spotifyTrack.artists[0]?.name || ''
    const items = await this.qobuzSearchTracks(`${artistName} ${spotifyTrack.name}`.trim(), 20)
    const target = isrc.toUpperCase()
    const hit = items.find(t => String(t.isrc || '').toUpperCase() === target)
    return hit ? this.normalizeQobuzTrack(hit) : null
  }

  /** Find the best fuzzy Qobuz match for a Spotify track (title/artist/duration). */
  async matchQobuzBySearch(spotifyTrack: SpotifyTrack): Promise<{ track: ServiceTrackInfo; confidence: number } | null> {
    const artistName = spotifyTrack.artists[0]?.name || ''
    const trackName = spotifyTrack.name
    const items = await this.qobuzSearchTracks(`${artistName} ${trackName}`.trim(), 15)
    if (items.length === 0) return null

    let bestMatch: { track: ServiceTrackInfo; confidence: number } | null = null
    for (const t of items) {
      const performerName = t.performer?.name || t.album?.artist?.name || ''
      const titleSim = this.calculateSimilarity(trackName, t.title || '')
      const artistSim = this.calculateSimilarity(artistName, performerName)
      const confidence = Math.round(titleSim * 0.6 + artistSim * 0.4)

      const durationDiff = Math.abs((spotifyTrack.duration_ms / 1000) - (t.duration || 0))
      const adjustedConfidence = durationDiff <= 5 ? Math.min(confidence + 10, 100) : confidence

      if (!bestMatch || adjustedConfidence > bestMatch.confidence) {
        bestMatch = { track: this.normalizeQobuzTrack(t), confidence: adjustedConfidence }
      }
    }

    return bestMatch && bestMatch.confidence >= 60 ? bestMatch : null
  }

  /** Convert a single Spotify track to a Qobuz match (ISRC first, then search). */
  async convertTrackToQobuz(spotifyTrack: SpotifyTrack): Promise<ServiceMatch> {
    if (spotifyTrack.external_ids?.isrc) {
      const isrcTrack = await this.matchQobuzByIsrc(spotifyTrack.external_ids.isrc, spotifyTrack)
      if (isrcTrack) {
        return { spotifyTrack, service: 'qobuz', track: isrcTrack, matchType: 'isrc', confidence: 100 }
      }
    }

    if (this.enableFallbackSearch) {
      const searchResult = await this.matchQobuzBySearch(spotifyTrack)
      if (searchResult) {
        return { spotifyTrack, service: 'qobuz', track: searchResult.track, matchType: 'search', confidence: searchResult.confidence }
      }
    }

    return { spotifyTrack, service: 'qobuz', track: null, matchType: 'none', confidence: 0 }
  }

  /**
   * Convert an array of Spotify tracks to Qobuz matches. A single track's search
   * failure is logged and counted as unmatched rather than aborting the whole
   * playlist, mirroring how the Deezer path tolerates individual misses.
   */
  async convertTracksToQobuz(tracks: SpotifyTrack[], onProgress?: (current: number, total: number) => void): Promise<ServiceConversionResult> {
    const matched: ServiceMatch[] = []
    const unmatched: SpotifyTrack[] = []

    for (let i = 0; i < tracks.length; i++) {
      // Rate limiting: space out Qobuz search calls to stay under its limits.
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      try {
        const result = await this.convertTrackToQobuz(tracks[i])
        if (result.track) matched.push(result)
        else unmatched.push(tracks[i])
      } catch (error: any) {
        console.error('[SpotifyConverter] Qobuz match failed for track:', tracks[i]?.name, error?.message)
        unmatched.push(tracks[i])
      }

      if (onProgress) {
        onProgress(i + 1, tracks.length)
      }
    }

    const matchRate = tracks.length > 0
      ? Math.round((matched.length / tracks.length) * 100)
      : 0

    return { matched, unmatched, matchRate }
  }

  /**
   * Try to find a Deezer album matching a Spotify album
   */
  async matchAlbum(album: SpotifyAlbum): Promise<{ id: number; title: string; cover: string } | null> {
    try {
      const artistName = album.artists[0]?.name || ''
      const albumName = album.name

      const query = encodeURIComponent(`artist:"${artistName}" album:"${albumName}"`)
      const result = await this.deezerRequest<{ data: Array<{ id: number; title: string; cover_medium: string; artist: { name: string } }> }>(
        `/search/album?q=${query}&limit=5`
      )

      if (result.data && result.data.length > 0) {
        // Find best match
        for (const deezerAlbum of result.data) {
          const titleSim = this.calculateSimilarity(albumName, deezerAlbum.title)
          const artistSim = this.calculateSimilarity(artistName, deezerAlbum.artist.name)

          if (titleSim >= 80 && artistSim >= 70) {
            return {
              id: deezerAlbum.id,
              title: deezerAlbum.title,
              cover: deezerAlbum.cover_medium
            }
          }
        }
      }
    } catch (error) {
      // Rate-limit re-raised (real miss stays null) — see matchByIsrc.
      if (error instanceof DeezerQuotaError) throw error
      console.error('[SpotifyConverter] Album search failed:', error)
    }

    return null
  }
}

export const spotifyConverter = new SpotifyConverter()
