export interface Track {
  id: number | string
  title: string
  title_short?: string
  artist: Artist
  album?: Album
  duration: number
  preview?: string
  link?: string
  cover?: string
  explicit_lyrics?: boolean
  rank?: number
  readable?: boolean
  contributors?: Array<{
    id?: number
    name?: string
    role?: string
  }>
  // Non-Deezer source markers (Qobuz) — drive download routing in downloadStore.
  source?: 'deezer' | 'qobuz'
  qobuzId?: string | number
}

export interface Album {
  id: number | string
  title: string
  cover?: string
  cover_small?: string
  cover_medium?: string
  cover_big?: string
  cover_xl?: string
  artist?: Artist
  tracks?: { data: Track[] }
  nb_tracks?: number
  duration?: number
  release_date?: string
  record_type?: string
  explicit_lyrics?: boolean
  link?: string
  fans?: number
  // Non-Deezer source markers (Qobuz) — drive download routing in downloadStore.
  source?: 'deezer' | 'qobuz'
  qobuzId?: string | number
  qobuzType?: 'album' | 'playlist'
  qobuzData?: any
}

export interface Artist {
  id: number | string
  name: string
  picture?: string
  picture_small?: string
  picture_medium?: string
  picture_big?: string
  picture_xl?: string
  nb_album?: number
  nb_fan?: number
  link?: string
}

export interface Playlist {
  id: number | string
  title: string
  description?: string
  picture?: string
  picture_small?: string
  picture_medium?: string
  picture_big?: string
  picture_xl?: string
  creator?: {
    id: number
    name: string
  }
  nb_tracks?: number
  duration?: number
  public?: boolean
  link?: string
  tracks?: { data: Track[] }
  // Non-Deezer source markers (Qobuz) — drive download routing.
  source?: 'deezer' | 'qobuz'
  qobuzId?: string | number
  qobuzType?: 'album' | 'playlist'
}

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'error' | 'paused'

// Detailed error information for better diagnostics
export interface ErrorDetails {
  message: string                    // Human-readable error message
  code?: string                      // Error code (e.g., 'TRACK_UNAVAILABLE', 'GEO_RESTRICTED')
  httpStatus?: number               // HTTP status code if applicable
  serverResponse?: string           // Raw server response for debugging
  timestamp?: string                // When the error occurred
  trackId?: string | number         // Associated track ID
  suggestion?: string               // Suggestion for user action
}

export interface FailedTrack {
  id: string
  trackId?: string | number  // Deezer track ID for lookup
  title: string
  artist?: string
  albumTitle?: string
  error?: string
  errorDetails?: ErrorDetails       // Enhanced error information
}

// Track fulfilled by an ISRC/FALLBACK-matched alternate release — recorded so
// the "Alternate version" badge can list exactly which tracks were substituted.
export interface SubstitutedTrack {
  id: string
  trackId?: string | number
  title: string
  artist?: string
}

export interface DownloadItem {
  id: string
  track?: Track
  album?: Album
  playlist?: Playlist
  // Which service fulfilled this download — drives the source chip in the rack.
  source?: 'deezer' | 'qobuz'
  title: string
  artist?: string
  cover?: string
  progress: number
  status: DownloadStatus
  type: 'track' | 'album' | 'playlist'
  path?: string
  error?: string
  errorDetails?: ErrorDetails       // Enhanced error information
  addedAt: string
  quality?: '128' | '320' | 'flac'  // Quality at time of download (requested)
  actualFormat?: string             // Actual downloaded format (may differ due to fallback)
  substituted?: boolean             // Exact track was unavailable; an alternate release (possibly a different master) was downloaded
  skippedAsDuplicate?: boolean      // Every track completed by skipping (already in library) — nothing was downloaded, so no delivered tier exists; drives the IN LIBRARY chip
  substitutedTracks?: SubstitutedTrack[]  // Which tracks were substituted — drives the badge drill-down list
  // For album/playlist downloads
  totalTracks?: number
  completedTracks?: number
  failedTracks?: FailedTrack[]
  trackIds?: string[]  // Server-side download IDs for individual tracks
  // Catalog ids of the tracks contained in an album/playlist row — feeds the
  // duplicate toast so a single-track re-attempt of an album-downloaded song
  // is refused at enqueue instead of creating a row the ISRC layer must skip.
  catalogTrackIds?: Array<number | string>
  // Tracks completed before a retry — added to completedTracks for display
  previouslyCompletedTracks?: number
  // Original total track count — preserved across retries for display
  originalTotalTracks?: number
  // Batch download context (for retry of converted Spotify playlists)
  batchConfig?: {
    trackIds: number[]
    playlistName: string
    cover?: string
  }
  // Speed tracking
  speed?: number        // Bytes per second (if server provides it)
  bytesDownloaded?: number
  totalBytes?: number
  // True when this queue item is a "Refresh tags" operation, not a download.
  // Refresh items are excluded from download history/stats and never set the
  // album/playlist "downloaded" status. See deemix-v1.10.1-refresh-polish.
  refresh?: boolean
}

export interface DownloadHistoryEntry {
  id: string
  title: string
  artist?: string
  type: 'track' | 'album' | 'playlist'
  source?: 'deezer' | 'qobuz'
  quality?: string
  actualFormat?: string
  substituted?: boolean
  substitutedTracks?: SubstitutedTrack[]
  skippedAsDuplicate?: boolean
  path?: string
  status: 'completed' | 'error'
  error?: string
  completedAt: string
  totalTracks?: number
  failedTracks?: number
}

export interface SearchResults {
  tracks: Track[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
}

export interface DeezerAPIResponse<T> {
  data: T[]
  total?: number
  prev?: string
  next?: string
}
