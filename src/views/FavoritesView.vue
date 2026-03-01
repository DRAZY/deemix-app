<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFavoritesStore } from '../stores/favoritesStore'
import TrackCard from '../components/TrackCard.vue'
import AlbumCard from '../components/AlbumCard.vue'
import ArtistCard from '../components/ArtistCard.vue'
import EmptyState from '../components/EmptyState.vue'

const { t } = useI18n()
const favoritesStore = useFavoritesStore()
const activeTab = ref<'tracks' | 'albums' | 'artists' | 'playlists'>('tracks')

const tabs = computed(() => [
  { id: 'tracks', label: t('favorites.tracks'), count: () => favoritesStore.favoriteTracks.length },
  { id: 'albums', label: t('favorites.albums'), count: () => favoritesStore.favoriteAlbums.length },
  { id: 'artists', label: t('favorites.artists'), count: () => favoritesStore.favoriteArtists.length },
  { id: 'playlists', label: t('favorites.playlists'), count: () => favoritesStore.favoritePlaylists.length }
])

onMounted(() => {
  favoritesStore.loadFavorites()
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">{{ t('favorites.title') }}</h1>

    <!-- Tabs -->
    <div class="flex gap-2 border-b border-zinc-800 pb-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id as typeof activeTab"
        class="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        :class="activeTab === tab.id
          ? 'bg-primary-500 text-white'
          : 'text-foreground-muted hover:text-foreground'"
      >
        {{ tab.label }}
        <span
          v-if="tab.count() > 0"
          class="px-1.5 py-0.5 text-xs rounded-full"
          :class="activeTab === tab.id ? 'bg-white/20' : 'bg-background-tertiary'"
        >
          {{ tab.count() }}
        </span>
      </button>
    </div>

    <!-- Tracks -->
    <div v-if="activeTab === 'tracks'">
      <div v-if="favoritesStore.favoriteTracks.length > 0" class="space-y-1">
        <TrackCard
          v-for="track in favoritesStore.favoriteTracks"
          :key="track.id"
          :track="track"
        />
      </div>
      <EmptyState
        v-else
        type="favorites"
        :title="t('favorites.noFavorites')"
        :subtitle="t('favorites.noFavoritesHint')"
      />
    </div>

    <!-- Albums -->
    <div v-if="activeTab === 'albums'">
      <div v-if="favoritesStore.favoriteAlbums.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <AlbumCard
          v-for="album in favoritesStore.favoriteAlbums"
          :key="album.id"
          :album="album"
        />
      </div>
      <EmptyState
        v-else
        type="favorites"
        :title="t('favorites.noFavorites')"
        :subtitle="t('favorites.noFavoritesHint')"
      />
    </div>

    <!-- Artists -->
    <div v-if="activeTab === 'artists'">
      <div v-if="favoritesStore.favoriteArtists.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <ArtistCard
          v-for="artist in favoritesStore.favoriteArtists"
          :key="artist.id"
          :artist="artist"
        />
      </div>
      <EmptyState
        v-else
        type="favorites"
        :title="t('favorites.noFavorites')"
        :subtitle="t('favorites.noFavoritesHint')"
      />
    </div>

    <!-- Playlists -->
    <div v-if="activeTab === 'playlists'">
      <div v-if="favoritesStore.favoritePlaylists.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <AlbumCard
          v-for="playlist in favoritesStore.favoritePlaylists"
          :key="playlist.id"
          :album="{
            id: playlist.id,
            title: playlist.title,
            cover_medium: playlist.picture_medium,
            artist: { id: 0, name: playlist.creator?.name || t('common.unknown') }
          }"
          type="playlist"
        />
      </div>
      <EmptyState
        v-else
        type="playlist"
        :title="t('favorites.noFavorites')"
        :subtitle="t('favorites.noFavoritesHint')"
      />
    </div>
  </div>
</template>
