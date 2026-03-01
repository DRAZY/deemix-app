import * as https from 'https'
import { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist, spotifyAPI } from './spotifyAPI'

export interface DeezerMatch {
  spotifyTrack: SpotifyTrack
  deezerTrack: DeezerTrackInfo | null
  matchType: 'isrc' | 'search' | 'none'
  confidence: number // 0-100
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
   * Make a request to Deezer API
   */
  private async deezerRequest<T>(endpoint: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = `https://api.deezer.com${endpoint}`
      https.get(url, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'Deezer API error'))
            } else {
              resolve(parsed)
            }
          } catch (e) {
            reject(new Error('Failed to parse Deezer response'))
          }
        })
      }).on('error', reject)
    })
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
      // ISRC not found, return null
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
      console.error('[SpotifyConverter] Album search failed:', error)
    }

    return null
  }
}

export const spotifyConverter = new SpotifyConverter()
