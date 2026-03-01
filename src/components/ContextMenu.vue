<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

export interface ContextMenuItem {
  label: string
  icon?: string
  action: () => void
  disabled?: boolean
  divider?: boolean
}

const props = defineProps<{
  show: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const adjustedX = ref(props.x)
const adjustedY = ref(props.y)

// Adjust position to keep menu within viewport
function adjustPosition() {
  if (!menuRef.value) return

  const menu = menuRef.value
  const rect = menu.getBoundingClientRect()
  const padding = 8

  let newX = props.x
  let newY = props.y

  // Adjust horizontal position
  if (newX + rect.width > window.innerWidth - padding) {
    newX = window.innerWidth - rect.width - padding
  }
  if (newX < padding) {
    newX = padding
  }

  // Adjust vertical position
  if (newY + rect.height > window.innerHeight - padding) {
    newY = window.innerHeight - rect.height - padding
  }
  if (newY < padding) {
    newY = padding
  }

  adjustedX.value = newX
  adjustedY.value = newY
}

// Handle click outside
function handleClickOutside(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

// Handle escape key
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

function handleItemClick(item: ContextMenuItem) {
  if (item.disabled) return
  item.action()
  emit('close')
}

watch(() => props.show, (show) => {
  if (show) {
    // Reset position first
    adjustedX.value = props.x
    adjustedY.value = props.y
    // Adjust after render
    setTimeout(adjustPosition, 0)
  }
})

watch([() => props.x, () => props.y], () => {
  if (props.show) {
    adjustedX.value = props.x
    adjustedY.value = props.y
    setTimeout(adjustPosition, 0)
  }
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="context-menu">
      <div
        v-if="show"
        ref="menuRef"
        class="fixed z-[9999] min-w-[160px] py-1.5 bg-background-secondary border border-zinc-700 rounded-lg shadow-xl"
        :style="{ left: `${adjustedX}px`, top: `${adjustedY}px` }"
      >
        <template v-for="(item, index) in items" :key="index">
          <div v-if="item.divider" class="my-1 border-t border-zinc-700" />
          <button
            v-else
            @click="handleItemClick(item)"
            class="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 transition-colors"
            :class="item.disabled
              ? 'text-foreground-muted/50 cursor-not-allowed'
              : 'text-foreground hover:bg-white/10'"
            :disabled="item.disabled"
          >
            <!-- Copy icon -->
            <svg v-if="item.icon === 'copy'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <!-- Download icon -->
            <svg v-else-if="item.icon === 'download'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <!-- Link icon -->
            <svg v-else-if="item.icon === 'link'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <!-- Folder icon -->
            <svg v-else-if="item.icon === 'folder'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <!-- Paste icon -->
            <svg v-else-if="item.icon === 'paste'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {{ item.label }}
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu-enter-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.context-menu-leave-active {
  transition: opacity 0.075s ease, transform 0.075s ease;
}
.context-menu-enter-from,
.context-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
