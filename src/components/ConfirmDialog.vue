<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmStyle?: 'danger' | 'warning' | 'primary'
}>(), {
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  confirmStyle: 'danger'
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const isVisible = ref(false)

watch(() => props.show, (newVal) => {
  isVisible.value = newVal
}, { immediate: true })

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    handleCancel()
  }
}

const confirmButtonClasses = {
  danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  warning: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
  primary: 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'
}
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
            class="bg-background-secondary rounded-lg shadow-xl max-w-md w-full overflow-hidden"
            role="alertdialog"
            aria-modal="true"
            :aria-labelledby="'dialog-title'"
            :aria-describedby="'dialog-description'"
          >
            <!-- Header -->
            <div class="px-6 pt-6 pb-4">
              <div class="flex items-start gap-4">
                <!-- Warning Icon -->
                <div
                  class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  :class="{
                    'bg-red-500/20': confirmStyle === 'danger',
                    'bg-yellow-500/20': confirmStyle === 'warning',
                    'bg-primary-500/20': confirmStyle === 'primary'
                  }"
                >
                  <svg
                    class="w-5 h-5"
                    :class="{
                      'text-red-400': confirmStyle === 'danger',
                      'text-yellow-400': confirmStyle === 'warning',
                      'text-primary-400': confirmStyle === 'primary'
                    }"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      v-if="confirmStyle === 'danger'"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                    <path
                      v-else-if="confirmStyle === 'warning'"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                    <path
                      v-else
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>

                <div class="flex-1">
                  <h3 id="dialog-title" class="text-lg font-semibold text-foreground">
                    {{ title }}
                  </h3>
                  <p id="dialog-description" class="mt-2 text-sm text-foreground-muted">
                    {{ message }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="px-6 py-4 bg-background-tertiary flex justify-end gap-3">
              <button
                @click="handleCancel"
                class="px-4 py-2 text-sm font-medium text-foreground-muted bg-background-secondary hover:bg-background-main rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-background-secondary"
              >
                {{ cancelText }}
              </button>
              <button
                @click="handleConfirm"
                class="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-secondary"
                :class="confirmButtonClasses[confirmStyle]"
              >
                {{ confirmText }}
              </button>
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
