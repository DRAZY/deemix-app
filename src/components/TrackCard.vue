<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDownloadStore } from '../stores/downloadStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { usePlayerStore } from '../stores/playerStore'
import { useContextMenu } from '../composables/useContextMenu'
import ContextMenu from './ContextMenu.vue'
import type { Track } from '../types'

const { t } = useI18n()
const router = useRouter()

const props = withDefaults(defineProps<{
  track: Track
  index?: number
  showAlbum?: boolean
}>(), {
  showAlbum: true
})

const downloadStore = useDownloadStore()
const favoritesStore = useFavoritesStore()
const playerStore = usePlayerStore()

const duration = computed(() => {
  const mins = Math.floor(props.track.duration / 60)
  const secs = props.track.duration % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
})

const imageError = ref(false)

const coverUrl = computed(() => {
  return props.track.album?.cover_small ||
         props.track.album?.cover_medium ||
         props.track.cover ||
         ''
})

function handleImageError() {
  imageError.value = true
}

const isFavorite = computed(() => favoritesStore.isFavorite(props.track.id, 'track'))
const isPlaying = computed(() => playerStore.isTrackPlaying(props.track.id))
const isInQueue = computed(() => downloadStore.isTrackInQueue(props.track.id))
const isCompleted = computed(() => downloadStore.isTrackCompleted(props.track.id))

// Combined state for download button
const downloadState = computed(() => {
  if (isInQueue.value) return 'downloading'
  if (isCompleted.value) return 'completed'
  return 'available'
})

function download() {
  if (downloadState.value !== 'available') return // Already downloading or completed
  downloadStore.addDownload(props.track)
}

function toggleFavorite() {
  favoritesStore.toggleFavorite(props.track, 'track')
}

function togglePlay() {
  playerStore.play(props.track)
}

function goToArtist() {
  if (props.track.artist?.id != null) {
    router.push(`/artist/${props.track.artist.id}`)
  }
}

function goToAlbum() {
  if (props.track.album?.id != null) {
    router.push(`/album/${props.track.album.id}`)
  }
}

// Context menu
const { menuState, openMenu, closeMenu, copyToClipboard } = useContextMenu()

const contextMenuItems = computed(() => [
  {
    label: t('contextMenu.copyTitle'),
    icon: 'copy',
    action: () => copyToClipboard(props.track.title, t('contextMenu.title'))
  },
  {
    label: t('contextMenu.copyArtist'),
    icon: 'copy',
    action: () => copyToClipboard(props.track.artist?.name || '', t('contextMenu.artist')),
    disabled: !props.track.artist?.name
  },
  {
    label: t('contextMenu.copyBoth'),
    icon: 'copy',
    action: () => copyToClipboard(`${props.track.artist?.name || 'Unknown'} - ${props.track.title}`, t('contextMenu.trackInfo'))
  }
])
</script>

<template>
  <div
    class="track-card group flex items-center gap-3 p-2 rounded-lg transition-colors"
    :class="isPlaying ? 'bg-primary-500/10' : 'hover:bg-background-secondary'"
    @contextmenu="openMenu"
  >
    <!-- Index / Play button -->
    <div class="w-8 text-center">
      <!-- Show stop button when this track is playing -->
      <button
        v-if="isPlaying"
        @click="togglePlay"
        class="flex items-center justify-center w-5 h-5 mx-auto text-primary-500 hover:text-primary-400"
        :title="t('trackCard.stop')"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>
      <!-- Show index normally, play button on hover -->
      <template v-else>
        <span class="group-hover:hidden text-foreground-muted">{{ index || '' }}</span>
        <button
          v-if="track.preview"
          @click="togglePlay"
          class="hidden group-hover:block text-foreground-muted hover:text-primary-400"
        >
          <svg class="w-5 h-5 mx-auto" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </template>
    </div>

    <!-- Cover art -->
    <img
      v-if="coverUrl && !imageError"
      :src="coverUrl"
      :alt="track.title"
      loading="lazy"
      decoding="async"
      class="w-10 h-10 rounded object-cover bg-background-tertiary"
      @error="handleImageError"
    />
    <!-- Fallback placeholder when no image or image fails to load -->
    <div
      v-else
      class="w-10 h-10 rounded bg-background-tertiary flex items-center justify-center"
    >
      <svg class="w-5 h-5 text-foreground-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    </div>

    <!-- Track info -->
    <div class="flex-1 min-w-0">
      <p class="font-medium truncate" :class="isPlaying ? 'text-primary-400' : (track.explicit_lyrics ? 'text-primary-400' : '')">
        {{ track.title }}
        <span v-if="track.explicit_lyrics" class="text-xs bg-foreground-muted/20 px-1 rounded ml-1">E</span>
      </p>
      <div class="flex items-center gap-1 text-sm text-foreground-muted truncate">
        <span
          v-if="track.artist?.id != null"
          @click.stop="goToArtist"
          class="hover:text-primary-400 hover:underline cursor-pointer"
        >
          {{ track.artist.name }}
        </span>
        <span v-else-if="track.artist" class="text-foreground-muted">
          {{ track.artist.name }}
        </span>
        <template v-if="showAlbum && track.album">
          <span>&bull;</span>
          <span
            v-if="track.album.id != null"
            @click.stop="goToAlbum"
            class="hover:text-primary-400 hover:underline truncate cursor-pointer"
          >
            {{ track.album.title }}
          </span>
          <span v-else class="truncate text-foreground-muted">
            {{ track.album.title }}
          </span>
        </template>
      </div>
    </div>

    <!-- Duration -->
    <span class="text-sm text-foreground-muted w-12 text-right">{{ duration }}</span>

    <!-- Actions -->
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        @click="toggleFavorite"
        class="p-2 hover:bg-white/10 rounded-lg transition-colors"
        :title="isFavorite ? t('trackCard.removeFromFavorites') : t('trackCard.addToFavorites')"
      >
        <svg
          class="w-5 h-5"
          :class="isFavorite ? 'fill-primary-500 text-primary-500' : 'text-foreground-muted'"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>
      <button
        @click="download"
        class="p-2 rounded-lg transition-colors"
        :class="{
          'bg-primary-500/20 text-primary-400 cursor-default': downloadState === 'downloading',
          'bg-green-500/20 text-green-400 cursor-default': downloadState === 'completed',
          'hover:bg-white/10': downloadState === 'available'
        }"
        :title="downloadState === 'downloading' ? t('trackCard.inQueue') : downloadState === 'completed' ? t('trackCard.alreadyDownloaded') : t('trackCard.download')"
        :disabled="downloadState !== 'available'"
      >
        <!-- Downloading indicator (checkmark) -->
        <svg v-if="downloadState === 'downloading'" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M5 13l4 4L19 7" />
        </svg>
        <!-- Already downloaded indicator (double checkmark) -->
        <svg v-else-if="downloadState === 'completed'" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <!-- Download icon -->
        <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
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
