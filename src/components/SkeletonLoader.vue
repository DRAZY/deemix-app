<script setup lang="ts">
defineProps<{
  type?: 'text' | 'circle' | 'card' | 'track' | 'album'
  width?: string
  height?: string
  count?: number
}>()
</script>

<template>
  <!-- Text skeleton (default) -->
  <template v-if="type === 'text' || !type">
    <div
      v-for="i in (count || 1)"
      :key="i"
      class="skeleton-loader rounded"
      :style="{
        width: width || '100%',
        height: height || '1rem',
        marginBottom: count && i < count ? '0.5rem' : undefined
      }"
    />
  </template>

  <!-- Circle skeleton (for avatars) -->
  <template v-else-if="type === 'circle'">
    <div
      class="skeleton-loader rounded-full"
      :style="{
        width: width || '3rem',
        height: height || width || '3rem'
      }"
    />
  </template>

  <!-- Card skeleton -->
  <template v-else-if="type === 'card'">
    <div class="skeleton-card bg-background-card rounded-lg p-4">
      <div class="skeleton-loader rounded-lg mb-3" style="width: 100%; aspect-ratio: 1" />
      <div class="skeleton-loader rounded mb-2" style="width: 80%; height: 1rem" />
      <div class="skeleton-loader rounded" style="width: 60%; height: 0.875rem" />
    </div>
  </template>

  <!-- Track skeleton (for track lists) -->
  <template v-else-if="type === 'track'">
    <div
      v-for="i in (count || 1)"
      :key="i"
      class="flex items-center gap-4 p-3 bg-background-card rounded-lg"
      :class="{ 'mb-2': count && i < count }"
    >
      <div class="skeleton-loader rounded" style="width: 40px; height: 40px" />
      <div class="flex-1">
        <div class="skeleton-loader rounded mb-2" style="width: 60%; height: 1rem" />
        <div class="skeleton-loader rounded" style="width: 40%; height: 0.75rem" />
      </div>
      <div class="skeleton-loader rounded" style="width: 50px; height: 0.875rem" />
    </div>
  </template>

  <!-- Album skeleton (grid item) -->
  <template v-else-if="type === 'album'">
    <div
      v-for="i in (count || 1)"
      :key="i"
      class="skeleton-album"
    >
      <div class="skeleton-loader rounded-lg mb-2" style="width: 100%; aspect-ratio: 1" />
      <div class="skeleton-loader rounded mb-1" style="width: 85%; height: 0.875rem" />
      <div class="skeleton-loader rounded" style="width: 60%; height: 0.75rem" />
    </div>
  </template>
</template>

<style scoped>
.skeleton-loader {
  background: linear-gradient(
    90deg,
    var(--color-background-secondary) 25%,
    var(--color-background-hover) 50%,
    var(--color-background-secondary) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton-card {
  width: 100%;
}

.skeleton-album {
  width: 100%;
}
</style>
