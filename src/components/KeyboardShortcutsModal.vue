<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isVisible = ref(false)
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

watch(() => props.show, (newVal) => {
  isVisible.value = newVal
}, { immediate: true })

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isVisible.value) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

const modKey = computed(() => isMac ? '⌘' : 'Ctrl')

const shortcuts = [
  { keys: ['⌘/Ctrl', 'K'], description: 'Focus search' },
  { keys: ['⌘/Ctrl', 'F'], description: 'Focus search (alt)' },
  { keys: ['⌘/Ctrl', 'D'], description: 'Go to downloads' },
  { keys: ['⌘/Ctrl', ','], description: 'Open settings' },
  { keys: ['⌘/Ctrl', 'H'], description: 'Go to home' },
  { keys: ['⌘/Ctrl', '?'], description: 'Show keyboard shortcuts' },
  { keys: ['Esc'], description: 'Close modals / Go back' },
]

// Replace ⌘/Ctrl with the appropriate key for the platform
const displayShortcuts = computed(() => {
  return shortcuts.map(s => ({
    ...s,
    keys: s.keys.map(k => k === '⌘/Ctrl' ? modKey.value : k)
  }))
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isVisible"
        class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        @click="handleBackdropClick"
      >
        <Transition name="scale">
          <div
            v-if="isVisible"
            class="bg-background-secondary rounded-lg shadow-xl max-w-lg w-full overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
          >
            <!-- Header -->
            <div class="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 id="shortcuts-title" class="text-lg font-semibold text-foreground flex items-center gap-2">
                <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Keyboard Shortcuts
              </h2>
              <button
                @click="emit('close')"
                class="p-1 text-foreground-muted hover:text-foreground transition-colors rounded-lg hover:bg-white/10"
                aria-label="Close"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Shortcuts List -->
            <div class="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <div class="space-y-3">
                <div
                  v-for="(shortcut, index) in displayShortcuts"
                  :key="index"
                  class="flex items-center justify-between py-2"
                >
                  <span class="text-foreground-secondary">{{ shortcut.description }}</span>
                  <div class="flex items-center gap-1">
                    <kbd
                      v-for="(key, keyIndex) in shortcut.keys"
                      :key="keyIndex"
                      class="px-2 py-1 text-xs font-mono bg-background-tertiary border border-white/10 rounded text-foreground-muted"
                    >
                      {{ key }}
                    </kbd>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 bg-background-tertiary border-t border-white/5">
              <p class="text-xs text-foreground-muted text-center">
                Press <kbd class="px-1.5 py-0.5 text-xs font-mono bg-background-secondary border border-white/10 rounded">Esc</kbd> to close
              </p>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scale-enter-active,
.scale-leave-active {
  transition: all 0.2s ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
