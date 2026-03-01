<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  title?: string
  message?: string
  showRetry?: boolean
  compact?: boolean
}>(), {
  showRetry: true,
  compact: false
})

const emit = defineEmits<{
  (e: 'retry'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="compact ? 'py-8' : 'py-16'"
  >
    <!-- Error Icon -->
    <div
      class="rounded-full bg-red-500/20 flex items-center justify-center mb-4"
      :class="compact ? 'w-12 h-12' : 'w-16 h-16'"
    >
      <svg
        :class="compact ? 'w-6 h-6' : 'w-8 h-8'"
        class="text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    </div>

    <!-- Title -->
    <h3 :class="compact ? 'text-base' : 'text-lg'" class="font-semibold text-foreground mb-2">
      {{ title || t('errors.somethingWentWrong') }}
    </h3>

    <!-- Message -->
    <p :class="compact ? 'text-sm max-w-xs' : 'text-base max-w-md'" class="text-foreground-muted mb-4">
      {{ message || t('errors.tryAgainLater') }}
    </p>

    <!-- Retry Button -->
    <button
      v-if="showRetry"
      @click="emit('retry')"
      class="btn btn-primary flex items-center gap-2"
      :class="compact ? 'text-sm' : ''"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {{ t('errors.retry') }}
    </button>
  </div>
</template>
