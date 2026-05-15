<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFavoritesStore } from '../stores/favoritesStore'
import { useAuthStore } from '../stores/authStore'
import { useDownloadStore } from '../stores/downloadStore'
import { useToastStore } from '../stores/toastStore'
import { useSyncStore, type SyncedPlaylist } from '../stores/syncStore'
import { useArtistSyncStore, type SyncedArtist } from '../stores/artistSyncStore'
import { useSettingsStore } from '../stores/settingsStore'
import { deezerAPI } from '../services/deezerAPI'
import TrackCard from '../components/TrackCard.vue'
import AlbumCard from '../components/AlbumCard.vue'
import ArtistCard from '../components/ArtistCard.vue'
import EmptyState from '../components/EmptyState.vue'
import type { Playlist, Artist } from '../types'

const { t } = useI18n()
const favoritesStore = useFavoritesStore()
const authStore = useAuthStore()
const downloadStore = useDownloadStore()
const toastStore = useToastStore()
const syncStore = useSyncStore()
const artistSyncStore = useArtistSyncStore()
const settingsStore = useSettingsStore()
const activeTab = ref<'tracks' | 'albums' | 'artists' | 'playlists'>('tracks')
const isDownloading = ref(false)
const isBulkSyncing = ref(false)
const serverPort = ref(6595)
const sortOrder = ref<'added' | 'name-asc' | 'name-desc'>(
  (localStorage.getItem('favorites_sort') as any) || 'added'
)
watch(sortOrder, (val) => localStorage.setItem('favorites_sort', val))

// Sorted favorites — sorts the store's arrays without mutating them
function sortByName(items: any[], key: string, order: string): any[] {
  const copy = items.slice()
  if (order === 'name-asc') {
    copy.sort((a, b) => {
      const aVal = (a[key] || '').toLowerCase()
      const bVal = (b[key] || '').toLowerCase()
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    })
  } else if (order === 'name-desc') {
    copy.sort((a, b) => {
      const aVal = (a[key] || '').toLowerCase()
      const bVal = (b[key] || '').toLowerCase()
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
    })
  }
  return copy
}

const sortedTracks = computed(() => sortByName(favoritesStore.favoriteTracks, 'title', sortOrder.value))
const sortedAlbums = computed(() => sortByName(favoritesStore.favoriteAlbums, 'title', sortOrder.value))
const sortedArtists = computed(() => sortByName(favoritesStore.favoriteArtists, 'name', sortOrder.value))
const sortedPlaylists = computed(() => sortByName(favoritesStore.favoritePlaylists, 'title', sortOrder.value))

const tabs = computed(() => [
  { id: 'tracks', label: t('favorites.tracks'), count: () => favoritesStore.favoriteTracks.length },
  { id: 'albums', label: t('favorites.albums'), count: () => favoritesStore.favoriteAlbums.length },
  { id: 'artists', label: t('favorites.artists'), count: () => favoritesStore.favoriteArtists.length },
  { id: 'playlists', label: t('favorites.playlists'), count: () => favoritesStore.favoritePlaylists.length }
])

onMounted(async () => {
  if (window.electronAPI) {
    serverPort.value = await window.electronAPI.getServerPort()
  }
  favoritesStore.loadFavorites()
  syncStore.init().catch(e => console.error('[Favorites] syncStore.init failed:', e))
  artistSyncStore.init().catch(e => console.error('[Favorites] artistSyncStore.init failed:', e))
})

// Lookup of synced Deezer playlists keyed by sourcePlaylistId for O(1) badge/button state.
const syncedDeezerById = computed<Map<string, SyncedPlaylist>>(() => {
  const m = new Map<string, SyncedPlaylist>()
  for (const p of syncStore.playlists) {
    if (p.source === 'deezer') m.set(p.sourcePlaylistId, p)
  }
  return m
})

function getSyncEntry(playlistId: number | string): SyncedPlaylist | undefined {
  return syncedDeezerById.value.get(String(playlistId))
}

type SyncBadgeStatus = 'none' | 'syncing' | 'success' | 'partial' | 'error' | 'pending'

function getSyncStatus(playlistId: number | string): SyncBadgeStatus {
  const entry = getSyncEntry(playlistId)
  if (!entry) return 'none'
  if (syncStore.isSyncing(entry.id)) return 'syncing'
  switch (entry.lastSyncStatus) {
    case 'success': return 'success'
    case 'partial': return 'partial'
    case 'error': return 'error'
    default: return 'pending'
  }
}

async function addOneToSync(playlist: Playlist) {
  if (getSyncEntry(playlist.id)) return // idempotent — already in sync
  const result = await syncStore.addPlaylist({
    source: 'deezer',
    sourcePlaylistId: String(playlist.id),
    sourcePlaylistName: playlist.title,
    sourcePlaylistUrl: `https://www.deezer.com/playlist/${playlist.id}`,
    schedule: '24h',
    downloadPath: settingsStore.settings.downloadPath
  })
  if (result?.success) {
    toastStore.success(t('favorites.syncAdded', { name: playlist.title }))
  } else {
    toastStore.error(result?.error || t('favorites.syncFailed'))
  }
}

async function syncAllFavorites() {
  if (isBulkSyncing.value) return
  isBulkSyncing.value = true
  let added = 0
  let skipped = 0
  try {
    for (const playlist of favoritesStore.favoritePlaylists) {
      if (getSyncEntry(playlist.id)) {
        skipped++
        continue
      }
      const result = await syncStore.addPlaylist({
        source: 'deezer',
        sourcePlaylistId: String(playlist.id),
        sourcePlaylistName: playlist.title,
        sourcePlaylistUrl: `https://www.deezer.com/playlist/${playlist.id}`,
        schedule: '24h',
        downloadPath: settingsStore.settings.downloadPath
      })
      if (result?.success) {
        added++
      } else {
        console.error('[Favorites] Bulk sync add failed for', playlist.id, result?.error)
      }
    }
    if (added > 0) {
      toastStore.success(t('favorites.syncBulkResult', { added, skipped }))
    } else if (skipped > 0) {
      toastStore.info(t('favorites.syncAllNoneAdded'))
    }
  } finally {
    isBulkSyncing.value = false
  }
}

// Artist-sync mirror of the playlist-sync helpers above. Same UX pattern,
// different store + different default first-sync mode (subscribe-forward).
const syncedArtistsById = computed<Map<string, SyncedArtist>>(() => {
  const m = new Map<string, SyncedArtist>()
  for (const a of artistSyncStore.artists) {
    if (a.source === 'deezer') m.set(a.sourceArtistId, a)
  }
  return m
})

function getArtistSyncEntry(artistId: number | string): SyncedArtist | undefined {
  return syncedArtistsById.value.get(String(artistId))
}

function getArtistSyncStatus(artistId: number | string): SyncBadgeStatus {
  const entry = getArtistSyncEntry(artistId)
  if (!entry) return 'none'
  if (artistSyncStore.isSyncing(entry.id)) return 'syncing'
  switch (entry.lastSyncStatus) {
    case 'success': return 'success'
    case 'partial': return 'partial'
    case 'error': return 'error'
    default: return 'pending'
  }
}

async function pinArtistToSync(artist: Artist) {
  if (getArtistSyncEntry(artist.id)) return
  const result = await artistSyncStore.addArtist({
    sourceArtistId: String(artist.id),
    sourceArtistName: artist.name,
    sourceArtistUrl: `https://www.deezer.com/artist/${artist.id}`,
    schedule: '24h',
    downloadPath: settingsStore.settings.downloadPath,
    firstSyncMode: 'subscribe-forward'
  })
  if (result?.success) {
    toastStore.success(t('favorites.artistSyncAdded', { name: artist.name }))
  } else {
    toastStore.error(result?.error || t('favorites.artistSyncFailed'))
  }
}

async function syncAllFavoriteArtists() {
  if (isBulkSyncing.value) return
  isBulkSyncing.value = true
  let added = 0
  let skipped = 0
  try {
    for (const artist of favoritesStore.favoriteArtists) {
      if (getArtistSyncEntry(artist.id)) {
        skipped++
        continue
      }
      const result = await artistSyncStore.addArtist({
        sourceArtistId: String(artist.id),
        sourceArtistName: artist.name,
        sourceArtistUrl: `https://www.deezer.com/artist/${artist.id}`,
        schedule: '24h',
        downloadPath: settingsStore.settings.downloadPath,
        firstSyncMode: 'subscribe-forward'
      })
      if (result?.success) {
        added++
      } else {
        console.error('[Favorites] Bulk artist sync add failed for', artist.id, result?.error)
      }
    }
    if (added > 0) {
      toastStore.success(t('favorites.artistSyncBulkResult', { added, skipped }))
    } else if (skipped > 0) {
      toastStore.info(t('favorites.artistSyncAllNoneAdded'))
    }
  } finally {
    isBulkSyncing.value = false
  }
}

async function downloadAllFavorites() {
  if (isDownloading.value) return
  isDownloading.value = true

  try {
    await downloadStore.syncSettingsToServer()
    let queued = 0

    if (activeTab.value === 'tracks') {
      for (const track of favoritesStore.favoriteTracks) {
        await downloadStore.addDownload(track, { skipSync: true })
        queued++
      }
    } else if (activeTab.value === 'albums') {
      for (const album of favoritesStore.favoriteAlbums) {
        try {
          const tracks = await deezerAPI.getAlbumTracks(album.id)
          if (tracks?.length > 0) {
            await downloadStore.addAlbumDownload(album, tracks)
            queued++
          }
        } catch (e) {
          console.error(`[Favorites] Failed to download album ${album.id}:`, e)
        }
      }
    } else if (activeTab.value === 'playlists') {
      let skipped = 0
      for (const playlist of favoritesStore.favoritePlaylists) {
        try {
          const tracks = await deezerAPI.getPlaylistTracks(playlist.id)
          if (tracks?.length > 0) {
            await downloadStore.addPlaylistDownload(playlist, tracks)
            queued++
          } else {
            console.warn(`[Favorites] Playlist "${playlist.title}" (${playlist.id}) has no available tracks — skipping`)
            skipped++
          }
        } catch (e: any) {
          console.error(`[Favorites] Failed to download playlist ${playlist.id}:`, e)
          skipped++
        }
      }
      if (skipped > 0) {
        toastStore.info(`${skipped} playlist${skipped > 1 ? 's' : ''} skipped (empty or unavailable)`)
      }
    }

    if (queued > 0) {
      toastStore.success(`Queued ${queued} ${activeTab.value} for download`)
    }
  } catch (e: any) {
    toastStore.error(e.message || 'Failed to start downloads')
  } finally {
    isDownloading.value = false
  }
}

async function importFromDeezer() {
  try {
    const { imported, skipped } = await favoritesStore.importDeezerFavorites(serverPort.value)
    if (imported > 0) {
      toastStore.success(`Imported ${imported} favorites from Deezer${skipped > 0 ? ` (${skipped} already existed)` : ''}`)
    } else if (skipped > 0) {
      toastStore.info('All Deezer favorites are already imported')
    } else {
      toastStore.info('No favorites found on your Deezer account')
    }
  } catch (e: any) {
    toastStore.error(e.message || 'Failed to import Deezer favorites')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">{{ t('favorites.title') }}</h1>
      <div class="flex gap-2">
        <button
          v-if="authStore.isLoggedIn && activeTab !== 'artists' && ((activeTab === 'tracks' && favoritesStore.favoriteTracks.length > 0) || (activeTab === 'albums' && favoritesStore.favoriteAlbums.length > 0) || (activeTab === 'playlists' && favoritesStore.favoritePlaylists.length > 0))"
          @click="downloadAllFavorites"
          :disabled="isDownloading"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg v-if="isDownloading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {{ isDownloading ? 'Downloading...' : `Download All ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}` }}
        </button>
        <button
          v-if="activeTab === 'playlists' && favoritesStore.favoritePlaylists.length > 0"
          @click="syncAllFavorites"
          :disabled="isBulkSyncing"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg v-if="isBulkSyncing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ t('favorites.syncAllPlaylists') }}
        </button>
        <button
          v-if="activeTab === 'artists' && favoritesStore.favoriteArtists.length > 0"
          @click="syncAllFavoriteArtists"
          :disabled="isBulkSyncing"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg v-if="isBulkSyncing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ t('favorites.syncAllArtists') }}
        </button>
        <button
          v-if="authStore.isLoggedIn"
          @click="importFromDeezer"
          :disabled="favoritesStore.isImporting"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg v-if="favoritesStore.isImporting" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {{ favoritesStore.isImporting ? 'Importing...' : 'Import from Deezer' }}
      </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-2 border-b border-zinc-800 pb-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id as typeof activeTab"
        class="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        :class="activeTab === tab.id
          ? 'bg-primary-500 text-white'
          : 'text-foreground-muted hover:text-foreground'"
      >
        {{ tab.label }}
        <span
          v-if="tab.count() > 0"
          class="px-1.5 py-0.5 text-xs rounded-full"
          :class="activeTab === tab.id ? 'bg-white/20' : 'bg-background-tertiary'"
        >
          {{ tab.count() }}
        </span>
      </button>
    </div>

    <!-- Sort Controls -->
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
      </svg>
      <select
        v-model="sortOrder"
        class="text-sm bg-background-secondary text-foreground rounded-lg px-3 py-1.5 border border-zinc-700 focus:border-primary-500 outline-none"
      >
        <option value="added">Date Added</option>
        <option value="name-asc">Name A-Z</option>
        <option value="name-desc">Name Z-A</option>
      </select>
    </div>

    <!-- Tracks -->
    <div v-if="activeTab === 'tracks'">
      <div v-if="sortedTracks.length > 0" class="space-y-1">
        <TrackCard
          v-for="track in sortedTracks"
          :key="track.id"
          :track="track"
        />
      </div>
      <EmptyState
        v-else
        type="favorites"
        :title="t('favorites.noFavorites')"
        :subtitle="t('favorites.noFavoritesHint')"
      />
    </div>

    <!-- Albums -->
    <div v-if="activeTab === 'albums'">
      <div v-if="favoritesStore.favoriteAlbums.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <AlbumCard
          v-for="album in sortedAlbums"
          :key="album.id"
          :album="album"
        />
      </div>
      <EmptyState
        v-else
        type="favorites"
        :title="t('favorites.noFavorites')"
        :subtitle="t('favorites.noFavoritesHint')"
      />
    </div>

    <!-- Artists -->
    <div v-if="activeTab === 'artists'">
      <div v-if="favoritesStore.favoriteArtists.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div
          v-for="artist in sortedArtists"
          :key="artist.id"
          class="relative flex flex-col gap-2"
        >
          <ArtistCard :artist="artist" />
          <!-- Sync status badge — overlays the card top-right -->
          <span
            v-if="getArtistSyncStatus(artist.id) !== 'none'"
            class="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium rounded-full backdrop-blur-sm pointer-events-none flex items-center gap-1"
            :class="{
              'bg-blue-500/90 text-white': getArtistSyncStatus(artist.id) === 'syncing',
              'bg-green-500/90 text-white': getArtistSyncStatus(artist.id) === 'success',
              'bg-yellow-500/90 text-black': getArtistSyncStatus(artist.id) === 'partial',
              'bg-red-500/90 text-white': getArtistSyncStatus(artist.id) === 'error',
              'bg-zinc-500/90 text-white': getArtistSyncStatus(artist.id) === 'pending'
            }"
            :title="
              getArtistSyncStatus(artist.id) === 'syncing' ? t('favorites.syncing')
              : getArtistSyncStatus(artist.id) === 'success' ? t('favorites.synced')
              : getArtistSyncStatus(artist.id) === 'partial' ? t('favorites.syncPartial')
              : getArtistSyncStatus(artist.id) === 'error' ? t('favorites.syncError')
              : t('favorites.syncPending')
            "
          >
            <svg v-if="getArtistSyncStatus(artist.id) === 'syncing'" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <svg v-else-if="getArtistSyncStatus(artist.id) === 'success'" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            <svg v-else-if="getArtistSyncStatus(artist.id) === 'error'" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {{ getArtistSyncStatus(artist.id) === 'syncing' ? t('favorites.syncing')
                 : getArtistSyncStatus(artist.id) === 'success' ? t('favorites.synced')
                 : getArtistSyncStatus(artist.id) === 'partial' ? t('favorites.syncPartial')
                 : getArtistSyncStatus(artist.id) === 'error' ? t('favorites.syncError')
                 : t('favorites.syncPending') }}
            </span>
          </span>
          <!-- Per-card Pin to Sync button — flips to disabled when pinned -->
          <button
            @click="pinArtistToSync(artist)"
            :disabled="getArtistSyncStatus(artist.id) !== 'none' || artistSyncStore.isLoading"
            class="w-full px-2 py-1 text-xs font-medium rounded-md transition-colors disabled:cursor-not-allowed"
            :class="getArtistSyncStatus(artist.id) === 'none'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-zinc-700 text-zinc-300'"
          >
            {{ getArtistSyncStatus(artist.id) === 'none' ? t('favorites.pinArtistToSync') : t('favorites.artistSynced') }}
          </button>
        </div>
      </div>
      <EmptyState
        v-else
        type="favorites"
        :title="t('favorites.noFavorites')"
        :subtitle="t('favorites.noFavoritesHint')"
      />
    </div>

    <!-- Playlists -->
    <div v-if="activeTab === 'playlists'">
      <div v-if="favoritesStore.favoritePlaylists.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div
          v-for="playlist in sortedPlaylists"
          :key="playlist.id"
          class="relative flex flex-col gap-2"
        >
          <AlbumCard
            :album="{
              id: playlist.id,
              title: playlist.title,
              cover_medium: playlist.picture_medium,
              artist: { id: 0, name: playlist.creator?.name || t('common.unknown') }
            }"
            type="playlist"
          />
          <!-- Sync status badge — overlays the card top-right -->
          <span
            v-if="getSyncStatus(playlist.id) !== 'none'"
            class="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium rounded-full backdrop-blur-sm pointer-events-none flex items-center gap-1"
            :class="{
              'bg-blue-500/90 text-white': getSyncStatus(playlist.id) === 'syncing',
              'bg-green-500/90 text-white': getSyncStatus(playlist.id) === 'success',
              'bg-yellow-500/90 text-black': getSyncStatus(playlist.id) === 'partial',
              'bg-red-500/90 text-white': getSyncStatus(playlist.id) === 'error',
              'bg-zinc-500/90 text-white': getSyncStatus(playlist.id) === 'pending'
            }"
            :title="
              getSyncStatus(playlist.id) === 'syncing' ? t('favorites.syncing')
              : getSyncStatus(playlist.id) === 'success' ? t('favorites.synced')
              : getSyncStatus(playlist.id) === 'partial' ? t('favorites.syncPartial')
              : getSyncStatus(playlist.id) === 'error' ? t('favorites.syncError')
              : t('favorites.syncPending')
            "
          >
            <svg v-if="getSyncStatus(playlist.id) === 'syncing'" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <svg v-else-if="getSyncStatus(playlist.id) === 'success'" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            <svg v-else-if="getSyncStatus(playlist.id) === 'error'" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {{ getSyncStatus(playlist.id) === 'syncing' ? t('favorites.syncing')
                 : getSyncStatus(playlist.id) === 'success' ? t('favorites.synced')
                 : getSyncStatus(playlist.id) === 'partial' ? t('favorites.syncPartial')
                 : getSyncStatus(playlist.id) === 'error' ? t('favorites.syncError')
                 : t('favorites.syncPending') }}
            </span>
          </span>
          <!-- Per-card Sync button — flips to disabled "Synced" once added -->
          <button
            @click="addOneToSync(playlist)"
            :disabled="getSyncStatus(playlist.id) !== 'none' || syncStore.isLoading"
            class="w-full px-2 py-1 text-xs font-medium rounded-md transition-colors disabled:cursor-not-allowed"
            :class="getSyncStatus(playlist.id) === 'none'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-zinc-700 text-zinc-300'"
          >
            {{ getSyncStatus(playlist.id) === 'none' ? t('favorites.syncPlaylist') : t('favorites.synced') }}
          </button>
        </div>
      </div>
      <EmptyState
        v-else
        type="playlist"
        :title="t('favorites.noFavorites')"
        :subtitle="t('favorites.noFavoritesHint')"
      />
    </div>
  </div>
</template>
