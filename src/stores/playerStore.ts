import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Track } from '../types'
import { useSettingsStore } from './settingsStore'

export const usePlayerStore = defineStore('player', () => {
  const currentTrack = ref<Track | null>(null)
  const isPlaying = ref(false)
  const audio = ref<HTMLAudioElement | null>(null)

  const currentTrackId = computed(() => currentTrack.value?.id || null)

  // Qobuz preview clips match Deezer's 30-second samples.
  const QOBUZ_PREVIEW_SECONDS = 30

  async function play(track: Track) {
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

    // Qobuz tracks carry no static preview URL — resolve a signed stream URL
    // from the local server on demand (playback is capped to preview length).
    if (!track.preview && (track as any).source === 'qobuz') {
      try {
        const port = window.electronAPI ? await window.electronAPI.getServerPort() : 6595
        const qobuzId = (track as any).qobuzId ?? track.id
        const r = await fetch(`http://127.0.0.1:${port}/api/qobuz/preview?id=${qobuzId}`)
        if (r.ok) {
          const d = await r.json()
          if (d.url) track.preview = d.url
        }
      } catch { /* no preview available — play() falls through silently */ }
    }

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

      // Qobuz streams are full-length files — cap playback at preview length
      // so the play button samples the track like Deezer's 30s clips.
      if ((track as any).source === 'qobuz') {
        audio.value.addEventListener('timeupdate', () => {
          if (audio.value && audio.value.currentTime >= QOBUZ_PREVIEW_SECONDS) {
            stop()
          }
        })
      }

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
