<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AlbumCard from '../components/AlbumCard.vue'
import ErrorState from '../components/ErrorState.vue'
import EmptyState from '../components/EmptyState.vue'
import { useDownloadStore } from '../stores/downloadStore'
import type { Album } from '../types'

const { t } = useI18n()
const route = useRoute()
const downloadStore = useDownloadStore()

const loading = ref(false)
const error = ref('')
const userName = ref('')
const userPicture = ref('')
const playlists = ref<Album[]>([])

async function loadUser(userId: string) {
  loading.value = true
  error.value = ''
  playlists.value = []
  userName.value = ''

  try {
    const port = window.electronAPI ? await window.electronAPI.getServerPort() : (downloadStore.serverPort || 6595)
    const resp = await fetch(`http://127.0.0.1:${port}/api/user/playlists?id=${encodeURIComponent(userId)}`)
    const data = await resp.json()

    if (!resp.ok) {
      // 404 is the expected answer for a profile with nothing public, not a
      // failure worth a retry button — the server already phrased it for us.
      error.value = data.error || t('userPlaylists.loadFailed')
      return
    }

    userName.value = data.user?.name || ''
    userPicture.value = data.user?.picture || ''
    // The server hands back Deezer playlist objects; AlbumCard renders them
    // with type="playlist", the same shape SearchView already feeds it.
    playlists.value = (data.data || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      cover_small: p.picture_small,
      cover_medium: p.picture_medium,
      cover_big: p.picture_big,
      nb_tracks: p.nb_tracks,
      artist: { name: p.user?.name || userName.value },
    })) as Album[]
  } catch (e: any) {
    error.value = e?.message || t('userPlaylists.loadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(() => loadUser(route.params.id as string))
watch(() => route.params.id, (id) => { if (id) loadUser(id as string) })
</script>

<template>
  <div class="p-8">
    <div v-if="loading" class="text-center py-12 font-mono text-[11px] tracking-[0.2em] uppercase text-foreground-muted">
      {{ t('common.loading') }}
    </div>

    <ErrorState
      v-else-if="error"
      :title="t('userPlaylists.unavailable')"
      :message="error"
      :show-retry="false"
    />

    <template v-else>
      <div class="flex items-center gap-4 mb-8">
        <img
          v-if="userPicture"
          :src="userPicture"
          :alt="userName"
          class="w-16 h-16 object-cover border border-white/[0.08]"
        />
        <div>
          <p class="font-mono text-[10px] tracking-[0.3em] uppercase text-primary-500 mb-1.5">
            {{ t('userPlaylists.creator') }}
          </p>
          <h1 class="font-display uppercase text-[30px] leading-[1.02] tracking-[-0.01em]">{{ userName }}</h1>
          <p class="text-foreground-muted text-sm mt-1">
            {{ t('userPlaylists.playlistCount', { count: playlists.length }) }}
          </p>
        </div>
      </div>

      <EmptyState
        v-if="playlists.length === 0"
        type="playlist"
        :title="t('userPlaylists.noPlaylists')"
      />

      <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        <AlbumCard
          v-for="playlist in playlists"
          :key="playlist.id"
          :album="playlist"
          type="playlist"
        />
      </div>
    </template>
  </div>
</template>
