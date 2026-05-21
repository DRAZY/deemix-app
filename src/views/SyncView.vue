<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSyncStore, type SyncSchedule, type SyncedPlaylist } from '../stores/syncStore'
import { useArtistSyncStore, type SyncedArtist, type FirstSyncMode, type ArtistSyncFilters } from '../stores/artistSyncStore'
import { useToastStore } from '../stores/toastStore'
import { useSettingsStore } from '../stores/settingsStore'

const { t } = useI18n()
const syncStore = useSyncStore()
const artistSyncStore = useArtistSyncStore()
const toastStore = useToastStore()
const settingsStore = useSettingsStore()
const expandedArtistErrors = ref<Set<string>>(new Set())

const showAddModal = ref(false)
const playlistUrl = ref('')
const playlistName = ref('')
const playlistSchedule = ref<SyncSchedule>('6h')
const detectedSource = ref<'spotify' | 'deezer' | null>(null)
const detectedId = ref('')
const addLoading = ref(false)
const resolving = ref(false)
const expandedErrors = ref<Set<string>>(new Set())

const scheduleOptions: { value: SyncSchedule; label: string }[] = [
  { value: 'launch', label: 'On app launch' },
  { value: '1h', label: 'Every hour' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: '24h', label: 'Every 24 hours' },
  { value: 'manual', label: 'Manual only' }
]

const firstSyncModeOptions: { value: FirstSyncMode; labelKey: string }[] = [
  { value: 'subscribe-forward', labelKey: 'sync.firstSyncModeSubscribeForward' },
  { value: 'download-backlog', labelKey: 'sync.firstSyncModeDownloadBacklog' },
  { value: 'date-threshold', labelKey: 'sync.firstSyncModeDateThreshold' }
]

// Edit-modal state — opens with a pencil-icon click on either a synced
// playlist or a synced artist card. Single modal handles both, using the
// editingType discriminator to conditionally render artist-only fields
// (firstSyncMode). Backend update endpoints already support every field
// the modal exposes (playlistSync.updatePlaylist, artistSync.updateArtist);
// this is a UI-only feature (#69).
const showEditModal = ref(false)
const editingType = ref<'playlist' | 'artist'>('playlist')
const editingId = ref('')
const editName = ref('')
const editSchedule = ref<SyncSchedule>('6h')
const editDownloadPath = ref('')
const editFirstSyncMode = ref<FirstSyncMode>('subscribe-forward')
// Per-entry release-type filters surfaced for artist sync (#71). Defaults
// mirror DEFAULT_ARTIST_FILTERS in the engine; openEditArtist overwrites them
// from the entry's stored filters on open.
const editFilterAlbums = ref(true)
const editFilterSingles = ref(false)
const editFilterEPs = ref(true)
const editFilterCompilations = ref(false)
const editFilterFeatures = ref(false)
const editFilterMinDate = ref('') // empty string = no threshold
const editSaving = ref(false)
const isEditNameValid = computed(() => editName.value.trim().length > 0)

function openEditPlaylist(p: SyncedPlaylist) {
  editingType.value = 'playlist'
  editingId.value = p.id
  editName.value = p.sourcePlaylistName
  editSchedule.value = p.schedule
  editDownloadPath.value = p.downloadPath || ''
  showEditModal.value = true
}

function openEditArtist(a: SyncedArtist) {
  editingType.value = 'artist'
  editingId.value = a.id
  editName.value = a.sourceArtistName
  editSchedule.value = a.schedule
  editDownloadPath.value = a.downloadPath || ''
  editFirstSyncMode.value = a.firstSyncMode
  // Seed filter UI from the entry's stored filters (#71). Engine backfills
  // DEFAULT_ARTIST_FILTERS at load for v1.7.4-and-older entries, so this is
  // always populated.
  editFilterAlbums.value = a.filters?.includeAlbums ?? true
  editFilterSingles.value = a.filters?.includeSingles ?? false
  editFilterEPs.value = a.filters?.includeEPs ?? true
  editFilterCompilations.value = a.filters?.includeCompilations ?? false
  editFilterFeatures.value = a.filters?.includeFeatures ?? false
  editFilterMinDate.value = a.filters?.minReleaseDate ?? ''
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editingId.value = ''
  editName.value = ''
  editDownloadPath.value = ''
  editSaving.value = false
}

async function saveEdit() {
  if (!isEditNameValid.value || editSaving.value) return
  editSaving.value = true
  try {
    if (editingType.value === 'playlist') {
      await syncStore.updatePlaylist(editingId.value, {
        sourcePlaylistName: editName.value.trim(),
        schedule: editSchedule.value,
        downloadPath: editDownloadPath.value.trim() || settingsStore.settings.downloadPath
      })
      toastStore.success(t('sync.editSaved'))
    } else {
      const filters: ArtistSyncFilters = {
        includeAlbums: editFilterAlbums.value,
        includeSingles: editFilterSingles.value,
        includeEPs: editFilterEPs.value,
        includeCompilations: editFilterCompilations.value,
        includeFeatures: editFilterFeatures.value,
        // Empty string in the date input means "no threshold" — store null
        // so the engine's date check stays unambiguous.
        minReleaseDate: editFilterMinDate.value.trim() || null
      }
      await artistSyncStore.updateArtist(editingId.value, {
        sourceArtistName: editName.value.trim(),
        schedule: editSchedule.value,
        downloadPath: editDownloadPath.value.trim() || settingsStore.settings.downloadPath,
        firstSyncMode: editFirstSyncMode.value,
        filters
      })
      toastStore.success(t('sync.artistEditSaved'))
    }
    closeEditModal()
  } catch (e: any) {
    toastStore.error(e?.message || t('sync.editFailed'))
    editSaving.value = false
  }
}

onMounted(async () => {
  await syncStore.init() // Safe to call again - guarded against duplicate init
  await syncStore.fetchPlaylists() // Refresh playlist data when view opens
  await artistSyncStore.init().catch(e => console.error('[SyncView] artistSyncStore.init failed:', e))
  await artistSyncStore.fetchArtists()
})

function toggleArtistErrors(id: string) {
  if (expandedArtistErrors.value.has(id)) {
    expandedArtistErrors.value.delete(id)
  } else {
    expandedArtistErrors.value.add(id)
  }
}

async function detectUrl() {
  const url = playlistUrl.value.trim()

  // Spotify direct URL
  const spotifyMatch = url.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/)
  if (spotifyMatch) {
    detectedSource.value = 'spotify'
    detectedId.value = spotifyMatch[1]
    return
  }

  // Deezer direct URL
  const deezerMatch = url.match(/deezer\.com\/(?:\w+\/)?playlist\/(\d+)/)
  if (deezerMatch) {
    detectedSource.value = 'deezer'
    detectedId.value = deezerMatch[1]
    return
  }

  // Deezer share link (link.deezer.com/s/...) — resolve via server
  if (url.match(/link\.deezer\.com\//)) {
    resolving.value = true
    detectedSource.value = null
    detectedId.value = ''
    try {
      const response = await fetch(`http://127.0.0.1:${syncStore.serverPort}/api/sync/resolve-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      if (response.ok) {
        const data = await response.json()
        if (data.playlistId) {
          detectedSource.value = 'deezer'
          detectedId.value = data.playlistId
        }
      }
    } catch (e) {
      console.error('[SyncView] Failed to resolve share link:', e)
    } finally {
      resolving.value = false
    }
    return
  }

  // Spotify share link (spotify.link/...)
  if (url.match(/spotify\.link\//)) {
    resolving.value = true
    detectedSource.value = null
    detectedId.value = ''
    try {
      const response = await fetch(`http://127.0.0.1:${syncStore.serverPort}/api/sync/resolve-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      if (response.ok) {
        const data = await response.json()
        if (data.playlistId) {
          detectedSource.value = 'spotify'
          detectedId.value = data.playlistId
        }
      }
    } catch (e) {
      console.error('[SyncView] Failed to resolve share link:', e)
    } finally {
      resolving.value = false
    }
    return
  }

  detectedSource.value = null
  detectedId.value = ''
}

function addPlaylist() {
  if (!detectedSource.value || !detectedId.value) return

  // Capture form values and close modal immediately
  const config = {
    source: detectedSource.value,
    sourcePlaylistId: detectedId.value,
    sourcePlaylistName: playlistName.value || `${detectedSource.value} playlist`,
    sourcePlaylistUrl: playlistUrl.value.trim(),
    schedule: playlistSchedule.value,
    downloadPath: settingsStore.settings.downloadPath
  }

  // Close modal and reset form right away
  showAddModal.value = false
  playlistUrl.value = ''
  playlistName.value = ''
  detectedSource.value = null
  detectedId.value = ''

  // Fire the add request in the background
  syncStore.addPlaylist(config).then(result => {
    if (result && result.success) {
      toastStore.success(t('sync.added'))
    } else if (result && result.error) {
      toastStore.error(result.error)
    }
  }).catch(e => {
    toastStore.error(e.message || t('sync.addFailed'))
  })
}

function toggleErrors(id: string) {
  if (expandedErrors.value.has(id)) {
    expandedErrors.value.delete(id)
  } else {
    expandedErrors.value.add(id)
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return date.toLocaleDateString()
}

function getScheduleLabel(schedule: SyncSchedule): string {
  return scheduleOptions.find(o => o.value === schedule)?.label || schedule
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ t('sync.title') }}</h1>
        <p class="text-foreground-muted text-sm mt-1">{{ t('sync.subtitle') }}</p>
      </div>
      <div class="flex gap-2">
        <button
          v-if="syncStore.playlists.length > 0"
          @click="syncStore.syncAll()"
          class="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-background-secondary text-foreground-muted hover:text-foreground transition-colors"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ t('sync.syncAll') }}
        </button>
        <button
          @click="showAddModal = true"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          {{ t('sync.addPlaylist') }}
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="syncStore.playlists.length === 0" class="card text-center py-16">
      <svg class="w-16 h-16 mx-auto text-foreground-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <h3 class="text-lg font-medium mb-2">{{ t('sync.noPlaylists') }}</h3>
      <p class="text-foreground-muted mb-4">{{ t('sync.noPlaylistsHint') }}</p>
      <button
        @click="showAddModal = true"
        class="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
      >
        {{ t('sync.addFirstPlaylist') }}
      </button>
    </div>

    <!-- Playlist Cards -->
    <div v-for="playlist in syncStore.playlists" :key="playlist.id" class="card">
      <div class="flex items-start gap-4">
        <!-- Source Icon -->
        <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          :class="playlist.source === 'spotify' ? 'bg-green-500/20' : 'bg-purple-500/20'"
        >
          <svg v-if="playlist.source === 'spotify'" class="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          <svg v-else class="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="font-medium truncate">{{ playlist.sourcePlaylistName }}</h3>
            <span
              v-if="playlist.lastSyncStatus"
              class="px-2 py-0.5 text-xs rounded-full"
              :class="{
                'bg-green-500/20 text-green-400': playlist.lastSyncStatus === 'success',
                'bg-yellow-500/20 text-yellow-400': playlist.lastSyncStatus === 'partial',
                'bg-red-500/20 text-red-400': playlist.lastSyncStatus === 'error'
              }"
            >
              {{ playlist.lastSyncStatus }}
            </span>
          </div>
          <div class="flex items-center gap-4 text-xs text-foreground-muted mt-1">
            <span>{{ getScheduleLabel(playlist.schedule) }}</span>
            <span>{{ playlist.totalTracksDownloaded }} {{ t('sync.tracksDownloaded') }}</span>
            <span>{{ t('sync.lastSync') }}: {{ formatDate(playlist.lastSyncAt) }}</span>
          </div>

          <!-- Sync Progress -->
          <div v-if="syncStore.isSyncing(playlist.id)" class="mt-2">
            <div class="flex items-center gap-2 text-xs text-primary-400">
              <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span v-if="syncStore.getProgress(playlist.id)">
                {{ syncStore.getProgress(playlist.id)?.phase === 'resolving' ? 'Resolving tracks...' : `Downloading ${syncStore.getProgress(playlist.id)?.current}/${syncStore.getProgress(playlist.id)?.total}` }}
              </span>
              <span v-else>{{ t('sync.syncing') }}...</span>
            </div>
            <div class="mt-1 h-1 rounded-full bg-background-main overflow-hidden">
              <div
                class="h-full bg-primary-500 rounded-full transition-all duration-300"
                :style="{ width: syncStore.getProgress(playlist.id) ? `${(syncStore.getProgress(playlist.id)!.current / Math.max(syncStore.getProgress(playlist.id)!.total, 1)) * 100}%` : '0%' }"
              />
            </div>
          </div>

          <!-- Stale: source playlist no longer in user's Deezer favorites -->
          <div
            v-if="syncStore.isStale(playlist)"
            class="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs"
          >
            <div class="flex items-center gap-2 text-amber-300 min-w-0">
              <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span class="truncate">{{ t('sync.staleFavoriteNotice') }}</span>
            </div>
            <button
              @click="syncStore.removePlaylist(playlist.id)"
              class="px-2 py-1 rounded-md bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors flex-shrink-0"
            >
              {{ t('sync.remove') }}
            </button>
          </div>

          <!-- Failed Tracks -->
          <div v-if="playlist.failedTracks.length > 0" class="mt-2">
            <button
              @click="toggleErrors(playlist.id)"
              class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {{ playlist.failedTracks.length }} {{ t('sync.failedTracks') }}
              <svg class="w-3 h-3 transition-transform" :class="{ 'rotate-180': expandedErrors.has(playlist.id) }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div v-if="expandedErrors.has(playlist.id)" class="mt-2 space-y-1">
              <div v-for="track in playlist.failedTracks" :key="track.sourceTrackId" class="text-xs text-foreground-muted bg-background-main rounded px-2 py-1">
                {{ track.artist }} - {{ track.title }}: <span class="text-red-400">{{ track.error }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-1">
          <button
            v-if="syncStore.isSyncing(playlist.id)"
            @click="syncStore.cancelSync(playlist.id)"
            class="p-2 text-foreground-muted hover:text-red-400 transition-colors"
            :title="t('common.cancel')"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            v-else
            @click="syncStore.syncPlaylist(playlist.id)"
            @contextmenu.prevent="syncStore.forceSync(playlist.id)"
            class="p-2 text-foreground-muted hover:text-primary-400 transition-colors"
            :title="t('sync.syncNow') + ' (right-click: force full sync)'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            @click="openEditPlaylist(playlist)"
            class="p-2 text-foreground-muted hover:text-primary-400 transition-colors"
            :title="t('sync.edit')"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            @click="syncStore.updatePlaylist(playlist.id, { enabled: !playlist.enabled })"
            class="p-2 transition-colors"
            :class="playlist.enabled ? 'text-green-400 hover:text-green-300' : 'text-foreground-muted hover:text-foreground'"
            :title="playlist.enabled ? t('sync.disable') : t('sync.enable')"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path v-if="playlist.enabled" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path v-if="playlist.enabled" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          </button>
          <button
            @click="syncStore.removePlaylist(playlist.id)"
            class="p-2 text-foreground-muted hover:text-red-400 transition-colors"
            :title="t('sync.remove')"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Synced Artists Section (U1 layout: appended below the playlist list) -->
    <div v-if="artistSyncStore.artists.length > 0" class="space-y-3 pt-4 border-t border-zinc-800">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">{{ t('sync.syncedArtistsTitle') }}</h2>
        <button
          @click="artistSyncStore.syncAll()"
          class="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-background-secondary text-foreground-muted hover:text-foreground transition-colors"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ t('sync.syncAllArtists') }}
        </button>
      </div>

      <div v-for="artist in artistSyncStore.artists" :key="artist.id" class="card">
        <div class="flex items-start gap-4">
          <!-- Source icon: artist (mic) -->
          <div class="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-medium truncate">{{ artist.sourceArtistName }}</h3>
              <span
                v-if="artist.lastSyncStatus"
                class="px-2 py-0.5 text-xs rounded-full"
                :class="{
                  'bg-green-500/20 text-green-400': artist.lastSyncStatus === 'success',
                  'bg-yellow-500/20 text-yellow-400': artist.lastSyncStatus === 'partial',
                  'bg-red-500/20 text-red-400': artist.lastSyncStatus === 'error'
                }"
              >
                {{ artist.lastSyncStatus }}
              </span>
              <span class="px-2 py-0.5 text-xs rounded-full bg-zinc-700 text-zinc-300">
                {{ artist.firstSyncMode }}
              </span>
            </div>
            <div class="flex items-center gap-4 text-xs text-foreground-muted mt-1 flex-wrap">
              <span>{{ getScheduleLabel(artist.schedule) }}</span>
              <span>{{ artist.totalAlbumsDownloaded }} {{ t('sync.albumsDownloaded') }}</span>
              <span>{{ artist.totalTracksDownloaded }} {{ t('sync.tracksDownloaded') }}</span>
              <span>{{ t('sync.lastSync') }}: {{ formatDate(artist.lastSyncAt) }}</span>
            </div>

            <!-- Sync Progress -->
            <div v-if="artistSyncStore.isSyncing(artist.id)" class="mt-2">
              <div class="flex items-center gap-2 text-xs text-primary-400">
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span v-if="artistSyncStore.getProgress(artist.id)">
                  {{ artistSyncStore.getProgress(artist.id)?.phase === 'resolving'
                     ? 'Checking discography...'
                     : `Album ${artistSyncStore.getProgress(artist.id)?.current}/${artistSyncStore.getProgress(artist.id)?.total}${artistSyncStore.getProgress(artist.id)?.albumTitle ? ` — ${artistSyncStore.getProgress(artist.id)?.albumTitle}` : ''}` }}
                </span>
                <span v-else>{{ t('sync.syncing') }}...</span>
              </div>
              <div class="mt-1 h-1 rounded-full bg-background-main overflow-hidden">
                <div
                  class="h-full bg-primary-500 rounded-full transition-all duration-300"
                  :style="{ width: artistSyncStore.getProgress(artist.id) ? `${(artistSyncStore.getProgress(artist.id)!.current / Math.max(artistSyncStore.getProgress(artist.id)!.total, 1)) * 100}%` : '0%' }"
                />
              </div>
            </div>

            <!-- Stale: artist no longer in user's Deezer favorites -->
            <div
              v-if="artistSyncStore.isStale(artist)"
              class="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs"
            >
              <div class="flex items-center gap-2 text-amber-300 min-w-0">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span class="truncate">{{ t('sync.staleFavoriteArtistNotice') }}</span>
              </div>
              <button
                @click="artistSyncStore.removeArtist(artist.id)"
                class="px-2 py-1 rounded-md bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors flex-shrink-0"
              >
                {{ t('sync.remove') }}
              </button>
            </div>

            <!-- Failed Albums -->
            <div v-if="artist.failedAlbums.length > 0" class="mt-2">
              <button
                @click="toggleArtistErrors(artist.id)"
                class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {{ artist.failedAlbums.length }} {{ t('sync.failedAlbums') }}
                <svg class="w-3 h-3 transition-transform" :class="{ 'rotate-180': expandedArtistErrors.has(artist.id) }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div v-if="expandedArtistErrors.has(artist.id)" class="mt-2 space-y-1">
                <div v-for="album in artist.failedAlbums" :key="album.sourceAlbumId" class="text-xs text-foreground-muted bg-background-main rounded px-2 py-1">
                  {{ album.title }} <span v-if="album.releaseDate">({{ album.releaseDate }})</span>: <span class="text-red-400">{{ album.error }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1">
            <button
              v-if="artistSyncStore.isSyncing(artist.id)"
              @click="artistSyncStore.cancelSync(artist.id)"
              class="p-2 text-foreground-muted hover:text-red-400 transition-colors"
              :title="t('common.cancel')"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              v-else
              @click="artistSyncStore.syncArtist(artist.id)"
              @contextmenu.prevent="artistSyncStore.forceSync(artist.id)"
              class="p-2 text-foreground-muted hover:text-primary-400 transition-colors"
              :title="t('sync.syncNow') + ' (right-click: force full re-check)'"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              @click="openEditArtist(artist)"
              class="p-2 text-foreground-muted hover:text-primary-400 transition-colors"
              :title="t('sync.edit')"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              @click="artistSyncStore.updateArtist(artist.id, { enabled: !artist.enabled })"
              class="p-2 transition-colors"
              :class="artist.enabled ? 'text-green-400 hover:text-green-300' : 'text-foreground-muted hover:text-foreground'"
              :title="artist.enabled ? t('sync.disable') : t('sync.enable')"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path v-if="artist.enabled" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path v-if="artist.enabled" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </button>
            <button
              @click="artistSyncStore.removeArtist(artist.id)"
              class="p-2 text-foreground-muted hover:text-red-400 transition-colors"
              :title="t('sync.remove')"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Playlist Modal -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="showAddModal = false">
          <div class="bg-background-secondary rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h2 class="text-lg font-semibold mb-4">{{ t('sync.addPlaylist') }}</h2>

            <div class="space-y-4">
              <!-- URL Input -->
              <div>
                <label class="block text-sm font-medium mb-1">{{ t('sync.playlistUrl') }}</label>
                <input
                  v-model="playlistUrl"
                  @input="detectUrl"
                  class="w-full px-3 py-2 bg-background-main rounded-lg text-sm border border-zinc-700 focus:border-primary-500 outline-none"
                  :placeholder="t('sync.urlPlaceholder')"
                />
                <div v-if="resolving" class="mt-1 text-xs text-yellow-400 flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Resolving share link...
                </div>
                <div v-else-if="detectedSource" class="mt-1 text-xs text-green-400 flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                  {{ detectedSource === 'spotify' ? 'Spotify' : 'Deezer' }} playlist detected
                </div>
              </div>

              <!-- Name -->
              <div>
                <label class="block text-sm font-medium mb-1">{{ t('sync.playlistName') }}</label>
                <input
                  v-model="playlistName"
                  class="w-full px-3 py-2 bg-background-main rounded-lg text-sm border border-zinc-700 focus:border-primary-500 outline-none"
                  :placeholder="t('sync.namePlaceholder')"
                />
              </div>

              <!-- Schedule -->
              <div>
                <label class="block text-sm font-medium mb-1">{{ t('sync.schedule') }}</label>
                <select
                  v-model="playlistSchedule"
                  class="w-full px-3 py-2 bg-background-main rounded-lg text-sm border border-zinc-700 focus:border-primary-500 outline-none"
                >
                  <option v-for="opt in scheduleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </div>

            <div class="flex justify-end gap-2 mt-6">
              <button
                @click="showAddModal = false"
                class="px-4 py-2 text-sm rounded-lg text-foreground-muted hover:text-foreground transition-colors"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                @click="addPlaylist"
                :disabled="!detectedSource || addLoading || resolving"
                class="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span v-if="addLoading">{{ t('sync.adding') }}...</span>
                <span v-else>{{ t('sync.add') }}</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- Edit Sync Entry Modal — shared between playlist and artist edits (#69) -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="closeEditModal">
          <div class="bg-background-secondary rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h2 class="text-lg font-semibold mb-4">
              {{ editingType === 'playlist' ? t('sync.editPlaylist') : t('sync.editArtist') }}
            </h2>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">{{ t('sync.editName') }}</label>
                <input
                  v-model="editName"
                  class="w-full px-3 py-2 bg-background-main rounded-lg text-sm border border-zinc-700 focus:border-primary-500 outline-none"
                  :placeholder="t('sync.namePlaceholder')"
                />
                <p v-if="!isEditNameValid" class="mt-1 text-xs text-red-400">{{ t('sync.editNameRequired') }}</p>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">{{ t('sync.schedule') }}</label>
                <select
                  v-model="editSchedule"
                  class="w-full px-3 py-2 bg-background-main rounded-lg text-sm border border-zinc-700 focus:border-primary-500 outline-none"
                >
                  <option v-for="opt in scheduleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">{{ t('sync.editDownloadPath') }}</label>
                <input
                  v-model="editDownloadPath"
                  class="w-full px-3 py-2 bg-background-main rounded-lg text-sm border border-zinc-700 focus:border-primary-500 outline-none"
                  :placeholder="settingsStore.settings.downloadPath || t('sync.editDownloadPathPlaceholder')"
                />
              </div>

              <div v-if="editingType === 'artist'">
                <label class="block text-sm font-medium mb-1">{{ t('sync.editFirstSyncMode') }}</label>
                <select
                  v-model="editFirstSyncMode"
                  class="w-full px-3 py-2 bg-background-main rounded-lg text-sm border border-zinc-700 focus:border-primary-500 outline-none"
                >
                  <option v-for="opt in firstSyncModeOptions" :key="opt.value" :value="opt.value">{{ t(opt.labelKey) }}</option>
                </select>
              </div>

              <!-- Release-type filters for artist sync (#71). Defaults match
                   DEFAULT_ARTIST_FILTERS in the engine; per-entry overrides
                   persist via the existing PUT /api/sync/artists endpoint. -->
              <div v-if="editingType === 'artist'">
                <label class="block text-sm font-medium mb-1">{{ t('sync.editReleaseTypes') }}</label>
                <div class="grid grid-cols-2 gap-x-3 gap-y-2 mt-1">
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" v-model="editFilterAlbums" class="accent-primary-500" />
                    {{ t('sync.filterAlbums') }}
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" v-model="editFilterSingles" class="accent-primary-500" />
                    {{ t('sync.filterSingles') }}
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" v-model="editFilterEPs" class="accent-primary-500" />
                    {{ t('sync.filterEPs') }}
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" v-model="editFilterCompilations" class="accent-primary-500" />
                    {{ t('sync.filterCompilations') }}
                  </label>
                  <label class="flex items-center gap-2 text-sm col-span-2">
                    <input type="checkbox" v-model="editFilterFeatures" class="accent-primary-500" />
                    {{ t('sync.filterFeatures') }}
                  </label>
                </div>
              </div>

              <div v-if="editingType === 'artist'">
                <label class="block text-sm font-medium mb-1">{{ t('sync.editMinReleaseDate') }}</label>
                <input
                  v-model="editFilterMinDate"
                  type="date"
                  class="w-full px-3 py-2 bg-background-main rounded-lg text-sm border border-zinc-700 focus:border-primary-500 outline-none"
                />
              </div>

              <p class="text-xs text-foreground-muted">
                {{ t('sync.editFolderNoticeRename') }}
              </p>
            </div>

            <div class="flex justify-end gap-2 mt-6">
              <button
                @click="closeEditModal"
                class="px-4 py-2 text-sm rounded-lg text-foreground-muted hover:text-foreground transition-colors"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                @click="saveEdit"
                :disabled="!isEditNameValid || editSaving"
                class="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span v-if="editSaving">{{ t('sync.saving') }}...</span>
                <span v-else>{{ t('sync.saveChanges') }}</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>
