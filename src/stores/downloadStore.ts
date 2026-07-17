import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Track, Album, Playlist, DownloadItem, DownloadStatus, FailedTrack, SubstitutedTrack, DownloadHistoryEntry } from '../types'
import { useSettingsStore } from './settingsStore'
import { useToastStore } from './toastStore'

export const useDownloadStore = defineStore('downloads', () => {
  // Use regular ref for proper reactivity
  const downloads = ref<DownloadItem[]>([])
  const downloadHistory = ref<DownloadHistoryEntry[]>([])
  const serverPort = ref(6595)

  // Debounce and idle callback tracking
  let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let idleCallbackId: number | null = null

  // Unified polling state - single loop for ALL downloads
  let unifiedPollingInterval: ReturnType<typeof setInterval> | null = null
  const pollingGroups = new Map<string, { trackIds: string[], type: 'track' | 'album' }>()

  // === PERFORMANCE: O(1) lookup Maps for duplicate detection ===
  // These Maps are updated whenever downloads change, providing instant lookups
  const trackIdToStatus = new Map<number | string, DownloadStatus>()
  const albumIdToStatus = new Map<number | string, DownloadStatus>()
  const playlistIdToStatus = new Map<number | string, DownloadStatus>()

  // === PERFORMANCE: Adaptive polling configuration ===
  const POLLING_INTERVALS = {
    idle: 5000,      // 5s when no active downloads
    light: 3000,     // 3s when 1-3 active downloads
    moderate: 2000,  // 2s when 4-10 active downloads
    heavy: 1500      // 1.5s when >10 active downloads
  }
  let currentPollingInterval = POLLING_INTERVALS.moderate

  // Helper to rebuild lookup Maps from downloads array
  function rebuildLookupMaps() {
    trackIdToStatus.clear()
    albumIdToStatus.clear()
    playlistIdToStatus.clear()

    for (const d of downloads.value) {
      // Refresh-tags items are not downloads — they must not contribute to the
      // downloaded/in-queue status maps (otherwise refreshing an album would
      // make it look downloaded).
      if (d.refresh) continue
      if (d.track?.id) {
        trackIdToStatus.set(d.track.id, d.status)
      }
      if (d.type === 'album' && d.album?.id) {
        albumIdToStatus.set(d.album.id, d.status)
      }
      if (d.type === 'playlist' && d.playlist?.id) {
        playlistIdToStatus.set(d.playlist.id, d.status)
      }
    }
  }

  // Helper to get optimal polling interval based on active downloads
  function getOptimalPollingInterval(): number {
    const activeCount = pollingGroups.size
    if (activeCount === 0) return POLLING_INTERVALS.idle
    if (activeCount <= 3) return POLLING_INTERVALS.light
    if (activeCount <= 10) return POLLING_INTERVALS.moderate
    return POLLING_INTERVALS.heavy
  }

  // Computed properties - these are cached and only recalculate when downloads changes
  const activeDownloads = computed(() =>
    downloads.value.filter(d => d.status === 'pending' || d.status === 'downloading')
  )

  const completedDownloads = computed(() =>
    downloads.value.filter(d => d.status === 'completed')
  )

  const failedDownloads = computed(() =>
    downloads.value.filter(d => d.status === 'error')
  )

  // Total download speed across all active downloads
  const totalDownloadSpeed = computed(() => {
    return activeDownloads.value.reduce((sum, d) => sum + (d.speed || 0), 0)
  })

  // Queue pause state
  const isPaused = ref(false)

  // Ids of downloads that were interrupted by the app closing and flagged on the
  // most recent startup (#98). Captured so auto-resume only touches this-session
  // interruptions, never a user's genuine prior failures.
  const interruptedDownloadIds = ref<string[]>([])

  // ============================================
  // DUPLICATE DETECTION HELPERS
  // These check if items are already in the active queue
  // ============================================

  /**
   * Check if a track is already in the download queue (pending or downloading)
   * O(1) lookup using Map instead of O(n) array search
   * @param trackId - Deezer track ID
   * @returns true if track is already queued
   */
  function isTrackInQueue(trackId: number | string): boolean {
    const id = typeof trackId === 'string' ? parseInt(trackId, 10) : trackId
    const status = trackIdToStatus.get(id)
    return status === 'pending' || status === 'downloading'
  }

  /**
   * Check if an album is already in the download queue (pending or downloading)
   * O(1) lookup using Map instead of O(n) array search
   * @param albumId - Deezer album ID
   * @returns true if album is already queued
   */
  function isAlbumInQueue(albumId: number | string): boolean {
    const id = typeof albumId === 'string' ? parseInt(albumId, 10) : albumId
    const status = albumIdToStatus.get(id)
    return status === 'pending' || status === 'downloading'
  }

  /**
   * Check if a playlist is already in the download queue (pending or downloading)
   * O(1) lookup using Map instead of O(n) array search
   * @param playlistId - Deezer playlist ID
   * @returns true if playlist is already queued
   */
  function isPlaylistInQueue(playlistId: number | string): boolean {
    const id = typeof playlistId === 'string' ? parseInt(playlistId, 10) : playlistId
    const status = playlistIdToStatus.get(id)
    return status === 'pending' || status === 'downloading'
  }

  /**
   * Get the download item for a track if it's in the queue
   * @param trackId - Deezer track ID
   * @returns DownloadItem or undefined
   */
  function getTrackDownload(trackId: number | string): DownloadItem | undefined {
    const id = typeof trackId === 'string' ? parseInt(trackId, 10) : trackId
    return downloads.value.find(d =>
      d.track?.id === id &&
      (d.status === 'pending' || d.status === 'downloading')
    )
  }

  /**
   * Get the download item for an album if it's in the queue
   * @param albumId - Deezer album ID
   * @returns DownloadItem or undefined
   */
  function getAlbumDownload(albumId: number | string): DownloadItem | undefined {
    const id = typeof albumId === 'string' ? parseInt(albumId, 10) : albumId
    return downloads.value.find(d =>
      d.type === 'album' &&
      d.album?.id === id &&
      (d.status === 'pending' || d.status === 'downloading')
    )
  }

  /**
   * Get the download item for a playlist if it's in the queue
   * @param playlistId - Deezer playlist ID
   * @returns DownloadItem or undefined
   */
  function getPlaylistDownload(playlistId: number | string): DownloadItem | undefined {
    const id = typeof playlistId === 'string' ? parseInt(playlistId, 10) : playlistId
    return downloads.value.find(d =>
      d.type === 'playlist' &&
      d.playlist?.id === id &&
      (d.status === 'pending' || d.status === 'downloading')
    )
  }

  // ============================================
  // COMPLETED DOWNLOAD DETECTION HELPERS
  // These check if items have already been downloaded
  // ============================================

  /**
   * Check if a track has already been downloaded (completed status)
   * O(1) lookup using Map instead of O(n) array search
   * @param trackId - Deezer track ID
   * @returns true if track was already downloaded
   */
  function isTrackCompleted(trackId: number | string): boolean {
    const id = typeof trackId === 'string' ? parseInt(trackId, 10) : trackId
    return trackIdToStatus.get(id) === 'completed'
  }

  /**
   * Check if an album has already been downloaded (completed status)
   * O(1) lookup using Map instead of O(n) array search
   * @param albumId - Deezer album ID
   * @returns true if album was already downloaded
   */
  function isAlbumCompleted(albumId: number | string): boolean {
    const id = typeof albumId === 'string' ? parseInt(albumId, 10) : albumId
    return albumIdToStatus.get(id) === 'completed'
  }

  /**
   * Check if a playlist has already been downloaded (completed status)
   * O(1) lookup using Map instead of O(n) array search
   * @param playlistId - Deezer playlist ID
   * @returns true if playlist was already downloaded
   */
  function isPlaylistCompleted(playlistId: number | string): boolean {
    const id = typeof playlistId === 'string' ? parseInt(playlistId, 10) : playlistId
    return playlistIdToStatus.get(id) === 'completed'
  }

  async function pauseQueue() {
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/queue/pause`, {
        method: 'POST'
      })
      if (response.ok) {
        const data = await response.json()
        isPaused.value = data.isPaused
        const toastStore = useToastStore()
        toastStore.info('Downloads paused')
      }
    } catch (e) {
      console.error('[DownloadStore] Failed to pause queue:', e)
    }
  }

  async function resumeQueue() {
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/queue/resume`, {
        method: 'POST'
      })
      if (response.ok) {
        const data = await response.json()
        isPaused.value = data.isPaused
        const toastStore = useToastStore()
        toastStore.info('Downloads resumed')
      }
    } catch (e) {
      console.error('[DownloadStore] Failed to resume queue:', e)
    }
  }

  async function fetchQueueStatus() {
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/queue/status`)
      if (response.ok) {
        const data = await response.json()
        isPaused.value = data.isPaused
      }
    } catch (e) {
      console.error('[DownloadStore] Failed to fetch queue status:', e)
    }
  }

  async function init() {
    if (window.electronAPI) {
      serverPort.value = await window.electronAPI.getServerPort()
    }
    // Load any persisted downloads from localStorage
    const saved = localStorage.getItem('downloads')
    if (saved) {
      try {
        downloads.value = JSON.parse(saved)
        // Any item still marked in-flight was interrupted by the app closing —
        // the download queue restarts empty, so nothing is actually running and
        // it would otherwise sit as a permanent "downloading" zombie with no way
        // to resume except deleting and re-adding the link (issue #81). Flip it
        // to `error` so the existing per-item retry control appears and
        // retryDownload()/retryFailedTracks() can re-run it (already-downloaded
        // files are skipped, so it effectively resumes). Refresh (retag) items
        // are skipped — retrying one routes through addAlbumDownload WITHOUT the
        // refresh flag, which would re-download instead of re-tag.
        let interrupted = 0
        const interruptedIds: string[] = []
        for (const d of downloads.value) {
          if ((d.status === 'downloading' || d.status === 'pending') && !d.refresh) {
            d.status = 'error'
            d.error = 'Interrupted — the app closed before this finished. Click retry to resume (already-downloaded tracks are skipped).'
            d.speed = 0
            interrupted++
            interruptedIds.push(d.id)
          }
        }
        // Remember these for opt-in auto-resume (#98). Auto-resume runs later,
        // after auth is restored (see resumeInterruptedDownloads), so a resume
        // can actually reach Deezer. If the setting is off they just stay as
        // one-click-retryable, exactly as before.
        interruptedDownloadIds.value = interruptedIds
        // Rebuild O(1) lookup Maps after loading
        rebuildLookupMaps()
        // Persist the corrected statuses so a second restart stays consistent.
        if (interrupted > 0) {
          console.log(`[DownloadStore] Marked ${interrupted} interrupted download(s) as retryable on startup`)
          saveDownloads()
        }
      } catch (e) {
        console.error('Failed to load downloads:', e)
      }
    }
    // Load download history
    const savedHistory = localStorage.getItem('downloadHistory')
    if (savedHistory) {
      try { downloadHistory.value = JSON.parse(savedHistory) } catch { }
    }
    // Sync settings to server
    await syncSettingsToServer()
    // Fetch initial queue status (pause state)
    await fetchQueueStatus()
  }

  function recordHistory(item: DownloadItem) {
    // A "Refresh tags" run is not a download — keep it out of history (and
    // therefore out of stats, which are derived from history). Single chokepoint
    // so no call site can accidentally log a refresh.
    if (item.refresh) return
    const entry: DownloadHistoryEntry = {
      id: item.id,
      title: item.title,
      artist: item.artist,
      type: item.type,
      quality: item.quality,
      actualFormat: item.actualFormat,
      substituted: item.substituted,
      substitutedTracks: item.substitutedTracks,
      path: item.path,
      status: item.status === 'completed' ? 'completed' : 'error',
      error: item.error,
      completedAt: new Date().toISOString(),
      totalTracks: item.totalTracks,
      failedTracks: item.failedTracks?.length
    }
    downloadHistory.value.unshift(entry)
    // Keep last 500 entries
    if (downloadHistory.value.length > 500) {
      downloadHistory.value = downloadHistory.value.slice(0, 500)
    }
    localStorage.setItem('downloadHistory', JSON.stringify(downloadHistory.value))
  }

  function clearHistory() {
    downloadHistory.value = []
    localStorage.removeItem('downloadHistory')
  }

  async function syncSettingsToServer() {
    const settingsStore = useSettingsStore()

    // Ensure settings are loaded before syncing — on Windows, userData reads
    // can be slower and the store may not be ready when downloads are triggered
    if (!settingsStore.isLoaded) {
      console.log('[DownloadStore] Settings not yet loaded, waiting...')
      await settingsStore.loadSettings()
    }

    try {
      const qualityMap: Record<string, string> = {
        '128': 'MP3_128',
        '320': 'MP3_320',
        'flac': 'FLAC'
      }

      console.log(`[DownloadStore] Syncing settings to server - quality: ${settingsStore.settings.quality}, downloadPath: ${settingsStore.settings.downloadPath}`)

      const settingsToSync: Record<string, any> = {
        quality: qualityMap[settingsStore.settings.quality] || 'MP3_320',
        maxConcurrentDownloads: settingsStore.settings.maxConcurrentDownloads,
        downloadPacing: settingsStore.settings.downloadPacing,
        overwriteFiles: settingsStore.settings.overwriteFiles,
        skipDuplicateTracks: settingsStore.settings.skipDuplicateTracks,
        bitrateFallback: settingsStore.settings.bitrateFallback,
        isrcFallback: settingsStore.settings.isrcFallback,
        createErrorLog: settingsStore.settings.createErrorLog,
        createPlaylistFile: settingsStore.settings.createPlaylistFile,
        clearQueueOnClose: settingsStore.settings.clearQueueOnClose,
        createPlaylistFolder: settingsStore.settings.createPlaylistFolder,
        createArtistFolder: settingsStore.settings.createArtistFolder,
        createAlbumFolder: settingsStore.settings.createAlbumFolder,
        createCDFolder: settingsStore.settings.createCDFolder,
        createPlaylistStructure: settingsStore.settings.createPlaylistStructure,
        createSinglesStructure: settingsStore.settings.createSinglesStructure,
        playlistFolderTemplate: settingsStore.settings.playlistFolderTemplate,
        albumFolderTemplate: settingsStore.settings.albumFolderTemplate,
        artistFolderTemplate: settingsStore.settings.artistFolderTemplate,
        trackNameTemplate: settingsStore.settings.trackNameTemplate,
        albumTrackTemplate: settingsStore.settings.albumTrackTemplate,
        playlistTrackTemplate: settingsStore.settings.playlistTrackTemplate,
        m3uNameTemplate: settingsStore.settings.m3uNameTemplate,
        saveArtwork: settingsStore.settings.saveArtwork,
        embedArtwork: settingsStore.settings.embedArtwork,
        saveLyrics: settingsStore.settings.saveLyrics,
        syncedLyrics: settingsStore.settings.syncedLyrics,
        tags: settingsStore.settings.tags,
        albumCovers: settingsStore.settings.albumCovers,
        savePlaylistAsCompilation: settingsStore.settings.savePlaylistAsCompilation,
        useNullSeparator: settingsStore.settings.useNullSeparator,
        saveID3v1: settingsStore.settings.saveID3v1,
        saveOnlyMainArtist: settingsStore.settings.saveOnlyMainArtist,
        keepVariousArtists: settingsStore.settings.keepVariousArtists,
        removeAlbumVersion: settingsStore.settings.removeAlbumVersion,
        removeArtistCombinations: settingsStore.settings.removeArtistCombinations,
        artistSeparator: settingsStore.settings.artistSeparator,
        dateFormatFlac: settingsStore.settings.dateFormatFlac,
        featuredArtistsHandling: settingsStore.settings.featuredArtistsHandling,
        titleCasing: settingsStore.settings.titleCasing,
        artistCasing: settingsStore.settings.artistCasing,
        previewVolume: settingsStore.settings.previewVolume
        // executeAfterDownload removed - security risk
      }

      if (settingsStore.settings.downloadPath) {
        settingsToSync.downloadPath = settingsStore.settings.downloadPath
      }

      const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSync)
      })

      if (!response.ok) {
        console.error(`[DownloadStore] Settings sync failed with status ${response.status}`)
      } else {
        console.log('[DownloadStore] Settings synced to server successfully')
      }
    } catch (e) {
      console.error('[DownloadStore] Failed to sync settings:', e)
    }
  }

  // Helper to safely extract artist name
  function extractArtistName(artist: any): string | undefined {
    if (!artist) return undefined
    if (typeof artist === 'string') return artist
    if (artist !== null && typeof artist === 'object' && 'name' in artist) {
      return artist.name
    }
    return undefined
  }

  // Helper to safely extract cover URL
  function extractCoverUrl(item: any, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = item[key]
      if (value && typeof value === 'string') return value
    }
    return undefined
  }

  async function addDownload(track: Track, { skipSync = false, playlistName = '' } = {}) {
    const toastStore = useToastStore()

    // Check if already downloaded (completed)
    if (isTrackCompleted(track.id)) {
      toastStore.info(`"${track.title}" was already downloaded`)
      console.log(`[DownloadStore] Track ${track.id} already completed, skipping`)
      return // Early return - already downloaded
    }

    // Check for duplicate - prevent adding track already in queue
    if (isTrackInQueue(track.id)) {
      toastStore.info(`"${track.title}" is already downloading`)
      console.log(`[DownloadStore] Track ${track.id} already in queue, skipping`)
      return // Early return - don't add duplicate
    }

    if (!skipSync) await syncSettingsToServer()
    const settingsStore = useSettingsStore()

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const item: DownloadItem = {
      id: tempId,
      track,
      title: track.title,
      artist: extractArtistName(track.artist),
      cover: extractCoverUrl(track.album || {}, 'cover_medium', 'cover_big', 'cover_small', 'cover') || (typeof track.cover === 'string' ? track.cover : undefined),
      progress: 0,
      status: 'pending',
      type: 'track',
      addedAt: new Date().toISOString(),
      quality: settingsStore.settings.quality
    }

    downloads.value = [item, ...downloads.value]
    // Update O(1) lookup Map immediately
    if (track.id) {
      trackIdToStatus.set(track.id, 'pending')
    }
    saveDownloads()

    try {
      // Qobuz-sourced search results route to the Qobuz download endpoint (which
      // returns { downloadId }); Deezer uses /api/download (returns { id }).
      const isQobuz = (track as any).source === 'qobuz'
      const requestBody: Record<string, any> = { trackId: isQobuz ? ((track as any).qobuzId ?? track.id) : track.id }
      if (playlistName && !isQobuz) requestBody.playlistName = playlistName
      const endpoint = isQobuz ? '/api/qobuz/download' : '/api/download'
      const response = await fetch(`http://127.0.0.1:${serverPort.value}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error || 'Download request failed'

        // Handle session expiration - trigger auth store to handle re-login
        if (response.status === 401 || errorMsg.toLowerCase().includes('session expired')) {
          const toastStore = useToastStore()
          toastStore.error('Session expired. Please log in again to download.')
          throw new Error('Session expired: Please log in again')
        }

        throw new Error(errorMsg)
      }

      const data = await response.json()
      const dlId = data.id || data.downloadId
      if (dlId) {
        item.id = dlId
        saveDownloads()
        registerForPolling(dlId, [dlId], 'track')
      } else {
        throw new Error('Server did not return a download ID')
      }
    } catch (error: any) {
      console.error('[DownloadStore] Download error:', error.message)
      updateDownloadStatus(tempId, 'error', error.message || String(error))
    }
  }

  async function addAlbumDownload(album: Album, tracks: Track[], refreshTags = false) {
    const toastStore = useToastStore()

    // Qobuz-sourced album/playlist → grouped Qobuz download path.
    if ((album as any).source === 'qobuz') {
      const qType = (album as any).qobuzType === 'playlist' ? 'playlist' : 'album'
      await addQobuzAlbumDownload({ type: qType, id: String((album as any).qobuzId ?? album.id), data: (album as any).qobuzData || album })
      return
    }

    // Check if already downloaded (completed). Refresh-tags intentionally
    // re-processes existing files, so it bypasses this guard.
    if (!refreshTags && isAlbumCompleted(album.id)) {
      toastStore.info(`"${album.title}" was already downloaded`)
      console.log(`[DownloadStore] Album ${album.id} already completed, skipping`)
      return // Early return - already downloaded
    }

    // Check for duplicate - prevent adding album already in queue
    if (isAlbumInQueue(album.id)) {
      toastStore.info(`"${album.title}" is already downloading`)
      console.log(`[DownloadStore] Album ${album.id} already in queue, skipping`)
      return // Early return - don't add duplicate
    }

    // Check if album folder already exists on disk
    try {
      const checkResponse = await fetch(`http://127.0.0.1:${serverPort.value}/api/album/check?id=${album.id}`)
      const checkData = await checkResponse.json()
      if (checkData.exists && checkData.trackCount > 0) {
        toastStore.info(`"${album.title}" already exists on disk (${checkData.trackCount}/${checkData.albumTracks} tracks) — downloading anyway`)
      }
    } catch { /* ignore check failures — don't block download */ }

    await syncSettingsToServer()
    const settingsStore = useSettingsStore()

    const albumId = `album_${album.id}_${Date.now()}`

    const item: DownloadItem = {
      id: albumId,
      album,
      title: album.title,
      artist: extractArtistName(album.artist),
      cover: extractCoverUrl(album, 'cover_medium', 'cover_big', 'cover_small', 'cover_xl', 'cover'),
      progress: 0,
      status: 'pending',
      type: 'album',
      addedAt: new Date().toISOString(),
      quality: settingsStore.settings.quality,
      totalTracks: tracks.length,
      completedTracks: 0,
      failedTracks: [],
      trackIds: [],
      refresh: refreshTags
    }

    downloads.value = [item, ...downloads.value]
    // Update O(1) lookup Map immediately — but a refresh must NOT touch the
    // album's downloaded-status (it's a tag operation, not a download).
    if (album.id && !refreshTags) {
      albumIdToStatus.set(album.id, 'pending')
    }
    saveDownloads()

    try {
      const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/download/album`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId: album.id, refreshTags })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error || 'Album download request failed'

        // Handle session expiration - trigger auth store to handle re-login
        if (response.status === 401 || errorMsg.toLowerCase().includes('session expired')) {
          const toastStore = useToastStore()
          toastStore.error('Session expired. Please log in again to download.')
          throw new Error('Session expired: Please log in again')
        }

        throw new Error(errorMsg)
      }

      const data = await response.json()
      if (data.ids && data.ids.length > 0) {
        console.log(`[DownloadStore] Album ${item.title}: received ${data.ids.length} IDs from server:`, data.ids.slice(0, 3), '...')
        item.trackIds = data.ids
        // Update totalTracks to match actual download count (may differ from UI track list)
        if (item.totalTracks !== data.ids.length) {
          console.log(`[DownloadStore] Updating totalTracks from ${item.totalTracks} to ${data.ids.length}`)
          item.totalTracks = data.ids.length
        }
        item.status = 'downloading'
        saveDownloads()
        registerForPolling(albumId, data.ids, 'album')
      } else {
        throw new Error('Server did not return download IDs')
      }
    } catch (error: any) {
      console.error('[DownloadStore] Album download error:', error.message)
      updateDownloadStatus(albumId, 'error', error.message || String(error))
    }
  }

  /**
   * Qobuz album/playlist download — creates ONE grouped parent row (like the
   * Deezer album path) whose children are the enqueued Qobuz tracks, so the
   * Transfer Rack shows a single aggregated album unit instead of N track rows.
   * `qobuz` is the analyze result: { type, id, data }.
   */
  async function addQobuzAlbumDownload(qobuz: { type: string; id: string; data: any }) {
    await syncSettingsToServer()
    const settingsStore = useSettingsStore()
    const d = qobuz.data || {}
    const groupId = `qobuzalbum_${qobuz.id}_${Date.now()}`
    const trackTotal = d.tracks?.items?.length || d.tracks_count || 0

    const item: DownloadItem = {
      id: groupId,
      album: { id: qobuz.id, title: d.title, artist: { name: d.artist?.name } } as any,
      title: d.title || 'Qobuz Album',
      artist: d.artist?.name || (qobuz.type === 'playlist' ? (d.owner?.name || 'Playlist') : 'Unknown Artist'),
      cover: d.image?.large || d.image?.small || d.images?.[0] || '',
      progress: 0,
      status: 'pending',
      type: 'album',
      addedAt: new Date().toISOString(),
      quality: settingsStore.settings.quality,
      totalTracks: trackTotal,
      completedTracks: 0,
      failedTracks: [],
      trackIds: [],
    }
    downloads.value = [item, ...downloads.value]
    saveDownloads()

    try {
      const body = qobuz.type === 'playlist' ? { playlistId: qobuz.id } : { albumId: qobuz.id }
      const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/qobuz/download-album`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Qobuz album download request failed')
      }
      const data = await response.json()
      if (data.ids && data.ids.length > 0) {
        item.trackIds = data.ids
        item.totalTracks = data.ids.length
        item.status = 'downloading'
        saveDownloads()
        registerForPolling(groupId, data.ids, 'album')
      } else {
        throw new Error('Server did not return download IDs')
      }
    } catch (error: any) {
      console.error('[DownloadStore] Qobuz album download error:', error.message)
      updateDownloadStatus(groupId, 'error', error.message || String(error))
    }
  }

  async function addPlaylistDownload(playlist: Playlist, tracks: Track[], refreshTags = false) {
    const toastStore = useToastStore()

    // Qobuz-sourced playlist → grouped Qobuz download path.
    if ((playlist as any).source === 'qobuz') {
      await addQobuzAlbumDownload({ type: 'playlist', id: String((playlist as any).qobuzId ?? playlist.id), data: playlist })
      return
    }

    // Check if already downloaded (completed). Refresh-tags re-processes
    // existing files on purpose, so it bypasses this guard.
    if (!refreshTags && isPlaylistCompleted(playlist.id)) {
      toastStore.info(`"${playlist.title}" was already downloaded`)
      console.log(`[DownloadStore] Playlist ${playlist.id} already completed, skipping`)
      return // Early return - already downloaded
    }

    // Check for duplicate - prevent adding playlist already in queue
    if (isPlaylistInQueue(playlist.id)) {
      toastStore.info(`"${playlist.title}" is already downloading`)
      console.log(`[DownloadStore] Playlist ${playlist.id} already in queue, skipping`)
      return // Early return - don't add duplicate
    }

    await syncSettingsToServer()
    const settingsStore = useSettingsStore()

    const playlistId = `playlist_${playlist.id}_${Date.now()}`

    const item: DownloadItem = {
      id: playlistId,
      playlist,
      title: playlist.title,
      artist: extractArtistName(playlist.creator),
      cover: extractCoverUrl(playlist, 'picture_medium', 'picture_big', 'picture_small', 'picture_xl', 'picture'),
      progress: 0,
      status: 'pending',
      type: 'playlist',
      addedAt: new Date().toISOString(),
      quality: settingsStore.settings.quality,
      totalTracks: tracks.length,
      completedTracks: 0,
      failedTracks: [],
      trackIds: [],
      refresh: refreshTags
    }

    downloads.value = [item, ...downloads.value]
    // Update O(1) lookup Map immediately — refresh must not touch downloaded-status.
    if (playlist.id && !refreshTags) {
      playlistIdToStatus.set(playlist.id, 'pending')
    }
    saveDownloads()

    try {
      const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/download/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId: playlist.id, refreshTags })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error || 'Playlist download request failed'

        // Handle session expiration - trigger auth store to handle re-login
        if (response.status === 401 || errorMsg.toLowerCase().includes('session expired')) {
          const toastStore = useToastStore()
          toastStore.error('Session expired. Please log in again to download.')
          throw new Error('Session expired: Please log in again')
        }

        throw new Error(errorMsg)
      }

      const data = await response.json()
      if (data.ids && data.ids.length > 0) {
        console.log(`[DownloadStore] Playlist ${item.title}: received ${data.ids.length} IDs from server`)
        item.trackIds = data.ids
        // Update totalTracks to match actual download count (may differ from UI track list)
        if (item.totalTracks !== data.ids.length) {
          console.log(`[DownloadStore] Updating totalTracks from ${item.totalTracks} to ${data.ids.length}`)
          item.totalTracks = data.ids.length
        }
        item.status = 'downloading'
        saveDownloads()
        registerForPolling(playlistId, data.ids, 'album')
      } else {
        throw new Error('Server did not return download IDs')
      }
    } catch (error: any) {
      console.error('[DownloadStore] Playlist download error:', error.message)
      updateDownloadStatus(playlistId, 'error', error.message || String(error))
    }
  }

  /**
   * Batch download — sends all track IDs in a single request to
   * /api/download/batch and tracks them as one playlist-like item.
   * Used by the Link Analyzer for converted Spotify playlists.
   */
  async function addBatchDownload(config: {
    trackIds: number[]
    playlistName: string
    title: string
    cover?: string
    totalTracks: number
  }) {
    await syncSettingsToServer()
    const settingsStore = useSettingsStore()
    const toastStore = useToastStore()

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const item: DownloadItem = {
      id: batchId,
      title: config.title,
      cover: config.cover,
      progress: 0,
      status: 'pending',
      type: 'playlist',
      addedAt: new Date().toISOString(),
      quality: settingsStore.settings.quality,
      totalTracks: config.totalTracks,
      completedTracks: 0,
      failedTracks: [],
      trackIds: [],
      batchConfig: {
        trackIds: config.trackIds,
        playlistName: config.playlistName,
        cover: config.cover
      }
    }

    downloads.value = [item, ...downloads.value]
    saveDownloads()

    try {
      const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/download/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackIds: config.trackIds,
          playlistName: config.playlistName,
          playlistCoverUrl: config.cover
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error || 'Batch download request failed'

        if (response.status === 401 || errorMsg.toLowerCase().includes('session expired')) {
          toastStore.error('Session expired. Please log in again to download.')
          throw new Error('Session expired: Please log in again')
        }

        throw new Error(errorMsg)
      }

      const data = await response.json()
      if (data.ids && data.ids.length > 0) {
        console.log(`[DownloadStore] Batch "${config.title}": received ${data.ids.length} IDs from server`)
        item.trackIds = data.ids
        if (item.totalTracks !== data.ids.length) {
          item.totalTracks = data.ids.length
        }
        item.status = 'downloading'
        saveDownloads()
        registerForPolling(batchId, data.ids, 'album')
      } else {
        throw new Error('Server did not return download IDs')
      }
    } catch (error: any) {
      console.error('[DownloadStore] Batch download error:', error.message)
      updateDownloadStatus(batchId, 'error', error.message || String(error))
    }
  }

  // Register a download group for unified polling
  function registerForPolling(groupId: string, trackIds: string[], type: 'track' | 'album') {
    pollingGroups.set(groupId, { trackIds, type })
    startUnifiedPolling()
  }

  // Unregister from polling when complete
  function unregisterFromPolling(groupId: string) {
    pollingGroups.delete(groupId)
    if (pollingGroups.size === 0) {
      stopUnifiedPolling()
    }
  }

  // Start the unified polling loop (single interval for ALL downloads)
  // Uses adaptive intervals based on queue size for better performance
  function startUnifiedPolling() {
    if (unifiedPollingInterval) return // Already running

    // Get optimal interval based on current queue size
    currentPollingInterval = getOptimalPollingInterval()

    const pollOnce = async () => {
      if (pollingGroups.size === 0) {
        stopUnifiedPolling()
        return
      }

      try {
        // Single API call for all downloads
        const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/queue`)
        const data = await response.json()
        const queue = data.queue || []

        // Build O(1) lookup map from queue — avoids O(n) find() per track
        const queueMap = new Map<string, any>()
        for (const q of queue) {
          queueMap.set(q.id, q)
        }

        // Build O(1) lookup map from downloads for this poll cycle
        const downloadMap = new Map<string, DownloadItem>()
        for (const d of downloads.value) {
          downloadMap.set(d.id, d)
        }

        let hasChanges = false
        const groupsToRemove: string[] = []

        // Process all polling groups with the single response
        for (const [groupId, { trackIds, type }] of pollingGroups) {
          const item = downloadMap.get(groupId)
          if (!item || item.status === 'completed' || item.status === 'error') {
            groupsToRemove.push(groupId)
            continue
          }

          if (type === 'track') {
            const serverItem = queueMap.get(groupId)
            if (serverItem) {
              const changed = updateTrackProgress(item, serverItem)
              hasChanges = hasChanges || changed
              if ((item.status as string) === 'completed' || (item.status as string) === 'error') {
                groupsToRemove.push(groupId)
              }
            }
          } else {
            // Album/playlist polling
            const changed = updateAlbumProgress(item, trackIds, queueMap)
            hasChanges = hasChanges || changed
            if ((item.status as string) === 'completed' || (item.status as string) === 'error') {
              groupsToRemove.push(groupId)
            }
          }
        }

        // Remove completed groups
        groupsToRemove.forEach(id => pollingGroups.delete(id))

        // Rebuild lookup Maps if any changes occurred (batched update)
        if (hasChanges) {
          rebuildLookupMaps()
          saveDownloads()
        }

        // Check if we need to adjust polling interval
        const optimalInterval = getOptimalPollingInterval()
        if (optimalInterval !== currentPollingInterval && pollingGroups.size > 0) {
          currentPollingInterval = optimalInterval
          // Restart with new interval
          stopUnifiedPolling()
          startUnifiedPolling()
          return
        }

        // Stop polling if no more active groups
        if (pollingGroups.size === 0) {
          stopUnifiedPolling()
        }
      } catch (error) {
        console.error('[DownloadStore] Polling error:', error)
      }
    }

    unifiedPollingInterval = setInterval(pollOnce, currentPollingInterval)
  }

  function stopUnifiedPolling() {
    if (unifiedPollingInterval) {
      clearInterval(unifiedPollingInterval)
      unifiedPollingInterval = null
    }
  }

  // Update track progress - returns true if anything changed
  function updateTrackProgress(item: DownloadItem, serverItem: any): boolean {
    let changed = false

    if (item.progress !== serverItem.progress) {
      item.progress = serverItem.progress
      changed = true
    }
    if (item.status !== serverItem.status) {
      const previousStatus = item.status
      item.status = serverItem.status
      changed = true

      // Clear speed on completion/error
      if (serverItem.status === 'completed' || serverItem.status === 'error') {
        item.speed = 0
      }

      // Show toast for single track completion (only if status actually changed)
      if (previousStatus !== 'completed' && previousStatus !== 'error') {
        const toastStore = useToastStore()
        if (serverItem.status === 'completed') {
          toastStore.success(item.refresh ? `Refreshed tags for "${item.title}"` : `Downloaded "${item.title}"`)
          recordHistory(item)
        } else if (serverItem.status === 'error') {
          toastStore.error(item.refresh ? `Tag refresh failed: "${item.title}"` : `Download failed: "${item.title}"`)
          recordHistory(item)
        }
      }
    }
    if (serverItem.error && item.error !== serverItem.error) {
      item.error = serverItem.error
      changed = true
    }
    if (serverItem.errorDetails && item.errorDetails !== serverItem.errorDetails) {
      item.errorDetails = serverItem.errorDetails
      changed = true
    }
    // Capture download speed and bytes (if server provides them)
    if (typeof serverItem.speed === 'number' && item.speed !== serverItem.speed) {
      item.speed = serverItem.speed
      changed = true
    }
    if (typeof serverItem.bytesDownloaded === 'number' && item.bytesDownloaded !== serverItem.bytesDownloaded) {
      item.bytesDownloaded = serverItem.bytesDownloaded
      changed = true
    }
    if (typeof serverItem.totalBytes === 'number' && item.totalBytes !== serverItem.totalBytes) {
      item.totalBytes = serverItem.totalBytes
      changed = true
    }
    // For deletion, prefer albumRootFolder (folder path) over path (file path)
    // This ensures we delete the containing folder, not just the file
    const folderPath = serverItem.albumRootFolder || serverItem.albumFolder
    if (folderPath && item.path !== folderPath) {
      item.path = folderPath
      changed = true
    } else if (serverItem.path && !item.path) {
      // Fallback: derive folder from file path
      const pathParts = serverItem.path.split(/[/\\]/)
      pathParts.pop()
      item.path = pathParts.join('/')
      changed = true
    }
    // Capture actual format (may differ from requested quality due to fallback)
    if (serverItem.actualFormat && item.actualFormat !== serverItem.actualFormat) {
      item.actualFormat = serverItem.actualFormat
      changed = true
    }
    // Capture substitution flag (exact track unavailable; alternate release downloaded)
    if (serverItem.substituted && !item.substituted) {
      item.substituted = true
      item.substitutedTracks = [{
        id: item.id,
        trackId: serverItem.trackId,
        title: serverItem.trackTitle || item.title,
        artist: serverItem.trackArtist || item.artist
      }]
      changed = true
    }

    return changed
  }

  // Update album/playlist progress - returns true if anything changed
  function updateAlbumProgress(item: DownloadItem, trackIds: string[], queueMap: Map<string, any>): boolean {
    let changed = false
    let completedCount = 0
    let errorCount = 0
    const failedTracks: FailedTrack[] = []
    let albumFolderPath: string | null = null
    let playlistFolderPath: string | null = null
    let actualFormat: string | null = null
    let anySubstituted = false
    let speedSum = 0
    const substitutedTracks: SubstitutedTrack[] = []

    for (const trackId of trackIds) {
      const serverItem = queueMap.get(trackId)
      if (serverItem) {
        // Capture playlist folder path for deletion of entire playlist directory
        if (!playlistFolderPath && serverItem.playlistFolder) {
          playlistFolderPath = serverItem.playlistFolder
        }
        // Capture album folder path for deletion
        // Prefer albumRootFolder (excludes CD subfolders) for proper recursive deletion
        if (!albumFolderPath) {
          if (serverItem.albumRootFolder) {
            albumFolderPath = serverItem.albumRootFolder
          } else if (serverItem.albumFolder) {
            albumFolderPath = serverItem.albumFolder
          } else if (serverItem.path && serverItem.status === 'completed') {
            const pathParts = serverItem.path.split(/[/\\]/)
            pathParts.pop()
            albumFolderPath = pathParts.join('/')
          }
        }
        // Capture actual format from first track that has it
        if (!actualFormat && serverItem.actualFormat) {
          actualFormat = serverItem.actualFormat
        }
        // Flag the whole album/playlist row if any track was an alternate release,
        // and remember WHICH track so the badge can list them (drill-down).
        if (serverItem.substituted) {
          anySubstituted = true
          substitutedTracks.push({
            id: trackId,
            trackId: serverItem.trackId || trackId,
            title: serverItem.trackTitle || serverItem.title || 'Unknown Track',
            artist: serverItem.trackArtist || serverItem.artist
          })
        }

        // Aggregate live throughput of in-flight tracks so the group row (and
        // the sidebar/title-bar meters that sum activeDownloads speeds) shows
        // real numbers during album/playlist downloads instead of 0.
        if (serverItem.status === 'downloading' && typeof serverItem.speed === 'number') {
          speedSum += serverItem.speed
        }

        // Count tracks as "complete" if they've finished downloading
        // This includes 'completed', 'decrypting', and 'tagging' statuses
        // since the download phase is done and the track will complete shortly
        const isTrackDone = serverItem.status === 'completed' ||
                           serverItem.status === 'decrypting' ||
                           serverItem.status === 'tagging'

        if (isTrackDone) {
          completedCount++
        } else if (serverItem.status === 'error') {
          errorCount++
          failedTracks.push({
            id: trackId,
            trackId: serverItem.trackId || trackId,
            title: serverItem.trackTitle || serverItem.title || 'Unknown Track',
            artist: serverItem.trackArtist || serverItem.artist,
            albumTitle: serverItem.albumTitle,
            error: serverItem.error || 'Download failed',
            errorDetails: serverItem.errorDetails
          })
        }
      }
    }

    // Progress bar = fraction of tracks finished, normalized over the ORIGINAL
    // total (so it agrees with the "X/Y" track count shown next to it). We
    // deliberately do NOT byte-weight in-flight tracks: with the concurrency
    // gate running several tracks at once, byte progress races ahead of the
    // completed count and the bar would read e.g. 59% next to "1/10" (issue:
    // progress bar mismatch). previouslyCompletedTracks keeps retried albums
    // (trackIds shrinks to just the retry set) consistent with their fraction.
    const originalTotal = item.originalTotalTracks || item.totalTracks || trackIds.length || 1
    const doneCount = (item.previouslyCompletedTracks || 0) + completedCount
    const newProgress = Math.min(100, Math.round((doneCount / originalTotal) * 100))
    if (item.progress !== newProgress) {
      item.progress = newProgress
      changed = true
    }

    if (item.completedTracks !== completedCount) {
      item.completedTracks = completedCount
      changed = true
    }

    // Only update failedTracks if the count changed (avoid deep comparison)
    if ((item.failedTracks?.length || 0) !== failedTracks.length) {
      item.failedTracks = failedTracks
      changed = true
    }

    // For playlists, prefer the playlist root folder for deletion (deletes entire playlist directory)
    // For albums, use the album root folder
    const deletePath = (item.type === 'playlist' && playlistFolderPath) ? playlistFolderPath : albumFolderPath
    if (deletePath && !item.path) {
      item.path = deletePath
      changed = true
    }

    // Update actual format (may differ from requested due to fallback)
    if (actualFormat && item.actualFormat !== actualFormat) {
      item.actualFormat = actualFormat
      changed = true
    }

    // Surface if any track fell back to an alternate release
    if (anySubstituted && !item.substituted) {
      item.substituted = true
      changed = true
    }
    if ((item.substitutedTracks?.length || 0) !== substitutedTracks.length) {
      item.substitutedTracks = substitutedTracks
      changed = true
    }

    // Publish the aggregated throughput (0 once nothing is in flight)
    if ((item.speed || 0) !== speedSum) {
      item.speed = speedSum
      changed = true
    }

    const processedCount = completedCount + errorCount
    if (processedCount >= trackIds.length) {
      const newStatus = errorCount > 0 ? 'error' : 'completed'
      if (item.status !== newStatus) {
        item.status = newStatus
        if (errorCount > 0) {
          item.error = `${errorCount} of ${trackIds.length} tracks failed`
        }
        changed = true

        // Show toast notification and record history
        const toastStore = useToastStore()
        if (item.refresh) {
          if (newStatus === 'completed') {
            toastStore.success(`Refreshed tags for "${item.title}"`)
          } else if (errorCount === trackIds.length) {
            toastStore.error(`Tag refresh failed: "${item.title}"`)
          } else {
            toastStore.warning(`Refreshed tags for "${item.title}" (${errorCount} track${errorCount > 1 ? 's' : ''} skipped)`)
          }
        } else if (newStatus === 'completed') {
          toastStore.success(`Downloaded "${item.title}"`)
        } else if (errorCount === trackIds.length) {
          toastStore.error(`Download failed: "${item.title}"`)
        } else {
          toastStore.warning(`Downloaded "${item.title}" with ${errorCount} failed track${errorCount > 1 ? 's' : ''}`)
        }
        recordHistory(item) // no-ops for refresh items
      }
    }

    return changed
  }

  function updateDownloadStatus(id: string, status: DownloadStatus, error?: string) {
    const item = downloads.value.find(d => d.id === id)
    if (item) {
      item.status = status
      if (error) item.error = error
      // Update O(1) lookup Maps — refresh items never affect downloaded-status.
      if (!item.refresh) {
        if (item.track?.id) {
          trackIdToStatus.set(item.track.id, status)
        }
        if (item.type === 'album' && item.album?.id) {
          albumIdToStatus.set(item.album.id, status)
        }
        if (item.type === 'playlist' && item.playlist?.id) {
          playlistIdToStatus.set(item.playlist.id, status)
        }
      }
      saveDownloads()
    }
  }

  function cancelDownload(id: string) {
    const index = downloads.value.findIndex(d => d.id === id)
    if (index !== -1) {
      downloads.value = downloads.value.filter(d => d.id !== id)
      // Rebuild Maps after removal
      rebuildLookupMaps()
      saveDownloads()
    }
    unregisterFromPolling(id)
  }

  async function deleteDownload(id: string, deleteFiles: boolean = false) {
    const item = downloads.value.find(d => d.id === id)
    if (!item) return

    if (deleteFiles && item.path && window.electronAPI) {
      try {
        await window.electronAPI.deletePath(item.path)
      } catch (error) {
        console.error('[DownloadStore] Failed to delete files:', error)
      }
    }

    cancelDownload(id)
  }

  async function retryDownload(id: string) {
    const item = downloads.value.find(d => d.id === id)
    if (!item || item.status !== 'error') return

    const toastStore = useToastStore()

    // Remove the failed item first
    downloads.value = downloads.value.filter(d => d.id !== id)
    // Rebuild Maps after removal
    rebuildLookupMaps()
    saveDownloads()

    // Re-add based on type
    if (item.type === 'track' && item.track) {
      toastStore.info(`Retrying "${item.title}"...`)
      await addDownload(item.track)
    } else if (item.type === 'album' && item.album) {
      toastStore.info(`Retrying album "${item.title}"...`)
      // Fetch fresh track list for the album using correct endpoint
      try {
        const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/album?id=${item.album.id}`)
        const data = await response.json()
        if (data.error) {
          throw new Error(data.error)
        }
        await addAlbumDownload(item.album, data.tracks || [])
      } catch (e) {
        console.error('[DownloadStore] Failed to retry album:', e)
        toastStore.error(`Failed to retry "${item.title}"`)
      }
    } else if (item.type === 'playlist' && item.batchConfig) {
      // Batch download (converted Spotify playlist from Link Analyzer)
      toastStore.info(`Retrying "${item.title}"...`)
      await addBatchDownload({
        trackIds: item.batchConfig.trackIds,
        playlistName: item.batchConfig.playlistName,
        title: item.title,
        cover: item.batchConfig.cover,
        totalTracks: item.batchConfig.trackIds.length
      })
    } else if (item.type === 'playlist' && item.playlist) {
      toastStore.info(`Retrying playlist "${item.title}"...`)
      // Fetch fresh track list for the playlist using correct endpoint
      try {
        const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/playlist?id=${item.playlist.id}`)
        const data = await response.json()
        if (data.error) {
          throw new Error(data.error)
        }
        await addPlaylistDownload(item.playlist, data.tracks || [])
      } catch (e) {
        console.error('[DownloadStore] Failed to retry playlist:', e)
        toastStore.error(`Failed to retry "${item.title}"`)
      }
    }
  }

  async function retryFailedTracks(id: string) {
    const item = downloads.value.find(d => d.id === id)
    if (!item || !item.failedTracks || item.failedTracks.length === 0) return

    const toastStore = useToastStore()
    const failedCount = item.failedTracks.length
    toastStore.info(`Retrying ${failedCount} failed track${failedCount > 1 ? 's' : ''} from "${item.title}"...`)

    await syncSettingsToServer()

    // Preserve the parent item's album/playlist context so retried tracks return to
    // their ORIGINAL folder instead of the root download folder (#94). Without this
    // the server treats the retried track as a standalone single. Album items send
    // albumId (server rebuilds the authoritative album context); playlist items send
    // playlistName (server recreates the playlist folder).
    const retryContext: Record<string, unknown> = {}
    if (item.type === 'album' && item.album?.id) {
      retryContext.albumId = item.album.id
    } else if (item.type === 'playlist') {
      const playlistName = item.batchConfig?.playlistName || item.playlist?.title
      if (playlistName) retryContext.playlistName = playlistName
    }

    // Queue each failed track on the server and collect the new download IDs.
    // These IDs are appended to the parent item's trackIds so the polling
    // system tracks them under the original album/playlist — no separate entries.
    const newTrackIds: string[] = []
    for (const failed of item.failedTracks) {
      const trackId = failed.trackId || failed.id
      if (!trackId) continue
      try {
        const response = await fetch(`http://127.0.0.1:${serverPort.value}/api/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId, ...retryContext })
        })
        if (!response.ok) continue
        const data = await response.json()
        if (data.id) {
          newTrackIds.push(data.id)
        }
      } catch (e) {
        console.error(`[DownloadStore] Failed to retry track ${trackId}:`, e)
      }
    }

    if (newTrackIds.length > 0) {
      // Replace trackIds with ONLY the new retry IDs — old IDs may no longer
      // exist in the server's download queue, which would prevent completion.
      // Preserve the original album context so the UI can still show "28/29".
      item.previouslyCompletedTracks = (item.previouslyCompletedTracks || 0) + (item.completedTracks || 0)
      item.originalTotalTracks = item.originalTotalTracks || item.totalTracks
      item.trackIds = newTrackIds
      item.totalTracks = newTrackIds.length
      item.completedTracks = 0
      item.progress = 0
      item.failedTracks = []
      item.error = undefined
      item.status = 'downloading'
      saveDownloads()
      registerForPolling(item.id, newTrackIds, 'album')
      toastStore.success(`Retrying ${newTrackIds.length} track${newTrackIds.length > 1 ? 's' : ''}`)
    } else {
      toastStore.error('Failed to retry any tracks')
    }
  }

  function clearCompleted() {
    downloads.value = downloads.value.filter(d => d.status !== 'completed')
    // Rebuild Maps after removal
    rebuildLookupMaps()
    saveDownloads()
  }

  function clearAll() {
    downloads.value = []
    pollingGroups.clear()
    stopUnifiedPolling()
    // Clear all lookup Maps
    trackIdToStatus.clear()
    albumIdToStatus.clear()
    playlistIdToStatus.clear()
    isPaused.value = false
    saveDownloads()

    // Reset server-side queue state to ensure new downloads can start
    fetch(`http://127.0.0.1:${serverPort.value}/api/queue/clear`, { method: 'POST' })
      .catch(e => console.error('[DownloadStore] Failed to clear server queue:', e))
  }

  // Reorder a download item in the queue
  function reorderDownload(draggedId: string, targetId: string, position: 'before' | 'after') {
    const draggedIndex = downloads.value.findIndex(d => d.id === draggedId)
    const targetIndex = downloads.value.findIndex(d => d.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    // Remove the dragged item
    const [draggedItem] = downloads.value.splice(draggedIndex, 1)

    // Calculate the new index (adjust if we removed from before the target)
    let newIndex = targetIndex
    if (draggedIndex < targetIndex) {
      newIndex-- // Adjust for the removed item
    }
    if (position === 'after') {
      newIndex++
    }

    // Insert at the new position
    downloads.value.splice(newIndex, 0, draggedItem)
    saveDownloads()
    // Make the reorder real: push the new order to the backend queue so the actual
    // download order matches the list (not just the view). Issue #88 follow-up.
    syncQueueOrder()
  }

  // Push the current visual order of still-queued items to the backend, so dragging
  // a download actually reprioritizes it. Flattens album/playlist rows into their
  // track download IDs (same id model the "Download next" button uses).
  function syncQueueOrder() {
    const ids: string[] = []
    for (const d of downloads.value) {
      if (d.status !== 'pending' && d.status !== 'downloading') continue
      if (Array.isArray(d.trackIds) && d.trackIds.length) ids.push(...d.trackIds.map(String))
      else ids.push(String(d.id))
    }
    if (!ids.length) return
    fetch(`http://127.0.0.1:${serverPort.value}/api/queue/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    }).catch(() => { /* best-effort; view order already updated */ })
  }

  // Debounced save with requestIdleCallback for better performance
  function saveDownloads() {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
    }

    saveDebounceTimer = setTimeout(() => {
      // Use requestIdleCallback if available for non-blocking save
      if ('requestIdleCallback' in window) {
        if (idleCallbackId) {
          cancelIdleCallback(idleCallbackId)
        }
        idleCallbackId = requestIdleCallback(() => {
          localStorage.setItem('downloads', JSON.stringify(downloads.value))
          idleCallbackId = null
        }, { timeout: 2000 })
      } else {
        localStorage.setItem('downloads', JSON.stringify(downloads.value))
      }
    }, 1000) // Increased debounce to 1 second
  }

  function saveDownloadsImmediate() {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
    }
    if (idleCallbackId) {
      cancelIdleCallback(idleCallbackId)
    }
    localStorage.setItem('downloads', JSON.stringify(downloads.value))
  }

  /**
   * Check if an error message indicates a session-related issue
   * This helps the UI display more helpful guidance to the user
   */
  function isSessionError(error?: string): boolean {
    if (!error) return false
    const lowerError = error.toLowerCase()
    return (
      lowerError.includes('session expired') ||
      lowerError.includes('session invalid') ||
      lowerError.includes('please log in') ||
      lowerError.includes('authentication') ||
      lowerError.includes('unauthorized') ||
      lowerError.includes('401') ||
      lowerError.includes('login required')
    )
  }

  // Opt-in auto-resume of downloads interrupted by the app closing (#98).
  // Called from App.vue AFTER auth is restored — a resume re-queues through the
  // normal add* paths (server skips already-downloaded tracks), which actually
  // hit Deezer, so it must not run before login. Reuses the battle-tested
  // retryDownload path; only touches items flagged interrupted on this startup.
  async function resumeInterruptedDownloads() {
    const settingsStore = useSettingsStore()
    if (!settingsStore.settings.resumeInterruptedOnStartup) return
    const ids = interruptedDownloadIds.value
    if (ids.length === 0) return
    // Clear first so this can never double-fire within a session.
    interruptedDownloadIds.value = []
    const toastStore = useToastStore()
    toastStore.info(`Resuming ${ids.length} interrupted download${ids.length === 1 ? '' : 's'}…`)
    console.log(`[DownloadStore] Auto-resuming ${ids.length} interrupted download(s) on startup`)
    // Sequential: retryDownload re-adds through add* paths; serialising avoids a
    // burst of list-build requests, and the global concurrency gate + pacing
    // (#97, applied at boot) still bound the actual downloads regardless.
    for (const id of ids) {
      // Only resume items still in the interrupted error state (user may have
      // already retried or removed one before auth finished).
      const item = downloads.value.find(d => d.id === id)
      if (item && item.status === 'error') {
        await retryDownload(id)
      }
    }
  }

  return {
    downloads,
    activeDownloads,
    completedDownloads,
    failedDownloads,
    totalDownloadSpeed,
    serverPort,
    isPaused,
    // Duplicate detection helpers (in-queue)
    isTrackInQueue,
    isAlbumInQueue,
    isPlaylistInQueue,
    getTrackDownload,
    getAlbumDownload,
    getPlaylistDownload,
    // Completed download detection helpers
    isTrackCompleted,
    isAlbumCompleted,
    isPlaylistCompleted,
    // Actions
    init,
    addDownload,
    addAlbumDownload,
    addQobuzAlbumDownload,
    addPlaylistDownload,
    addBatchDownload,
    cancelDownload,
    deleteDownload,
    retryDownload,
    resumeInterruptedDownloads,
    clearCompleted,
    clearAll,
    reorderDownload,
    pauseQueue,
    resumeQueue,
    saveDownloadsImmediate,
    isSessionError,
    syncSettingsToServer,
    downloadHistory,
    clearHistory,
    retryFailedTracks
  }
})
