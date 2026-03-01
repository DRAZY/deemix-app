<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isMaximized = ref(false)

// Detect platform - check multiple sources for reliability
const detectPlatform = (): boolean => {
  // Check navigator.platform
  const navPlatform = navigator.platform?.toLowerCase() || ''
  if (navPlatform.includes('mac')) return true

  // Check userAgent as fallback
  const userAgent = navigator.userAgent?.toLowerCase() || ''
  if (userAgent.includes('macintosh') || userAgent.includes('mac os')) return true

  return false
}

const isMac = detectPlatform()

onMounted(async () => {
  if (window.electronAPI) {
    try {
      isMaximized.value = await window.electronAPI.isMaximized()
      window.electronAPI.onMaximizeChange((maximized) => {
        isMaximized.value = maximized
      })
    } catch (error) {
      console.error('Failed to get window state:', error)
    }
  }
})

const minimize = () => window.electronAPI?.minimize()
const maximize = () => window.electronAPI?.maximize()
const close = () => window.electronAPI?.close()
</script>

<template>
  <div
    class="h-9 flex items-center justify-between bg-background-secondary border-b border-zinc-800 drag-region"
    :class="{ 'pl-20': isMac }"
  >
    <!-- App title (center on mac, left on windows) -->
    <div class="flex-1 flex items-center px-4">
      <span class="text-sm font-medium text-foreground-muted">Deemix Remastered</span>
    </div>

    <!-- Window controls (Windows/Linux only) -->
    <div v-if="!isMac" class="flex items-center no-drag" role="group" aria-label="Window controls">
      <button
        @click="minimize"
        :aria-label="t('accessibility.minimizeWindow')"
        class="w-12 h-9 flex items-center justify-center hover:bg-white/10 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
        </svg>
      </button>
      <button
        @click="maximize"
        :aria-label="t('accessibility.maximizeWindow')"
        class="w-12 h-9 flex items-center justify-center hover:bg-white/10 transition-colors"
      >
        <svg v-if="!isMaximized" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="1" stroke-width="2" />
        </svg>
        <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="1" stroke-width="2" />
          <path stroke-width="2" d="M8 6V5a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1h-1" />
        </svg>
      </button>
      <button
        @click="close"
        :aria-label="t('accessibility.closeWindow')"
        class="w-12 h-9 flex items-center justify-center hover:bg-red-500 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
