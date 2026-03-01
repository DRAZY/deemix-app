import { ref, watch } from 'vue'

const MAX_HISTORY_ITEMS = 10
const STORAGE_KEY = 'searchHistory'

// Shared state across components
const searchHistory = ref<string[]>([])

// Load from localStorage on first import
const saved = localStorage.getItem(STORAGE_KEY)
if (saved) {
  try {
    searchHistory.value = JSON.parse(saved)
  } catch (e) {
    console.error('Failed to load search history:', e)
  }
}

// Persist changes
watch(searchHistory, (value) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}, { deep: true })

export function useSearchHistory() {
  function addToHistory(query: string) {
    const trimmed = query.trim()
    if (!trimmed) return

    // Remove if already exists (we'll add to front)
    const existingIndex = searchHistory.value.indexOf(trimmed)
    if (existingIndex !== -1) {
      searchHistory.value.splice(existingIndex, 1)
    }

    // Add to front
    searchHistory.value.unshift(trimmed)

    // Limit size
    if (searchHistory.value.length > MAX_HISTORY_ITEMS) {
      searchHistory.value = searchHistory.value.slice(0, MAX_HISTORY_ITEMS)
    }
  }

  function removeFromHistory(query: string) {
    const index = searchHistory.value.indexOf(query)
    if (index !== -1) {
      searchHistory.value.splice(index, 1)
    }
  }

  function clearHistory() {
    searchHistory.value = []
  }

  return {
    searchHistory,
    addToHistory,
    removeFromHistory,
    clearHistory
  }
}
