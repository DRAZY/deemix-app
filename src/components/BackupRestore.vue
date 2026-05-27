<script setup lang="ts">
// Backup & Restore (#72) — per-segment selection on both export and restore.
// Defaults to "everything ticked" except Credentials, which is opt-in on both
// sides because including ARL/Spotify in a shareable file is a footgun.

import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBackupStore, type SegmentCounts, type SelectedSegments, type BackupFile, type ApplyResult } from '../stores/backupStore'
import { useSyncStore } from '../stores/syncStore'
import { useArtistSyncStore } from '../stores/artistSyncStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { useProfileStore } from '../stores/profileStore'
import { useToastStore } from '../stores/toastStore'

const { t } = useI18n()
const backupStore = useBackupStore()
const syncStore = useSyncStore()
const artistSyncStore = useArtistSyncStore()
const favoritesStore = useFavoritesStore()
const profileStore = useProfileStore()
const toastStore = useToastStore()

// --- Export side state -------------------------------------------------------

const exportSelected = ref<SelectedSegments>({
  settings: true,
  profiles: true,
  syncedPlaylists: true,
  syncedArtists: true,
  favourites: true,
  credentials: false  // opt-in
})

// Live counts so the user can see what they're about to include.
const exportCounts = computed(() => ({
  settings: 1,
  profiles: profileStore.profiles.filter(p => !p.isBuiltIn).length,
  syncedPlaylists: syncStore.playlists.length,
  syncedArtists: artistSyncStore.artists.length,
  favourites: favoritesStore.favorites.length,
  credentials: 1
}))

const isExporting = ref(false)

// --- Per-profile picker (v1.8.0) -------------------------------------------
// Lets the user narrow the Profiles segment to a chosen subset (e.g. only
// "Maximus" out of {Maximus, Drew, Audiophile}). When all custom profiles
// are selected (or the segment is off), the backup file is byte-identical to
// what v1.7.9 produced — `profileIds` is omitted from SelectedSegments.

const exportProfilePickerOpen = ref(false)
const exportSelectedProfileIds = ref<Set<string>>(new Set())
const exportProfilesParentRef = ref<HTMLInputElement | null>(null)

const allCustomProfileIds = computed(() =>
  profileStore.profiles.filter(p => !p.isBuiltIn).map(p => p.id)
)

// Seed selection = all-custom; auto-include newly-created profiles, drop
// any that were deleted. Preserves explicit deselections across rerenders.
watch(allCustomProfileIds, (curr, prev) => {
  if (!prev) {
    exportSelectedProfileIds.value = new Set(curr)
    return
  }
  const next = new Set(exportSelectedProfileIds.value)
  for (const id of curr) if (!prev.includes(id)) next.add(id)
  for (const id of Array.from(next)) if (!curr.includes(id)) next.delete(id)
  exportSelectedProfileIds.value = next
}, { immediate: true })

const exportProfileTotal = computed(() => allCustomProfileIds.value.length)
const exportProfileCount = computed(() => exportSelectedProfileIds.value.size)
const exportProfilesAllSelected = computed(() =>
  exportProfileTotal.value > 0 && exportProfileCount.value === exportProfileTotal.value
)
const exportProfilesMixed = computed(() =>
  exportProfileCount.value > 0 && exportProfileCount.value < exportProfileTotal.value
)

// indeterminate is a DOM-property-only attribute — set imperatively via ref.
watch(
  [() => exportSelected.value.profiles, exportProfilesMixed],
  ([profilesOn, mixed]) => {
    if (exportProfilesParentRef.value) {
      exportProfilesParentRef.value.indeterminate = !!(profilesOn && mixed)
    }
  },
  { immediate: true, flush: 'post' }
)

function toggleExportProfile(id: string) {
  const next = new Set(exportSelectedProfileIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  exportSelectedProfileIds.value = next
}

function exportSelectAllProfiles() {
  exportSelectedProfileIds.value = new Set(allCustomProfileIds.value)
}

function exportSelectNoneProfiles() {
  exportSelectedProfileIds.value = new Set()
}

async function doExport() {
  if (isExporting.value) return
  // Soft confirmation when the user is about to write credentials into the file.
  if (exportSelected.value.credentials) {
    const ok = confirm(t('settings.backup.credentialsExportConfirm'))
    if (!ok) return
  }
  isExporting.value = true
  try {
    // Pass profileIds only when the user has narrowed the picker; full
    // selection sends undefined so the backup file is byte-identical to
    // what v1.7.9 produced.
    const selected: SelectedSegments = {
      ...exportSelected.value,
      profileIds: exportSelected.value.profiles && !exportProfilesAllSelected.value
        ? Array.from(exportSelectedProfileIds.value)
        : undefined
    }
    const file = await backupStore.buildBackup(selected)
    const json = JSON.stringify(file, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const datePart = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `deemix-backup-${datePart}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toastStore.success(t('settings.backup.exportSuccess'))
  } catch (e: any) {
    console.error('[Backup] Export failed:', e)
    toastStore.error(t('settings.backup.exportFailed'))
  } finally {
    isExporting.value = false
  }
}

// --- Restore side state ------------------------------------------------------

const restoreFile = ref<BackupFile | null>(null)
const restoreFileName = ref('')
const restoreCounts = ref<SegmentCounts | null>(null)
const restoreSelected = ref<SelectedSegments>({
  settings: true,
  profiles: true,
  syncedPlaylists: true,
  syncedArtists: true,
  favourites: true,
  credentials: false
})
const showRestoreModal = ref(false)
const isRestoring = ref(false)

// Restore-side per-profile picker. Populated from the loaded backup file.
const restoreProfilePickerOpen = ref(false)
const restoreSelectedProfileIds = ref<Set<string>>(new Set())
const restoreProfilesParentRef = ref<HTMLInputElement | null>(null)

const restoreFileProfileIds = computed(() =>
  (restoreFile.value?.segments.profiles || []).map(p => p.id)
)
const restoreProfileTotal = computed(() => restoreFileProfileIds.value.length)
const restoreProfileCount = computed(() => restoreSelectedProfileIds.value.size)
const restoreProfilesAllSelected = computed(() =>
  restoreProfileTotal.value > 0 && restoreProfileCount.value === restoreProfileTotal.value
)
const restoreProfilesMixed = computed(() =>
  restoreProfileCount.value > 0 && restoreProfileCount.value < restoreProfileTotal.value
)

watch(
  [() => restoreSelected.value.profiles, restoreProfilesMixed],
  ([profilesOn, mixed]) => {
    if (restoreProfilesParentRef.value) {
      restoreProfilesParentRef.value.indeterminate = !!(profilesOn && mixed)
    }
  },
  { immediate: true, flush: 'post' }
)

function toggleRestoreProfile(id: string) {
  const next = new Set(restoreSelectedProfileIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  restoreSelectedProfileIds.value = next
}

function restoreSelectAllProfiles() {
  restoreSelectedProfileIds.value = new Set(restoreFileProfileIds.value)
}

function restoreSelectNoneProfiles() {
  restoreSelectedProfileIds.value = new Set()
}

function formatExportDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// Amber if the backup was created by a newer app version than what's running —
// we still allow the restore but warn the user that unknown segments will drop.
const appVersionWarning = computed(() => {
  if (!restoreFile.value) return false
  const current = '1.10.3'
  // Naive string compare is fine for "newer than" — semver-major bumps would
  // produce a sortable string here too.
  return restoreFile.value.appVersion !== 'unknown'
    && restoreFile.value.appVersion !== 'legacy (deemix-configuration)'
    && restoreFile.value.appVersion > current
})

function pickRestoreFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e: any) => {
    const file = e.target?.files?.[0]
    if (!file) return
    restoreFileName.value = file.name
    const text = await file.text()
    const parsed = backupStore.parseBackup(text)
    if (!parsed.ok) {
      toastStore.error(parsed.error)
      return
    }
    restoreFile.value = parsed.file
    restoreCounts.value = parsed.counts
    // Reset the selection defaults, then DISABLE any segment the file doesn't
    // contain so the user can't tick a no-op checkbox.
    restoreSelected.value = {
      settings: parsed.counts.settings > 0,
      profiles: parsed.counts.profiles > 0,
      syncedPlaylists: parsed.counts.syncedPlaylists > 0,
      syncedArtists: parsed.counts.syncedArtists > 0,
      favourites: parsed.counts.favourites > 0,
      credentials: false  // opt-in even when present
    }
    // Seed the per-profile picker with everything in the file. The user can
    // narrow it via the expandable picker before clicking Restore.
    restoreSelectedProfileIds.value = new Set(restoreFileProfileIds.value)
    restoreProfilePickerOpen.value = false
    showRestoreModal.value = true
  }
  input.click()
}

function closeRestoreModal() {
  if (isRestoring.value) return
  showRestoreModal.value = false
  restoreFile.value = null
  restoreCounts.value = null
  restoreFileName.value = ''
}

async function doRestore() {
  if (!restoreFile.value || isRestoring.value) return
  if (restoreSelected.value.credentials) {
    const ok = confirm(t('settings.backup.credentialsRestoreConfirm'))
    if (!ok) return
  }
  isRestoring.value = true
  try {
    // Same narrowing rule as export — omit profileIds when the picker is
    // fully checked so the restore-side code falls into the existing
    // "include all" path.
    const selected: SelectedSegments = {
      ...restoreSelected.value,
      profileIds: restoreSelected.value.profiles && !restoreProfilesAllSelected.value
        ? Array.from(restoreSelectedProfileIds.value)
        : undefined
    }
    const result = await backupStore.applyBackup(restoreFile.value, selected)
    // Refresh the sync views so the UI reflects the new state immediately
    // instead of waiting for the next manual fetch.
    if (result.syncedPlaylists === 'ok') await syncStore.fetchPlaylists().catch(() => {})
    if (result.syncedArtists === 'ok') await artistSyncStore.fetchArtists().catch(() => {})
    if (result.favourites === 'ok') favoritesStore.loadFavorites()
    surfaceRestoreResult(result)
  } catch (e: any) {
    console.error('[Backup] Restore failed:', e)
    toastStore.error(t('settings.backup.restoreFailed'))
  } finally {
    // Close the modal AND clear restore state regardless of success/error. The
    // toast (success/partial/error/nothing) carries the completion signal —
    // leaving the modal up would hide it behind the overlay.
    isRestoring.value = false
    showRestoreModal.value = false
    restoreFile.value = null
    restoreCounts.value = null
    restoreFileName.value = ''
  }
}

function surfaceRestoreResult(result: ApplyResult) {
  const ok = Object.entries(result)
    .filter(([k, v]) => k !== 'errors' && v === 'ok')
    .map(([k]) => k)
  const errored = Object.entries(result)
    .filter(([k, v]) => k !== 'errors' && v === 'error')
    .map(([k]) => k)

  if (errored.length === 0 && ok.length > 0) {
    toastStore.success(t('settings.backup.restoreSuccess', { count: ok.length }))
  } else if (ok.length > 0 && errored.length > 0) {
    toastStore.error(t('settings.backup.restorePartial', { ok: ok.length, errored: errored.length }))
    console.error('[Backup] Restore partial — errors:', result.errors)
  } else if (errored.length > 0) {
    toastStore.error(t('settings.backup.restoreFailed'))
    console.error('[Backup] Restore failed — errors:', result.errors)
  } else {
    toastStore.info(t('settings.backup.restoreNothing'))
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Description line — the outer collapsible already renders the
         "Backup and Restore Settings" title, so we don't duplicate it here. -->
    <p class="text-sm text-foreground-muted">{{ t('settings.backup.description') }}</p>

    <!-- Export block -->
    <div class="rounded-lg bg-background-main border border-zinc-800 p-4 space-y-3">
      <h3 class="text-sm font-semibold">{{ t('settings.backup.createTitle') }}</h3>
      <p class="text-xs text-foreground-muted">{{ t('settings.backup.createSubtitle') }}</p>

      <div class="space-y-2 pt-1">
        <label class="flex items-center justify-between text-sm">
          <span class="flex items-center gap-2">
            <input type="checkbox" v-model="exportSelected.settings" class="accent-primary-500" />
            {{ t('settings.backup.segment.settings') }}
          </span>
          <span class="text-xs text-foreground-muted" v-if="exportSelected.settings">1</span>
        </label>
        <div>
          <label class="flex items-center justify-between text-sm">
            <span class="flex items-center gap-2">
              <input
                ref="exportProfilesParentRef"
                type="checkbox"
                v-model="exportSelected.profiles"
                class="accent-primary-500"
              />
              {{ t('settings.backup.segment.profiles') }}
              <button
                v-if="exportSelected.profiles && exportProfileTotal > 0"
                type="button"
                @click="exportProfilePickerOpen = !exportProfilePickerOpen"
                class="text-foreground-muted hover:text-foreground transition-colors"
                :aria-label="t('settings.backup.expandProfiles')"
                :aria-expanded="exportProfilePickerOpen"
              >
                <svg class="w-3 h-3" :class="{ 'rotate-90': exportProfilePickerOpen }" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                </svg>
              </button>
            </span>
            <span class="text-xs text-foreground-muted" v-if="exportSelected.profiles">
              <template v-if="exportProfilesMixed">{{ t('settings.backup.subsetCount', { n: exportProfileCount, total: exportProfileTotal }) }}</template>
              <template v-else>{{ exportProfileTotal }}</template>
            </span>
          </label>
          <div
            v-if="exportProfilePickerOpen && exportSelected.profiles && exportProfileTotal > 0"
            class="ml-6 mt-2 space-y-1 rounded-md bg-zinc-900/40 border border-zinc-800 p-2"
          >
            <div class="flex gap-3 text-xs pb-1">
              <button type="button" @click="exportSelectAllProfiles" class="text-primary-400 hover:text-primary-300 transition-colors">{{ t('settings.backup.selectAll') }}</button>
              <span class="text-foreground-muted">·</span>
              <button type="button" @click="exportSelectNoneProfiles" class="text-primary-400 hover:text-primary-300 transition-colors">{{ t('settings.backup.selectNone') }}</button>
            </div>
            <label
              v-for="p in profileStore.profiles.filter(x => !x.isBuiltIn)"
              :key="p.id"
              class="flex items-center gap-2 text-xs cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="exportSelectedProfileIds.has(p.id)"
                @change="toggleExportProfile(p.id)"
                class="accent-primary-500"
              />
              {{ p.name }}
            </label>
          </div>
        </div>
        <label class="flex items-center justify-between text-sm">
          <span class="flex items-center gap-2">
            <input type="checkbox" v-model="exportSelected.syncedPlaylists" class="accent-primary-500" />
            {{ t('settings.backup.segment.syncedPlaylists') }}
          </span>
          <span class="text-xs text-foreground-muted" v-if="exportSelected.syncedPlaylists">{{ exportCounts.syncedPlaylists }}</span>
        </label>
        <label class="flex items-center justify-between text-sm">
          <span class="flex items-center gap-2">
            <input type="checkbox" v-model="exportSelected.syncedArtists" class="accent-primary-500" />
            {{ t('settings.backup.segment.syncedArtists') }}
          </span>
          <span class="text-xs text-foreground-muted" v-if="exportSelected.syncedArtists">{{ exportCounts.syncedArtists }}</span>
        </label>
        <label class="flex items-center justify-between text-sm">
          <span class="flex items-center gap-2">
            <input type="checkbox" v-model="exportSelected.favourites" class="accent-primary-500" />
            {{ t('settings.backup.segment.favourites') }}
          </span>
          <span class="text-xs text-foreground-muted" v-if="exportSelected.favourites">{{ exportCounts.favourites }}</span>
        </label>
        <label class="flex items-center justify-between text-sm pt-1 border-t border-zinc-800">
          <span class="flex items-center gap-2">
            <input type="checkbox" v-model="exportSelected.credentials" class="accent-amber-500" />
            <span class="text-amber-400">{{ t('settings.backup.segment.credentials') }}</span>
          </span>
          <span class="text-xs text-amber-500">{{ t('settings.backup.credentialsWarning') }}</span>
        </label>
      </div>

      <div class="pt-2">
        <button
          @click="doExport"
          :disabled="isExporting"
          class="w-full px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span v-if="isExporting">{{ t('settings.backup.exporting') }}…</span>
          <span v-else>{{ t('settings.backup.exportButton') }}</span>
        </button>
      </div>
    </div>

    <!-- Restore block -->
    <div class="rounded-lg bg-background-main border border-zinc-800 p-4 space-y-3">
      <h3 class="text-sm font-semibold">{{ t('settings.backup.restoreTitle') }}</h3>
      <p class="text-xs text-foreground-muted">{{ t('settings.backup.restoreSubtitle') }}</p>
      <div>
        <button
          @click="pickRestoreFile"
          class="w-full px-4 py-2 text-sm font-medium rounded-lg bg-background-secondary border border-zinc-700 hover:bg-zinc-800 transition-colors"
        >
          {{ t('settings.backup.chooseFile') }}
        </button>
      </div>
    </div>

    <!-- Restore preview modal -->
    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showRestoreModal && restoreFile && restoreCounts"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          @click.self="closeRestoreModal"
        >
          <div class="bg-background-secondary rounded-xl p-6 w-full max-w-md mx-4 shadow-xl space-y-4">
            <div>
              <h3 class="text-lg font-semibold">{{ t('settings.backup.restoreFromTitle') }}</h3>
              <p class="text-xs text-foreground-muted truncate">{{ restoreFileName }}</p>
            </div>

            <div class="text-xs space-y-1 text-foreground-muted">
              <div>{{ t('settings.backup.restoreExportedAt') }}: {{ formatExportDate(restoreFile.exportedAt) }}</div>
              <div>{{ t('settings.backup.restoreAppVersion') }}: {{ restoreFile.appVersion }}</div>
            </div>

            <div v-if="appVersionWarning" class="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
              {{ t('settings.backup.restoreNewerVersionWarning') }}
            </div>

            <p class="text-sm font-medium pt-1">{{ t('settings.backup.restoreContains') }}</p>
            <div class="space-y-2">
              <label class="flex items-center justify-between text-sm" :class="{ 'opacity-40': restoreCounts.settings === 0 }">
                <span class="flex items-center gap-2">
                  <input type="checkbox" v-model="restoreSelected.settings" :disabled="restoreCounts.settings === 0" class="accent-primary-500" />
                  {{ t('settings.backup.segment.settings') }}
                </span>
                <span class="text-xs">{{ restoreCounts.settings > 0 ? t('settings.backup.present') : t('settings.backup.notPresent') }}</span>
              </label>
              <div :class="{ 'opacity-40': restoreCounts.profiles === 0 }">
                <label class="flex items-center justify-between text-sm">
                  <span class="flex items-center gap-2">
                    <input
                      ref="restoreProfilesParentRef"
                      type="checkbox"
                      v-model="restoreSelected.profiles"
                      :disabled="restoreCounts.profiles === 0"
                      class="accent-primary-500"
                    />
                    {{ t('settings.backup.segment.profiles') }}
                    <button
                      v-if="restoreSelected.profiles && restoreProfileTotal > 0"
                      type="button"
                      @click="restoreProfilePickerOpen = !restoreProfilePickerOpen"
                      class="text-foreground-muted hover:text-foreground transition-colors"
                      :aria-label="t('settings.backup.expandProfiles')"
                      :aria-expanded="restoreProfilePickerOpen"
                    >
                      <svg class="w-3 h-3" :class="{ 'rotate-90': restoreProfilePickerOpen }" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                      </svg>
                    </button>
                  </span>
                  <span class="text-xs">
                    <template v-if="restoreSelected.profiles && restoreProfilesMixed">{{ t('settings.backup.subsetCount', { n: restoreProfileCount, total: restoreProfileTotal }) }}</template>
                    <template v-else>{{ restoreCounts.profiles }}</template>
                  </span>
                </label>
                <div
                  v-if="restoreProfilePickerOpen && restoreSelected.profiles && restoreProfileTotal > 0"
                  class="ml-6 mt-2 space-y-1 rounded-md bg-zinc-900/40 border border-zinc-800 p-2"
                >
                  <div class="flex gap-3 text-xs pb-1">
                    <button type="button" @click="restoreSelectAllProfiles" class="text-primary-400 hover:text-primary-300 transition-colors">{{ t('settings.backup.selectAll') }}</button>
                    <span class="text-foreground-muted">·</span>
                    <button type="button" @click="restoreSelectNoneProfiles" class="text-primary-400 hover:text-primary-300 transition-colors">{{ t('settings.backup.selectNone') }}</button>
                  </div>
                  <label
                    v-for="p in (restoreFile?.segments.profiles || [])"
                    :key="p.id"
                    class="flex items-center gap-2 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      :checked="restoreSelectedProfileIds.has(p.id)"
                      @change="toggleRestoreProfile(p.id)"
                      class="accent-primary-500"
                    />
                    {{ p.name }}
                  </label>
                </div>
              </div>
              <label class="flex items-center justify-between text-sm" :class="{ 'opacity-40': restoreCounts.syncedPlaylists === 0 }">
                <span class="flex items-center gap-2">
                  <input type="checkbox" v-model="restoreSelected.syncedPlaylists" :disabled="restoreCounts.syncedPlaylists === 0" class="accent-primary-500" />
                  {{ t('settings.backup.segment.syncedPlaylists') }}
                </span>
                <span class="text-xs">{{ restoreCounts.syncedPlaylists }}</span>
              </label>
              <label class="flex items-center justify-between text-sm" :class="{ 'opacity-40': restoreCounts.syncedArtists === 0 }">
                <span class="flex items-center gap-2">
                  <input type="checkbox" v-model="restoreSelected.syncedArtists" :disabled="restoreCounts.syncedArtists === 0" class="accent-primary-500" />
                  {{ t('settings.backup.segment.syncedArtists') }}
                </span>
                <span class="text-xs">{{ restoreCounts.syncedArtists }}</span>
              </label>
              <label class="flex items-center justify-between text-sm" :class="{ 'opacity-40': restoreCounts.favourites === 0 }">
                <span class="flex items-center gap-2">
                  <input type="checkbox" v-model="restoreSelected.favourites" :disabled="restoreCounts.favourites === 0" class="accent-primary-500" />
                  {{ t('settings.backup.segment.favourites') }}
                </span>
                <span class="text-xs">{{ restoreCounts.favourites }}</span>
              </label>
              <label class="flex items-center justify-between text-sm pt-1 border-t border-zinc-800" :class="{ 'opacity-40': restoreCounts.credentials === 0 }">
                <span class="flex items-center gap-2">
                  <input type="checkbox" v-model="restoreSelected.credentials" :disabled="restoreCounts.credentials === 0" class="accent-amber-500" />
                  <span class="text-amber-400">{{ t('settings.backup.segment.credentials') }}</span>
                </span>
                <span class="text-xs">{{ restoreCounts.credentials > 0 ? t('settings.backup.present') : t('settings.backup.notPresent') }}</span>
              </label>
            </div>

            <p class="text-xs text-foreground-muted bg-zinc-900/40 border border-zinc-800 rounded px-3 py-2">
              {{ t('settings.backup.restoreOverwriteWarning') }}
            </p>

            <div class="flex justify-end gap-2 pt-1">
              <button
                @click="closeRestoreModal"
                :disabled="isRestoring"
                class="px-4 py-2 text-sm rounded-lg text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                @click="doRestore"
                :disabled="isRestoring"
                class="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span v-if="isRestoring">{{ t('settings.backup.restoring') }}…</span>
                <span v-else>{{ t('settings.backup.restoreButton') }}</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
