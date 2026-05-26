<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '../stores/toastStore'

const { t } = useI18n()
const toastStore = useToastStore()

const serverPort = ref(6595)
const folder = ref<string>('')
const isScanning = ref(false)
const isRunning = ref(false)
const dryRun = ref(false)
const cancelRequested = ref(false)

interface ScannedFile {
  path: string
  name: string
  format: 'mp3' | 'flac' | null
  isrc: string | null
  status: 'matched' | 'no-isrc' | 'unsupported' | 'unreadable'
}
interface TagChange { field: string; from: string | null; to: string }
interface FileResult {
  status: 'updated' | 'skipped' | 'failed' | 'preview' | 'pending'
  changes: TagChange[]
  reason?: string
  error?: string
}

const files = ref<ScannedFile[]>([])
const results = reactive<Record<string, FileResult>>({})
const progress = reactive({ current: 0, total: 0 })

// Fields the public API can source. UPC + Label default ON (the gap users hit);
// the rest are opt-in so we never silently overwrite carefully-tagged data.
const fieldKeys = [
  'albumBarcode', 'albumLabel', 'isrc', 'year', 'date', 'bpm',
  'trackNumber', 'trackTotal', 'discNumber', 'albumArtist', 'album', 'artist', 'title'
] as const
type FieldKey = typeof fieldKeys[number]
const fields = reactive<Record<FieldKey, boolean>>({
  albumBarcode: true, albumLabel: true, isrc: false, year: false, date: false, bpm: false,
  trackNumber: false, trackTotal: false, discNumber: false, albumArtist: false,
  album: false, artist: false, title: false
})

const matchedFiles = computed(() => files.value.filter(f => f.status === 'matched'))
const skippedCount = computed(() => files.value.filter(f => f.status !== 'matched').length)
const anyFieldSelected = computed(() => fieldKeys.some(k => fields[k]))

const summary = computed(() => {
  let updated = 0, skipped = 0, failed = 0
  for (const r of Object.values(results)) {
    if (r.status === 'updated' || r.status === 'preview') updated++
    else if (r.status === 'skipped') skipped++
    else if (r.status === 'failed') failed++
  }
  return { updated, skipped, failed }
})

onMounted(async () => {
  if (window.electronAPI) serverPort.value = await window.electronAPI.getServerPort()
})

function apiUrl(path: string) { return `http://127.0.0.1:${serverPort.value}${path}` }

async function pickFolder() {
  if (!window.electronAPI?.selectFolder) return
  const picked = await window.electronAPI.selectFolder(folder.value || undefined)
  if (picked) {
    folder.value = picked
    files.value = []
    Object.keys(results).forEach(k => delete results[k])
  }
}

async function scan() {
  if (!folder.value) return
  isScanning.value = true
  files.value = []
  Object.keys(results).forEach(k => delete results[k])
  try {
    const res = await fetch(apiUrl('/api/retag/scan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: folder.value })
    })
    const data = await res.json()
    if (data.error) { toastStore.error(data.error); return }
    files.value = data.files || []
    if (matchedFiles.value.length === 0) {
      toastStore.info(t('retag.noIsrcWarning'))
    }
  } catch (e: any) {
    toastStore.error(e?.message || 'Scan failed')
  } finally {
    isScanning.value = false
  }
}

async function run(preview: boolean) {
  if (matchedFiles.value.length === 0 || !anyFieldSelected.value) return
  dryRun.value = preview
  isRunning.value = true
  cancelRequested.value = false
  Object.keys(results).forEach(k => delete results[k])
  const targets = matchedFiles.value
  progress.current = 0
  progress.total = targets.length

  const selectedFields: Record<string, boolean> = {}
  fieldKeys.forEach(k => { if (fields[k]) selectedFields[k] = true })

  for (const f of targets) {
    if (cancelRequested.value) break
    results[f.path] = { status: 'pending', changes: [] }
    try {
      const res = await fetch(apiUrl('/api/retag/file'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: f.path, fields: selectedFields, dryRun: preview })
      })
      const data = await res.json()
      results[f.path] = data.error
        ? { status: 'failed', changes: [], error: data.error }
        : { status: data.status, changes: data.changes || [], reason: data.reason, error: data.error }
    } catch (e: any) {
      results[f.path] = { status: 'failed', changes: [], error: e?.message || 'request failed' }
    }
    progress.current++
    // Politeness: small gap between public-API calls to avoid hammering Deezer.
    await new Promise(r => setTimeout(r, 250))
  }

  isRunning.value = false
  if (!cancelRequested.value && !preview) {
    toastStore.success(t('retag.summary', summary.value))
  }
}

function cancel() { cancelRequested.value = true }

function resultClass(status?: string) {
  if (status === 'updated' || status === 'preview') return 'text-green-400'
  if (status === 'failed') return 'text-red-400'
  if (status === 'skipped') return 'text-foreground-muted'
  return 'text-foreground-muted'
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-4xl mx-auto p-6 space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold">{{ t('retag.title') }}</h1>
        <p class="text-foreground-muted text-sm mt-1">{{ t('retag.subtitle') }}</p>
        <p class="text-xs text-foreground-muted mt-1">{{ t('retag.freemodeNote') }}</p>
      </div>

      <!-- Folder picker -->
      <div class="bg-background-secondary rounded-xl border border-zinc-800 p-5 space-y-3">
        <label class="text-sm font-medium">{{ t('retag.folder') }}</label>
        <div class="flex gap-2">
          <input
            :value="folder"
            readonly
            :placeholder="t('retag.noFolder')"
            class="input flex-1 text-sm"
          />
          <button class="btn btn-secondary" @click="pickFolder">{{ t('retag.selectFolder') }}</button>
          <button class="btn btn-primary" :disabled="!folder || isScanning" @click="scan">
            {{ isScanning ? t('retag.scanning') : t('retag.scan') }}
          </button>
        </div>
        <p v-if="files.length" class="text-xs text-foreground-muted">
          {{ t('retag.filesFound', { matched: matchedFiles.length, skipped: skippedCount, total: files.length }) }}
        </p>
      </div>

      <!-- Tag selection -->
      <div v-if="matchedFiles.length" class="bg-background-secondary rounded-xl border border-zinc-800 p-5 space-y-3">
        <div>
          <h2 class="text-sm font-medium">{{ t('retag.fields') }}</h2>
          <p class="text-xs text-foreground-muted mt-0.5">{{ t('retag.fieldsHint') }}</p>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label
            v-for="key in fieldKeys"
            :key="key"
            class="flex items-center gap-2 text-sm cursor-pointer select-none"
          >
            <input type="checkbox" v-model="fields[key]" class="accent-primary-500" />
            <span>{{ t('settings.tags.' + key) }}</span>
          </label>
        </div>
      </div>

      <!-- Actions -->
      <div v-if="matchedFiles.length" class="flex items-center gap-2">
        <button
          class="btn btn-secondary"
          :disabled="isRunning || !anyFieldSelected"
          @click="run(true)"
        >
          {{ isRunning && dryRun ? t('retag.previewing') : t('retag.preview') }}
        </button>
        <button
          class="btn btn-primary"
          :disabled="isRunning || !anyFieldSelected"
          @click="run(false)"
        >
          {{ isRunning && !dryRun ? t('retag.running') : t('retag.run', { count: matchedFiles.length }) }}
        </button>
        <button v-if="isRunning" class="btn btn-ghost" @click="cancel">{{ t('retag.cancel') }}</button>
        <div v-if="isRunning" class="text-sm text-foreground-muted ml-2">
          {{ progress.current }} / {{ progress.total }}
        </div>
      </div>

      <!-- Progress bar -->
      <div v-if="isRunning" class="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-primary-500 transition-all duration-200"
          :style="{ width: progress.total ? (progress.current / progress.total * 100) + '%' : '0%' }"
        ></div>
      </div>

      <!-- Summary -->
      <div v-if="Object.keys(results).length" class="text-sm">
        <span class="text-green-400">{{ summary.updated }} {{ dryRun ? t('retag.preview') : t('retag.resultUpdated') }}</span>
        · <span class="text-foreground-muted">{{ summary.skipped }} {{ t('retag.resultSkipped') }}</span>
        · <span class="text-red-400">{{ summary.failed }} {{ t('retag.resultFailed') }}</span>
      </div>

      <!-- Per-file results -->
      <div v-if="matchedFiles.length" class="bg-background-secondary rounded-xl border border-zinc-800 divide-y divide-zinc-800">
        <div
          v-for="f in matchedFiles"
          :key="f.path"
          class="p-3 flex items-start justify-between gap-3"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm truncate">{{ f.name }}</p>
            <p class="text-xs text-foreground-muted truncate">
              {{ f.format?.toUpperCase() }} · ISRC {{ f.isrc }}
            </p>
            <div v-if="results[f.path]?.changes?.length" class="mt-1 space-y-0.5">
              <p
                v-for="c in results[f.path].changes"
                :key="c.field"
                class="text-xs text-foreground-muted"
              >
                <span class="text-foreground">{{ t('settings.tags.' + c.field) }}</span>:
                <span class="line-through opacity-60">{{ c.from || '—' }}</span>
                → <span class="text-green-400">{{ c.to }}</span>
              </p>
            </div>
            <p v-else-if="results[f.path]?.reason" class="text-xs text-foreground-muted mt-1">
              {{ results[f.path].reason }}
            </p>
            <p v-else-if="results[f.path]?.error" class="text-xs text-red-400 mt-1">
              {{ results[f.path].error }}
            </p>
          </div>
          <span
            v-if="results[f.path]"
            class="text-xs font-medium flex-shrink-0"
            :class="resultClass(results[f.path].status)"
          >
            {{ results[f.path].status === 'pending' ? '…' :
               results[f.path].status === 'preview' ? t('retag.preview') :
               t('retag.result' + results[f.path].status.charAt(0).toUpperCase() + results[f.path].status.slice(1)) }}
          </span>
        </div>
      </div>

      <!-- No-ISRC notice -->
      <p v-if="files.length && skippedCount > 0" class="text-xs text-foreground-muted">
        {{ t('retag.noIsrcWarning') }}
      </p>
    </div>
  </div>
</template>
