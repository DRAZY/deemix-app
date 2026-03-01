<script setup lang="ts">
import { computed } from 'vue'
import { useDownloadStore } from '../stores/downloadStore'

const downloadStore = useDownloadStore()

// Find the first download that's actually in 'downloading' status, not just 'pending'
const currentDownload = computed(() => {
  // First try to find one that's actively downloading
  const downloading = downloadStore.activeDownloads.find(d => d.status === 'downloading')
  if (downloading) return downloading
  // Fall back to first pending if nothing is downloading yet
  return downloadStore.activeDownloads[0]
})

const queueCount = computed(() => Math.max(0, downloadStore.activeDownloads.length - 1))

// Calculate overall progress across all active downloads
const progress = computed(() => {
  const active = downloadStore.activeDownloads
  if (active.length === 0) return 0

  // If showing a single download, use its progress
  if (active.length === 1) {
    return currentDownload.value?.progress || 0
  }

  // For multiple downloads, calculate weighted average based on track counts
  let totalTracks = 0
  let completedProgress = 0

  for (const download of active) {
    if (download.type === 'album' || download.type === 'playlist') {
      const tracks = download.totalTracks || 1
      totalTracks += tracks
      completedProgress += (download.progress || 0) * tracks
    } else {
      // Single track
      totalTracks += 1
      completedProgress += download.progress || 0
    }
  }

  return totalTracks > 0 ? Math.round(completedProgress / totalTracks) : 0
})

// Safely extract artist name (handles both string and object)
function getArtistName(item: any): string {
  if (!item?.artist) return 'Unknown Artist'
  if (typeof item.artist === 'string') return item.artist
  if (typeof item.artist === 'object' && item.artist.name) return item.artist.name
  return 'Unknown Artist'
}
</script>

<template>
  <div class="h-16 bg-background-secondary border-t border-zinc-800 flex items-center px-4 gap-4">
    <!-- Current download info -->
    <div v-if="currentDownload" class="flex items-center gap-3 flex-1 min-w-0">
      <!-- Album art -->
      <img
        v-if="currentDownload.cover"
        :src="currentDownload.cover"
        :alt="currentDownload.title"
        class="w-10 h-10 rounded object-cover bg-background-tertiary"
      />
      <div v-else class="w-10 h-10 rounded bg-background-tertiary flex items-center justify-center text-foreground-muted">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <circle cx="12" cy="12" r="3" stroke-width="2"/>
        </svg>
      </div>

      <!-- Track info -->
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">{{ currentDownload.title }}</p>
        <p class="text-xs text-foreground-muted truncate">{{ getArtistName(currentDownload) }}</p>
      </div>

      <!-- Progress bar -->
      <div class="w-48">
        <div class="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
          <div
            class="h-full bg-green-500 transition-all duration-300"
            :style="{ width: `${progress}%` }"
          />
        </div>
        <div class="flex justify-between mt-1">
          <span class="text-xs text-foreground-muted">{{ progress }}%</span>
          <span v-if="queueCount > 0" class="text-xs text-foreground-muted">
            +{{ queueCount }} in queue
          </span>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-2">
        <button
          class="p-2 hover:bg-white/10 rounded-lg transition-colors"
          title="Pause"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6" />
          </svg>
        </button>
        <button
          class="p-2 hover:bg-white/10 rounded-lg transition-colors"
          title="Cancel"
          @click="downloadStore.cancelDownload(currentDownload.id)"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
