<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const candidateUrls = computed(() =>
  [props.artist.picture_medium, props.artist.picture_big, props.artist.picture]
    .filter((u): u is string => !!u)
)

const candidateIndex = ref(0)
const allPicturesFailed = ref(false)

const pictureUrl = computed(() => candidateUrls.value[candidateIndex.value] ?? '')

function handleImageError() {
  if (candidateIndex.value < candidateUrls.value.length - 1) {
    candidateIndex.value++
  } else {
    allPicturesFailed.value = true
  }
}

watch(() => props.artist.id, () => {
  candidateIndex.value = 0
  allPicturesFailed.value = false
})

function navigate() {
  // Qobuz artists load from the Qobuz backend (their id isn't a Deezer id).
  const query = (props.artist as any).source === 'qobuz' ? { source: 'qobuz' } : undefined
  router.push({ path: `/artist/${props.artist.id}`, query })
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
        v-if="pictureUrl && !allPicturesFailed"
        :src="pictureUrl"
        :alt="artist.name"
        loading="lazy"
        decoding="async"
        class="w-full h-full object-cover rounded-full bg-background-tertiary border border-white/[0.08]
               group-hover:border-primary-500/60 transition-colors duration-200"
        @error="handleImageError"
      />
      <!-- Fallback placeholder when no image or image fails to load -->
      <div
        v-else
        class="w-full h-full rounded-full bg-background-tertiary border border-white/[0.08]
               group-hover:border-primary-500/60 transition-colors duration-200
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
          <svg class="w-6 h-6 text-background-main ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
    <h3 class="text-[13px] font-semibold truncate group-hover:text-primary-400 transition-colors">
      {{ artist.name }}
    </h3>
    <p class="font-mono text-[9.5px] tracking-[0.16em] uppercase text-foreground-muted/70 mt-0.5">{{ t('common.artist') }}</p>

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
