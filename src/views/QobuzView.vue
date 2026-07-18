<script setup lang="ts">
// Channel Q — the Qobuz discover surface. Everything on this page is Qobuz:
// content comes from Qobuz's own editorial feeds (the same rows their Discover
// page leads with), rendered in Signal Deck components with the fixed brand
// cyan so the source is unmistakable. Cards drill into the source-aware detail
// views and download through the Qobuz pipeline.
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AlbumCard from '../components/AlbumCard.vue'
import ErrorState from '../components/ErrorState.vue'
import type { Album } from '../types'
import { qobuzRecordType } from '../utils/qobuzMap'

const router = useRouter()
const { t } = useI18n()

// In-tab search: hands off to the shared SearchView with the Qobuz source
// pre-selected — full reuse of the search machinery, no parallel search here.
const searchQuery = ref('')
function submitSearch() {
  const q = searchQuery.value.trim()
  if (q) router.push({ path: '/search', query: { q, source: 'qobuz' } })
}

const isLoading = ref(true)
const hasError = ref(false)
const notConnected = ref(false)

const newReleases = ref<Album[]>([])
const editorPicks = ref<Album[]>([])
const pressAwards = ref<Album[]>([])
const mostStreamed = ref<Album[]>([])
const playlists = ref<Album[]>([])
const myFavorites = ref<Album[]>([])
const myPurchases = ref<Album[]>([])

// Qobuz album → the app's Album shape, marked as Qobuz-sourced (same mapping
// contract as the search results, so cards badge/drill/download identically).
function mapAlbum(a: any): Album {
  return {
    id: a.id, title: a.title, nb_tracks: a.tracks_count, record_type: qobuzRecordType(a),
    artist: { id: a.artist?.id, name: a.artist?.name || '' },
    cover_small: a.image?.small, cover_medium: a.image?.large, cover_big: a.image?.large,
    release_date: a.release_date_original || a.released_at,
    qobuzQuality: (a.maximum_bit_depth && a.maximum_sampling_rate)
      ? { hires: !!a.hires, bitDepth: a.maximum_bit_depth, samplingRate: a.maximum_sampling_rate }
      : undefined,
    source: 'qobuz', qobuzId: a.id,
    qobuzData: { title: a.title, artist: a.artist, image: a.image, tracks_count: a.tracks_count },
  } as any
}

// Qobuz playlist → album-card shape (type=playlist), Qobuz-marked.
function mapPlaylist(p: any): Album {
  const cover = p.images300?.[0] || p.images?.[0] || p.image_rectangle?.[0]
  return {
    id: p.id, title: p.name,
    artist: { id: 0, name: p.owner?.name || 'Qobuz' },
    cover_medium: cover, cover_big: cover,
    nb_tracks: p.tracks_count,
    source: 'qobuz', qobuzId: p.id, qobuzType: 'playlist',
  } as any
}

async function loadDiscover() {
  isLoading.value = true
  hasError.value = false
  notConnected.value = false
  try {
    const port = window.electronAPI ? await window.electronAPI.getServerPort() : 6595
    const resp = await fetch(`http://127.0.0.1:${port}/api/qobuz/discover`)
    if (resp.status === 401) {
      notConnected.value = true
      return
    }
    if (!resp.ok) throw new Error(`Discover load failed: ${resp.status}`)
    const d = await resp.json()
    newReleases.value = (d.newReleases || []).map(mapAlbum)
    editorPicks.value = (d.editorPicks || []).map(mapAlbum)
    pressAwards.value = (d.pressAwards || []).map(mapAlbum)
    mostStreamed.value = (d.mostStreamed || []).map(mapAlbum)
    playlists.value = (d.playlists || []).map(mapPlaylist)
    myFavorites.value = (d.myFavorites || []).map(mapAlbum)
    myPurchases.value = (d.myPurchases || []).map(mapAlbum)
    // All rows empty → treat as an error state so the user isn't shown a void.
    if (!newReleases.value.length && !editorPicks.value.length && !pressAwards.value.length
        && !mostStreamed.value.length && !playlists.value.length
        && !myFavorites.value.length && !myPurchases.value.length) {
      hasError.value = true
    }
  } catch (error) {
    console.error('Failed to load Qobuz discover:', error)
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(loadDiscover)

// Personal rows lead — your purchases and favorites are what make the tab
// feel like YOUR Qobuz, mirroring the Qobuz player's own ordering.
const sections = [
  { key: 'myPurchases', title: 'My Purchases', data: myPurchases },
  { key: 'myFavorites', title: 'My Favorites', data: myFavorites },
  { key: 'newReleases', title: 'New Releases', data: newReleases },
  { key: 'editorPicks', title: "Editor's Picks", data: editorPicks },
  { key: 'pressAwards', title: 'Press Awards', data: pressAwards },
  { key: 'mostStreamed', title: 'Most Streamed', data: mostStreamed },
]
</script>

<template>
  <div class="space-y-8">
    <!-- Channel Q hero -->
    <div class="relative overflow-hidden border border-qobuz-500/25 bg-background-secondary/60 p-8">
      <div class="relative z-10">
        <div class="font-mono text-[10px] tracking-[0.3em] text-qobuz-500 mb-2">// CHANNEL Q · HI-RES</div>
        <h1 class="font-display uppercase text-[36px] leading-[1] tracking-[-0.01em] mb-2">Qobuz</h1>
        <p class="font-mono text-[11px] tracking-[0.06em] uppercase text-foreground-muted mb-6">
          Editorial feeds · lossless & hi-res up to 24-bit/192 kHz
        </p>

        <!-- Channel-scoped search — routes to the shared search view in Qobuz mode -->
        <form @submit.prevent="submitSearch" class="max-w-xl">
          <div class="flex items-stretch h-12 border border-qobuz-500/40 bg-background-main/60 focus-within:border-qobuz-500/70 transition-colors">
            <span class="flex items-center px-3 font-mono text-[10.5px] font-bold tracking-[0.1em] bg-qobuz-500 text-background-main select-none">QUERY::QOBUZ</span>
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('search.placeholder')"
              class="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-[13px] px-4 text-foreground placeholder:text-foreground-muted/60 caret-qobuz-500"
            />
          </div>
        </form>
      </div>
      <!-- Ghost glyph in channel cyan -->
      <div class="absolute -right-6 -bottom-16 font-display text-[220px] leading-none text-qobuz-500/[0.05] select-none pointer-events-none" aria-hidden="true">Q</div>
    </div>

    <!-- Not connected -->
    <div v-if="notConnected" class="text-center py-20 space-y-4">
      <div class="font-mono text-[11px] tracking-[0.2em] uppercase text-foreground-muted">Q:LINK DOWN</div>
      <p class="text-foreground-muted">{{ t('settings.qobuz.description') }}</p>
      <button
        @click="router.push('/settings')"
        class="font-mono text-[11px] tracking-[0.12em] uppercase px-4 py-2 border border-qobuz-500/60 text-qobuz-400 hover:bg-qobuz-500 hover:text-background-main transition-colors"
      >Connect in Settings</button>
    </div>

    <!-- Loading -->
    <div v-else-if="isLoading" class="flex items-center justify-center py-20">
      <div class="animate-spin w-8 h-8 border-2 border-qobuz-500 border-t-transparent rounded-full"></div>
    </div>

    <!-- Error -->
    <ErrorState
      v-else-if="hasError"
      :title="t('errors.loadingFailed')"
      :message="t('errors.tryAgainLater')"
      @retry="loadDiscover"
    />

    <!-- Editorial rows -->
    <template v-else>
      <section v-for="s in sections" :key="s.key">
        <template v-if="s.data.value.length > 0">
          <div class="flex items-center gap-2 mb-4">
            <h2 class="font-display text-[15px] uppercase tracking-[0.06em]">{{ s.title }}</h2>
            <span class="font-mono text-[9px] px-1.5 py-0.5 border border-qobuz-500/40 text-qobuz-400 tracking-[0.12em]">QOBUZ</span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <AlbumCard v-for="album in s.data.value" :key="album.id" :album="album" />
          </div>
        </template>
      </section>

      <!-- Qobuz Playlists -->
      <section v-if="playlists.length > 0">
        <div class="flex items-center gap-2 mb-4">
          <h2 class="font-display text-[15px] uppercase tracking-[0.06em]">Qobuz Playlists</h2>
          <span class="font-mono text-[9px] px-1.5 py-0.5 border border-qobuz-500/40 text-qobuz-400 tracking-[0.12em]">QOBUZ</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <AlbumCard v-for="pl in playlists" :key="pl.id" :album="pl" type="playlist" />
        </div>
      </section>
    </template>
  </div>
</template>
