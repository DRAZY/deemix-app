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

  async function importDeezerFavorites(serverPort: number): Promise<{ imported: number; skipped: number }> {
    isImporting.value = true
    let imported = 0
    let skipped = 0

    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/api/user/favorites`)
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `Server returned ${response.status}`)
      }

      const data = await response.json()

      // Import tracks
      for (const track of (data.tracks || [])) {
        if (!isFavorite(track.id, 'track')) {
          favorites.value.push({
            id: `track_${track.id}`,
            type: 'track',
            data: track,
            addedAt: new Date().toISOString()
          })
          imported++
        } else {
          skipped++
        }
      }

      // Import albums
      for (const album of (data.albums || [])) {
        if (!isFavorite(album.id, 'album')) {
          favorites.value.push({
            id: `album_${album.id}`,
            type: 'album',
            data: album,
            addedAt: new Date().toISOString()
          })
          imported++
        } else {
          skipped++
        }
      }

      // Import artists
      for (const artist of (data.artists || [])) {
        if (!isFavorite(artist.id, 'artist')) {
          favorites.value.push({
            id: `artist_${artist.id}`,
            type: 'artist',
            data: artist,
            addedAt: new Date().toISOString()
          })
          imported++
        } else {
          skipped++
        }
      }

      // Import playlists
      for (const playlist of (data.playlists || [])) {
        if (!isFavorite(playlist.id, 'playlist')) {
          favorites.value.push({
            id: `playlist_${playlist.id}`,
            type: 'playlist',
            data: playlist,
            addedAt: new Date().toISOString()
          })
          imported++
        } else {
          skipped++
        }
      }

      if (imported > 0) {
        saveFavorites()
      }

      return { imported, skipped }
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
