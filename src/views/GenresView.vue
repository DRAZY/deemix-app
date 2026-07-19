<script setup lang="ts">
// Deezer Genre Browse (#106) — built only from the Deezer endpoints verified
// working: per-genre editorial picks + genre charts. The per-genre artists
// endpoint is broken upstream (ignores the filter) and deliberately excluded.
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AlbumCard from '../components/AlbumCard.vue'
import TrackCard from '../components/TrackCard.vue'
import ErrorState from '../components/ErrorState.vue'
import type { Track, Album } from '../types'

const { t } = useI18n()

const genres = ref<Array<{ id: number; name: string }>>([])
const activeGenre = ref<number | null>(null)
const isLoading = ref(false)
const hasError = ref(false)

const picks = ref<Album[]>([])
const chartTracks = ref<Track[]>([])
const chartAlbums = ref<Album[]>([])

async function serverPort(): Promise<number> {
  return window.electronAPI ? await window.electronAPI.getServerPort() : 6595
}

async function loadGenres() {
  try {
    const r = await fetch(`http://127.0.0.1:${await serverPort()}/api/deezer/genres`)
    if (!r.ok) throw new Error(`genres: ${r.status}`)
    genres.value = (await r.json()).genres || []
    if (genres.value.length > 0) selectGenre(genres.value[0].id)
  } catch (e) {
    console.error('Failed to load genres:', e)
    hasError.value = true
  }
}

async function selectGenre(id: number) {
  if (activeGenre.value === id && picks.value.length) return
  activeGenre.value = id
  isLoading.value = true
  hasError.value = false
  try {
    const r = await fetch(`http://127.0.0.1:${await serverPort()}/api/deezer/genre-browse?id=${id}`)
    if (!r.ok) throw new Error(`genre-browse: ${r.status}`)
    const d = await r.json()
    picks.value = d.picks || []
    chartTracks.value = d.chartTracks || []
    chartAlbums.value = d.chartAlbums || []
    if (!picks.value.length && !chartTracks.value.length && !chartAlbums.value.length) {
      hasError.value = true
    }
  } catch (e) {
    console.error('Failed to load genre browse:', e)
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(loadGenres)
</script>

<template>
  <div class="space-y-8">
    <!-- Hero -->
    <div class="relative overflow-hidden border border-white/[0.08] bg-background-secondary/60 p-8">
      <div class="relative z-10">
        <div class="font-mono text-[10px] tracking-[0.3em] text-primary-500 mb-2">// SIGNAL DECK</div>
        <h1 class="font-display uppercase text-[36px] leading-[1] tracking-[-0.01em] mb-2">Genres</h1>
        <p class="font-mono text-[11px] tracking-[0.06em] uppercase text-foreground-muted">
          Deezer editorial picks &amp; charts by genre
        </p>
      </div>
      <div class="absolute -right-6 -bottom-16 font-display text-[220px] leading-none text-white/[0.03] select-none pointer-events-none" aria-hidden="true">▮</div>
    </div>

    <!-- Genre chips (chartreuse — Deezer colorway) -->
    <div v-if="genres.length > 0" class="flex gap-2 overflow-x-auto pb-1 -mb-2">
      <button
        v-for="g in genres"
        :key="g.id"
        @click="selectGenre(g.id)"
        class="flex-shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase px-2.5 py-1 border transition-colors whitespace-nowrap"
        :class="activeGenre === g.id ? 'border-primary-500/60 text-primary-400 bg-primary-500/10' : 'border-white/[0.1] text-foreground-muted hover:text-foreground'"
      >{{ g.name }}</button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <div class="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full"></div>
    </div>

    <!-- Error -->
    <ErrorState
      v-else-if="hasError"
      :title="t('errors.loadingFailed')"
      :message="t('errors.tryAgainLater')"
      @retry="activeGenre !== null ? selectGenre(activeGenre) : loadGenres()"
    />

    <template v-else>
      <!-- Editorial picks -->
      <section v-if="picks.length > 0">
        <h2 class="font-display text-[15px] uppercase tracking-[0.06em] mb-4">Fresh Picks</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <AlbumCard v-for="album in picks" :key="album.id" :album="album" />
        </div>
      </section>

      <!-- Genre chart tracks -->
      <section v-if="chartTracks.length > 0">
        <h2 class="font-display text-[15px] uppercase tracking-[0.06em] mb-4">Top Tracks</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <TrackCard v-for="track in chartTracks" :key="track.id" :track="track" />
        </div>
      </section>

      <!-- Genre chart albums -->
      <section v-if="chartAlbums.length > 0">
        <h2 class="font-display text-[15px] uppercase tracking-[0.06em] mb-4">Top Albums</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <AlbumCard v-for="album in chartAlbums" :key="album.id" :album="album" />
        </div>
      </section>
    </template>
  </div>
</template>
