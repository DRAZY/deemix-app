<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { deezerAPI } from '../services/deezerAPI'
import TrackCard from '../components/TrackCard.vue'
import AlbumCard from '../components/AlbumCard.vue'
import ErrorState from '../components/ErrorState.vue'
import ContextMenu from '../components/ContextMenu.vue'
import { useContextMenu } from '../composables/useContextMenu'
import type { Track, Album, Playlist } from '../types'

const router = useRouter()
const { t } = useI18n()
const searchQuery = ref('')
const newReleases = ref<Album[]>([])
const topTracks = ref<Track[]>([])
const topAlbums = ref<Album[]>([])
const popularPlaylists = ref<Playlist[]>([])
const isLoading = ref(true)
const hasError = ref(false)

async function loadContent() {
  isLoading.value = true
  hasError.value = false
  try {
    // Load chart data and new releases for all sections
    const [releasesResponse, tracksResponse, albumsResponse, playlistsResponse] = await Promise.all([
      // New releases get a deeper cut than the chart rows — the feed is genuinely
      // dated (newest first) and users want the full recent breadth at a glance.
      deezerAPI.getNewReleases(30),
      deezerAPI.getChart('tracks'),
      deezerAPI.getChart('albums'),
      deezerAPI.getChart('playlists')
    ])
    newReleases.value = releasesResponse.slice(0, 30)
    topTracks.value = tracksResponse.slice(0, 10)
    topAlbums.value = albumsResponse.slice(0, 10)
    popularPlaylists.value = playlistsResponse.slice(0, 10)
  } catch (error) {
    console.error('Failed to load charts:', error)
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadContent()
})

function handleSearch() {
  if (searchQuery.value.trim()) {
    router.push({ path: '/search', query: { q: searchQuery.value } })
  }
}

// Context menu for search input
const { menuState, openMenu, closeMenu, copyToClipboard, pasteFromClipboard } = useContextMenu()

function openSearchMenu(e: MouseEvent) {
  openMenu(e)
}

const contextMenuItems = computed(() => [
  {
    label: t('contextMenu.paste'),
    icon: 'paste',
    action: async () => {
      const text = await pasteFromClipboard()
      if (text) {
        searchQuery.value = text
      }
    }
  },
  {
    label: t('contextMenu.copy'),
    icon: 'copy',
    action: () => copyToClipboard(searchQuery.value),
    disabled: !searchQuery.value
  }
])

</script>

<template>
  <div class="space-y-8">
    <!-- Hero Search -->
    <div class="relative overflow-hidden border border-white/[0.08] bg-background-secondary/60 p-8">
      <div class="relative z-10">
        <div class="font-mono text-[10px] tracking-[0.3em] text-primary-500 mb-2">// SIGNAL DECK</div>
        <h1 class="font-display uppercase text-[36px] leading-[1] tracking-[-0.01em] mb-2">{{ t('home.welcome') }}</h1>
        <p class="font-mono text-[11px] tracking-[0.06em] uppercase text-foreground-muted mb-6">{{ t('home.subtitle') }}</p>

        <form @submit.prevent="handleSearch" class="max-w-xl">
          <div class="flex items-stretch h-12 border border-white/[0.1] bg-background-main/60 focus-within:border-primary-500/50 transition-colors">
            <span class="flex items-center px-3 font-mono text-[10.5px] font-bold tracking-[0.1em] bg-primary-500 text-background-main select-none">QUERY</span>
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('home.searchPlaceholder')"
              class="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-[13px] px-4 text-foreground placeholder:text-foreground-muted caret-primary-500"
              @contextmenu="openSearchMenu"
            />
          </div>
        </form>
      </div>

      <!-- Background decoration — oversized ghost brand glyph -->
      <div class="absolute -right-6 -bottom-16 font-display text-[220px] leading-none text-white/[0.03] select-none pointer-events-none" aria-hidden="true">▮</div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <div class="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full"></div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="hasError"
      :title="t('errors.loadingFailed')"
      :message="t('errors.tryAgainLater')"
      @retry="loadContent"
    />

    <!-- Content -->
    <template v-else>
      <!-- New Releases -->
      <section v-if="newReleases.length > 0">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-[15px] uppercase tracking-[0.06em]">{{ t('home.newReleases') }}</h2>
          <router-link to="/new-releases" class="font-mono text-[10px] tracking-[0.16em] uppercase text-primary-400 hover:text-primary-300 flex items-center gap-1">
            {{ t('home.seeAll') }}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </router-link>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <AlbumCard
            v-for="album in newReleases"
            :key="album.id"
            :album="album"
          />
        </div>
      </section>

      <!-- Top Tracks -->
      <section v-if="topTracks.length > 0">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-[15px] uppercase tracking-[0.06em]">{{ t('home.topTracks') }}</h2>
          <router-link to="/charts?type=tracks" class="font-mono text-[10px] tracking-[0.16em] uppercase text-primary-400 hover:text-primary-300 flex items-center gap-1">
            {{ t('home.seeAll') }}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </router-link>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <TrackCard
            v-for="track in topTracks"
            :key="track.id"
            :track="track"
          />
        </div>
      </section>

      <!-- Most Streamed Albums -->
      <section v-if="topAlbums.length > 0">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-[15px] uppercase tracking-[0.06em]">{{ t('home.mostStreamedAlbums') }}</h2>
          <router-link to="/charts?type=albums" class="font-mono text-[10px] tracking-[0.16em] uppercase text-primary-400 hover:text-primary-300 flex items-center gap-1">
            {{ t('home.seeAll') }}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </router-link>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <AlbumCard
            v-for="album in topAlbums"
            :key="album.id"
            :album="album"
          />
        </div>
      </section>

      <!-- Popular Playlists -->
      <section v-if="popularPlaylists.length > 0">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-[15px] uppercase tracking-[0.06em]">{{ t('home.popularPlaylists') }}</h2>
          <router-link to="/charts?type=playlists" class="font-mono text-[10px] tracking-[0.16em] uppercase text-primary-400 hover:text-primary-300 flex items-center gap-1">
            {{ t('home.seeAll') }}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </router-link>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <AlbumCard
            v-for="playlist in popularPlaylists"
            :key="playlist.id"
            :album="{
              id: playlist.id,
              title: playlist.title,
              cover_medium: playlist.picture_medium,
              artist: { id: 0, name: playlist.creator?.name || (playlist as any).user?.name || 'Deezer' },
              nb_tracks: playlist.nb_tracks
            }"
            type="playlist"
          />
        </div>
      </section>
    </template>

    <!-- Empty State -->
    <div v-if="!isLoading && newReleases.length === 0 && topTracks.length === 0 && topAlbums.length === 0 && popularPlaylists.length === 0" class="text-center py-20">
      <svg class="w-16 h-16 mx-auto text-foreground-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
      <p class="text-foreground-muted">{{ t('home.searchToStart') }}</p>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      :show="menuState.show"
      :x="menuState.x"
      :y="menuState.y"
      :items="contextMenuItems"
      @close="closeMenu"
    />
  </div>
</template>
