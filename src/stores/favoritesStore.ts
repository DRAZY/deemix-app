import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Track, Album, Artist, Playlist } from '../types'
import { useToastStore } from './toastStore'

interface FavoriteItem {
  id: string
  type: 'track' | 'album' | 'artist' | 'playlist'
  data: Track | Album | Artist | Playlist
  addedAt: string
}

export const useFavoritesStore = defineStore('favorites', () => {
  const favorites = ref<FavoriteItem[]>([])

  const favoriteTracks = computed(() =>
    favorites.value.filter(f => f.type === 'track').map(f => f.data as Track)
  )

  const favoriteAlbums = computed(() =>
    favorites.value.filter(f => f.type === 'album').map(f => f.data as Album)
  )

  const favoriteArtists = computed(() =>
    favorites.value.filter(f => f.type === 'artist').map(f => f.data as Artist)
  )

  const favoritePlaylists = computed(() =>
    favorites.value.filter(f => f.type === 'playlist').map(f => f.data as Playlist)
  )

  function loadFavorites() {
    const saved = localStorage.getItem('favorites')
    if (saved) {
      try {
        favorites.value = JSON.parse(saved)
      } catch (e) {
        console.error('Failed to load favorites:', e)
      }
    }
  }

  function saveFavorites() {
    localStorage.setItem('favorites', JSON.stringify(favorites.value))
  }

  function addFavorite(item: Track | Album | Artist | Playlist, type: FavoriteItem['type']) {
    const id = `${type}_${item.id}`
    if (!favorites.value.find(f => f.id === id)) {
      favorites.value.unshift({
        id,
        type,
        data: item,
        addedAt: new Date().toISOString()
      })
      saveFavorites()
    }
  }

  function removeFavorite(id: string) {
    const index = favorites.value.findIndex(f => f.id === id)
    if (index !== -1) {
      favorites.value.splice(index, 1)
      saveFavorites()
    }
  }

  function isFavorite(itemId: string | number, type: FavoriteItem['type']): boolean {
    return favorites.value.some(f => f.id === `${type}_${itemId}`)
  }

  function toggleFavorite(item: Track | Album | Artist | Playlist, type: FavoriteItem['type']) {
    const toastStore = useToastStore()
    const id = `${type}_${item.id}`
    const itemName = 'title' in item ? item.title : 'name' in item ? item.name : 'Item'

    if (isFavorite(item.id, type)) {
      removeFavorite(id)
      toastStore.info(`Removed "${itemName}" from favorites`)
    } else {
      addFavorite(item, type)
      toastStore.success(`Added "${itemName}" to favorites`)
    }
  }

  const isImporting = ref(false)

  // v1.6.3 — was additive-only (issue #64). Now bidirectional: imports new
  // favorites AND prunes locally-cached entries that have been un-favorited
  // on Deezer's side. Also pings the sync engine to refresh membership so
  // SyncView can flag favorites-origin sync entries that no longer have a
  // backing favorite ("No longer in your Deezer favorites" prompt).
  async function importDeezerFavorites(serverPort: number): Promise<{
    imported: number
    skipped: number
    pruned: number
    syncStale: { playlists: number; artists: number }
  }> {
    isImporting.value = true
    let imported = 0
    let skipped = 0
    let pruned = 0

    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/api/user/favorites`)
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `Server returned ${response.status}`)
      }

      const data = await response.json()

      // Build the authoritative ID sets from the Deezer response so we can
      // (a) skip-vs-import and (b) prune locally-cached entries no longer
      // present on Deezer in one pass per type.
      const deezerIds: Record<FavoriteItem['type'], Set<string>> = {
        track: new Set((data.tracks || []).map((t: any) => String(t.id))),
        album: new Set((data.albums || []).map((a: any) => String(a.id))),
        artist: new Set((data.artists || []).map((a: any) => String(a.id))),
        playlist: new Set((data.playlists || []).map((p: any) => String(p.id)))
      }

      const addIfMissing = (item: any, type: FavoriteItem['type']) => {
        if (!isFavorite(item.id, type)) {
          favorites.value.push({
            id: `${type}_${item.id}`,
            type,
            data: item,
            addedAt: new Date().toISOString()
          })
          imported++
        } else {
          skipped++
        }
      }
      for (const track of (data.tracks || [])) addIfMissing(track, 'track')
      for (const album of (data.albums || [])) addIfMissing(album, 'album')
      for (const artist of (data.artists || [])) addIfMissing(artist, 'artist')
      for (const playlist of (data.playlists || [])) addIfMissing(playlist, 'playlist')

      // Prune: anything in our local cache whose ID is no longer in the
      // Deezer response of its type.
      const before = favorites.value.length
      favorites.value = favorites.value.filter(f => {
        const localId = String((f.data as any).id)
        return deezerIds[f.type].has(localId)
      })
      pruned = before - favorites.value.length

      if (imported > 0 || pruned > 0) {
        saveFavorites()
      }

      // Ask the sync engines to refresh favorites-membership against the
      // same ID sets we just used. We pass the IDs we already have rather
      // than making the server hit Deezer a second time.
      let syncStale = { playlists: 0, artists: 0 }
      try {
        const refreshRes = await fetch(`http://127.0.0.1:${serverPort}/api/sync/refresh-favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playlistIds: Array.from(deezerIds.playlist),
            artistIds: Array.from(deezerIds.artist)
          })
        })
        if (refreshRes.ok) {
          const r = await refreshRes.json()
          syncStale = {
            playlists: r.playlists?.stale ?? 0,
            artists: r.artists?.stale ?? 0
          }
        }
      } catch (e) {
        console.warn('[FavoritesStore] sync refresh-favorites call failed (non-fatal):', e)
      }

      return { imported, skipped, pruned, syncStale }
    } finally {
      isImporting.value = false
    }
  }

  return {
    favorites,
    favoriteTracks,
    favoriteAlbums,
    favoriteArtists,
    favoritePlaylists,
    isImporting,
    loadFavorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    importDeezerFavorites
  }
})
