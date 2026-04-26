<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { deezerAPI } from '../services/deezerAPI'
import AlbumCard from '../components/AlbumCard.vue'
import BackButton from '../components/BackButton.vue'
import ErrorState from '../components/ErrorState.vue'
import type { Album } from '../types'

const { t } = useI18n()

const releases = ref<Album[]>([])
const isLoading = ref(true)
const hasError = ref(false)

const count = computed(() => releases.value.length)

async function loadReleases() {
  isLoading.value = true
  hasError.value = false
  try {
    // Deezer caps /editorial/0/releases at 100 server-side
    releases.value = await deezerAPI.getNewReleases(100)
  } catch (error) {
    console.error('Failed to load new releases:', error)
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadReleases()
})
</script>

<template>
  <div class="space-y-6">
    <BackButton />

    <div class="flex items-center justify-between flex-wrap gap-4">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold">{{ t('newReleases.title') }}</h1>
        <span
          v-if="!isLoading && count > 0"
          class="text-xs px-2 py-0.5 rounded-full bg-background-tertiary text-foreground-muted"
        >
          {{ count }}
        </span>
      </div>
    </div>

    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <div class="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full"></div>
    </div>

    <ErrorState
      v-else-if="hasError"
      :title="t('errors.loadingFailed')"
      :message="t('errors.tryAgainLater')"
      @retry="loadReleases"
    />

    <template v-else>
      <div v-if="count === 0" class="text-center py-20">
        <svg class="w-16 h-16 mx-auto text-foreground-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <p class="text-foreground-muted">{{ t('newReleases.empty') }}</p>
      </div>

      <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        <AlbumCard
          v-for="album in releases"
          :key="album.id"
          :album="album"
        />
      </div>
    </template>
  </div>
</template>
