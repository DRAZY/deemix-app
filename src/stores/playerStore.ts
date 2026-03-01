import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Track } from '../types'
import { useSettingsStore } from './settingsStore'

export const usePlayerStore = defineStore('player', () => {
  const currentTrack = ref<Track | null>(null)
  const isPlaying = ref(false)
  const audio = ref<HTMLAudioElement | null>(null)

  const currentTrackId = computed(() => currentTrack.value?.id || null)

  function play(track: Track) {
    const settingsStore = useSettingsStore()

    // If clicking the same track, toggle playback
    if (currentTrack.value?.id === track.id) {
      if (isPlaying.value) {
        stop()
      } else if (audio.value) {
        audio.value.volume = settingsStore.settings.previewVolume / 100
        audio.value.play()
        isPlaying.value = true
      }
      return
    }

    // Stop any existing playback
    stop()

    // Start new track if it has a preview
    if (track.preview) {
      currentTrack.value = track
      audio.value = new Audio(track.preview)

      // Apply preview volume setting
      audio.value.volume = settingsStore.settings.previewVolume / 100

      audio.value.addEventListener('ended', () => {
        isPlaying.value = false
        currentTrack.value = null
      })

      audio.value.addEventListener('error', () => {
        isPlaying.value = false
        currentTrack.value = null
      })

      audio.value.play()
      isPlaying.value = true
    }
  }

  function stop() {
    if (audio.value) {
      audio.value.pause()
      audio.value.currentTime = 0
      audio.value = null
    }
    isPlaying.value = false
    currentTrack.value = null
  }

  function isTrackPlaying(trackId: number | string): boolean {
    return isPlaying.value && currentTrack.value?.id === trackId
  }

  return {
    currentTrack,
    isPlaying,
    currentTrackId,
    play,
    stop,
    isTrackPlaying
  }
})
