<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  show: boolean
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isVisible = ref(false)

watch(() => props.show, (newVal) => {
  if (newVal) {
    isVisible.value = true
    if (props.duration !== 0) {
      setTimeout(() => {
        emit('close')
      }, props.duration || 4000)
    }
  } else {
    isVisible.value = false
  }
}, { immediate: true })

const iconColor = {
  success: 'text-[#22c55e]',
  error: 'text-[#ef4444]',
  info: 'text-primary-500'
}

const bgColor = {
  success: 'bg-background-secondary border-l-2 border-l-[#22c55e]',
  error: 'bg-background-secondary border-l-2 border-l-[#ef4444]',
  info: 'bg-background-secondary border-l-2 border-l-primary-500'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="isVisible"
        class="fixed top-4 right-4 z-[100] max-w-sm"
      >
        <div
          class="flex items-start gap-3 px-4 py-3 border border-white/[0.08] shadow-lg"
          :class="bgColor[type || 'info']"
        >
          <!-- Icon -->
          <div :class="iconColor[type || 'info']" class="flex-shrink-0 mt-0.5">
            <!-- Success icon -->
            <svg v-if="type === 'success'" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <!-- Error icon -->
            <svg v-else-if="type === 'error'" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <!-- Info icon -->
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <!-- Message -->
          <p class="text-sm text-foreground flex-1">{{ message }}</p>

          <!-- Close button -->
          <button
            @click="emit('close')"
            class="flex-shrink-0 text-foreground-muted hover:text-foreground transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity 0.3s ease;
  }
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
