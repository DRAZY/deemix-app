<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useContextMenu } from '../composables/useContextMenu'
import ContextMenu from './ContextMenu.vue'
import type { Artist } from '../types'

const { t } = useI18n()

const props = defineProps<{
  artist: Artist
}>()

const router = useRouter()
const imageError = ref(false)

const pictureUrl = computed(() => {
  return props.artist.picture_medium ||
         props.artist.picture_big ||
         props.artist.picture ||
         ''
})

function handleImageError() {
  imageError.value = true
}

function navigate() {
  router.push(`/artist/${props.artist.id}`)
}

// Context menu
const { menuState, openMenu, closeMenu, copyToClipboard } = useContextMenu()

const contextMenuItems = computed(() => [
  {
    label: t('contextMenu.copyArtist'),
    icon: 'copy',
    action: () => copyToClipboard(props.artist.name, t('contextMenu.artist'))
  }
])
</script>

<template>
  <div
    @click="navigate"
    @contextmenu="openMenu"
    class="group cursor-pointer text-center"
  >
    <div class="relative aspect-square mb-3">
      <!-- Artist image -->
      <img
        v-if="pictureUrl && !imageError"
        :src="pictureUrl"
        :alt="artist.name"
        loading="lazy"
        decoding="async"
        class="w-full h-full object-cover rounded-full bg-background-tertiary shadow-md
               group-hover:shadow-lg transition-shadow duration-200"
        @error="handleImageError"
      />
      <!-- Fallback placeholder when no image or image fails to load -->
      <div
        v-else
        class="w-full h-full rounded-full bg-background-tertiary shadow-md
               group-hover:shadow-lg transition-shadow duration-200
               flex items-center justify-center"
      >
        <svg class="w-12 h-12 text-foreground-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
      <!-- Play overlay -->
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity
                  rounded-full flex items-center justify-center">
        <div class="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center
                    transform scale-90 group-hover:scale-100 transition-transform shadow-lg">
          <svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
    <h3 class="font-medium truncate group-hover:text-primary-400 transition-colors">
      {{ artist.name }}
    </h3>
    <p class="text-sm text-foreground-muted">{{ t('common.artist') }}</p>

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
