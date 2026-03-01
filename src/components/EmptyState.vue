<script setup lang="ts">
defineProps<{
  type: 'downloads' | 'search' | 'favorites' | 'noResults' | 'playlist' | 'error'
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="text-center py-12">
    <!-- Downloads Empty State -->
    <svg v-if="type === 'downloads'" class="w-32 h-32 mx-auto mb-6" viewBox="0 0 128 128" fill="none">
      <!-- Cloud -->
      <path d="M100 72a20 20 0 00-20-20 24 24 0 00-46-8 16 16 0 00-6 30.4"
        stroke="currentColor" class="text-foreground-muted/30" stroke-width="3" stroke-linecap="round"/>
      <!-- Download arrow -->
      <path d="M64 56v40" stroke="currentColor" class="text-primary-400" stroke-width="4" stroke-linecap="round"/>
      <path d="M48 80l16 16 16-16" stroke="currentColor" class="text-primary-400" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Sparkles -->
      <circle cx="40" cy="48" r="2" class="fill-primary-300 animate-pulse"/>
      <circle cx="88" cy="56" r="2.5" class="fill-primary-400 animate-pulse" style="animation-delay: 0.3s"/>
      <circle cx="96" cy="76" r="1.5" class="fill-primary-500 animate-pulse" style="animation-delay: 0.6s"/>
      <!-- Base line -->
      <path d="M40 108h48" stroke="currentColor" class="text-foreground-muted/40" stroke-width="3" stroke-linecap="round"/>
    </svg>

    <!-- Search Empty State -->
    <svg v-else-if="type === 'search'" class="w-32 h-32 mx-auto mb-6" viewBox="0 0 128 128" fill="none">
      <!-- Magnifying glass -->
      <circle cx="56" cy="52" r="24" stroke="currentColor" class="text-foreground-muted/40" stroke-width="4"/>
      <path d="M74 70l20 20" stroke="currentColor" class="text-foreground-muted/40" stroke-width="4" stroke-linecap="round"/>
      <!-- Music notes inside -->
      <path d="M52 44v16m0 0c0 2.2-2.7 4-6 4s-6-1.8-6-4 2.7-4 6-4 6 1.8 6 4z"
        stroke="currentColor" class="text-primary-400" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M64 40v12m0 0c0 1.7-2 3-4.5 3S55 53.7 55 52s2-3 4.5-3 4.5 1.3 4.5 3z"
        stroke="currentColor" class="text-primary-300" stroke-width="2" stroke-linecap="round"/>
      <!-- Sparkles -->
      <circle cx="88" cy="36" r="2" class="fill-primary-300 animate-pulse"/>
      <circle cx="28" cy="72" r="2.5" class="fill-primary-400 animate-pulse" style="animation-delay: 0.4s"/>
    </svg>

    <!-- Favorites Empty State -->
    <svg v-else-if="type === 'favorites'" class="w-32 h-32 mx-auto mb-6" viewBox="0 0 128 128" fill="none">
      <!-- Heart outline -->
      <path d="M64 100l-28-28a20 20 0 1128-28 20 20 0 0128 28L64 100z"
        stroke="currentColor" class="text-foreground-muted/30" stroke-width="3" fill="none"/>
      <!-- Inner heart glow -->
      <path d="M64 88l-20-20a14 14 0 1120-20 14 14 0 0120 20L64 88z"
        stroke="currentColor" class="text-primary-400/50" stroke-width="2" fill="none"/>
      <!-- Stars around -->
      <path d="M28 40l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1 2-4z" class="fill-primary-300 animate-pulse"/>
      <path d="M96 52l1.5 3 3 .75-2.25 2.25.75 3-3-1.5-3 1.5.75-3-2.25-2.25 3-.75 1.5-3z"
        class="fill-primary-400 animate-pulse" style="animation-delay: 0.3s"/>
      <path d="M80 28l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2-1.5-1.5 2-.5 1-2z"
        class="fill-primary-500 animate-pulse" style="animation-delay: 0.5s"/>
    </svg>

    <!-- No Results Empty State -->
    <svg v-else-if="type === 'noResults'" class="w-32 h-32 mx-auto mb-6" viewBox="0 0 128 128" fill="none">
      <!-- Face circle -->
      <circle cx="64" cy="64" r="36" stroke="currentColor" class="text-foreground-muted/30" stroke-width="3"/>
      <!-- Eyes -->
      <circle cx="50" cy="56" r="4" class="fill-foreground-muted/50"/>
      <circle cx="78" cy="56" r="4" class="fill-foreground-muted/50"/>
      <!-- Confused mouth -->
      <path d="M48 76c4 4 12 4 16 0s12-4 16 0" stroke="currentColor" class="text-foreground-muted/50" stroke-width="3" stroke-linecap="round" fill="none"/>
      <!-- Question marks -->
      <text x="24" y="40" class="fill-primary-300/60 text-lg font-bold" style="font-size: 16px">?</text>
      <text x="96" y="48" class="fill-primary-400/60 text-lg font-bold" style="font-size: 14px">?</text>
      <text x="88" y="100" class="fill-primary-300/40 text-lg font-bold" style="font-size: 12px">?</text>
    </svg>

    <!-- Playlist Empty State -->
    <svg v-else-if="type === 'playlist'" class="w-32 h-32 mx-auto mb-6" viewBox="0 0 128 128" fill="none">
      <!-- Playlist lines -->
      <rect x="32" y="36" width="64" height="8" rx="4" class="fill-foreground-muted/20"/>
      <rect x="32" y="52" width="48" height="8" rx="4" class="fill-foreground-muted/15"/>
      <rect x="32" y="68" width="56" height="8" rx="4" class="fill-foreground-muted/10"/>
      <!-- Music note -->
      <path d="M88 44v28m0 0c0 4.4-5.4 8-12 8s-12-3.6-12-8 5.4-8 12-8 12 3.6 12 8z"
        stroke="currentColor" class="text-primary-400" stroke-width="3" stroke-linecap="round"/>
      <!-- Plus sign hint -->
      <circle cx="96" cy="96" r="12" class="fill-primary-500/20"/>
      <path d="M96 90v12m-6-6h12" stroke="currentColor" class="text-primary-400" stroke-width="2" stroke-linecap="round"/>
    </svg>

    <!-- Error Empty State -->
    <svg v-else-if="type === 'error'" class="w-32 h-32 mx-auto mb-6" viewBox="0 0 128 128" fill="none">
      <!-- Warning triangle -->
      <path d="M64 28L108 100H20L64 28z" stroke="currentColor" class="text-red-400/50" stroke-width="3" fill="none"/>
      <!-- Exclamation mark -->
      <path d="M64 52v20" stroke="currentColor" class="text-red-400" stroke-width="4" stroke-linecap="round"/>
      <circle cx="64" cy="84" r="3" class="fill-red-400"/>
      <!-- Lightning bolts -->
      <path d="M28 48l-4 8h6l-4 8" stroke="currentColor" class="text-red-300/40" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M100 56l-3 6h5l-3 6" stroke="currentColor" class="text-red-300/40" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>

    <!-- Title and subtitle -->
    <h3 class="text-lg font-medium text-foreground mb-1">{{ title }}</h3>
    <p v-if="subtitle" class="text-foreground-muted text-sm">{{ subtitle }}</p>

    <!-- Slot for action buttons -->
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>
