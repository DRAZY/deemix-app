<script setup lang="ts">
// Channel Q full-feed view (#106 follow-up): the complete catalog of one
// editorial feed — optionally genre-filtered — with continuous pagination.
// Reached from the SEE ALL links on the Qobuz tab's rows.
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AlbumCard from '../components/AlbumCard.vue'
import BackButton from '../components/BackButton.vue'
import ErrorState from '../components/ErrorState.vue'
import { qobuzRecordType } from '../utils/qobuzMap'
import type { Album } from '../types'

const route = useRoute()
const { t } = useI18n()

const feedType = computed(() => String(route.query.type || 'new-releases-full'))
const genreId = computed(() => Number(route.query.genre) || 0)
const title = computed(() => String(route.query.title || 'Qobuz'))
const isPlaylistFeed = computed(() => feedType.value === 'playlists')

const items = ref<Album[]>([])
const total = ref(0)
const isLoading = ref(false)
const hasError = ref(false)

function mapAlbum(a: any): Album {
  return {
    id: a.id, title: a.title, nb_tracks: a.tracks_count, record_type: qobuzRecordType(a),
    qobuzQuality: (a.maximum_bit_depth && a.maximum_sampling_rate)
      ? { hires: !!a.hires, bitDepth: a.maximum_bit_depth, samplingRate: a.maximum_sampling_rate }
      : undefined,
    artist: { id: a.artist?.id, name: a.artist?.name || '' },
    cover_small: a.image?.small, cover_medium: a.image?.large, cover_big: a.image?.large,
    release_date: a.release_date_original || a.released_at,
    source: 'qobuz', qobuzId: a.id,
    qobuzData: { title: a.title, artist: a.artist, image: a.image, tracks_count: a.tracks_count },
  } as any
}

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

async function loadPage() {
  if (isLoading.value) return
  isLoading.value = true
  hasError.value = false
  try {
    const port = window.electronAPI ? await window.electronAPI.getServerPort() : 6595
    const genreParam = genreId.value ? `&genre=${genreId.value}` : ''
    const r = await fetch(`http://127.0.0.1:${port}/api/qobuz/featured?type=${feedType.value}&offset=${items.value.length}&limit=50${genreParam}`)
    if (!r.ok) throw new Error(`feed: ${r.status}`)
    const d = await r.json()
    const mapper = isPlaylistFeed.value ? mapPlaylist : mapAlbum
    const existing = new Set(items.value.map(a => String(a.id)))
    items.value = [...items.value, ...(d.items || []).map(mapper).filter((a: Album) => !existing.has(String(a.id)))]
    total.value = d.total ?? items.value.length
    if (items.value.length === 0) hasError.value = true
  } catch (e) {
    console.error('Failed to load feed:', e)
    if (items.value.length === 0) hasError.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(loadPage)
</script>

<template>
  <div class="space-y-6">
    <BackButton />

    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="font-display uppercase text-[22px] tracking-[0.02em]">{{ title }}</h1>
      <span class="font-mono text-[9px] px-1.5 py-0.5 border border-qobuz-500/40 text-qobuz-400 tracking-[0.12em]">QOBUZ</span>
      <span v-if="total" class="font-mono text-[10px] text-foreground-muted">{{ items.length }} / {{ total }}</span>
    </div>

    <ErrorState
      v-if="hasError"
      :title="t('errors.loadingFailed')"
      :message="t('errors.tryAgainLater')"
      @retry="loadPage"
    />

    <template v-else>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        <AlbumCard
          v-for="item in items"
          :key="item.id"
          :album="item"
          :type="isPlaylistFeed ? 'playlist' : 'album'"
        />
      </div>

      <div v-if="isLoading" class="flex items-center justify-center py-10">
        <div class="animate-spin w-8 h-8 border-2 border-qobuz-500 border-t-transparent rounded-full"></div>
      </div>

      <div v-else-if="items.length < total" class="text-center pb-8">
        <button
          @click="loadPage"
          class="font-mono text-[10px] tracking-[0.16em] uppercase px-5 py-2 border border-qobuz-500/50 text-qobuz-400 hover:bg-qobuz-500 hover:text-background-main transition-colors"
        >MORE ({{ items.length }}/{{ total }})</button>
      </div>
    </template>
  </div>
</template>
