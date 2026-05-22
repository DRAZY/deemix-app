<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const appVersion = ref('')
const runtimeInfo = ref<{ electron: string; chromium: string; node: string; v8: string; os: string } | null>(null)

onMounted(async () => {
  if (window.electronAPI) {
    appVersion.value = await window.electronAPI.getVersion()
    runtimeInfo.value = await window.electronAPI.getRuntimeInfo()
  }
})

function openLink(url: string) {
  if (window.electronAPI) {
    window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank')
  }
}

// What's New — grouped by version, newest first. Older versions are
// summarized into a single "Earlier releases" entry to keep this page
// scannable. Full history lives in CHANGELOG.md.
interface ReleaseNotes {
  version: string
  date: string
  items: string[]
}

const whatsNew: ReleaseNotes[] = [
  {
    version: '1.7.6',
    date: '2026-05-22',
    items: [
      'Full Backup & Restore with per-segment selection (#72) -- New Backup & Restore section in Settings produces a single .deemix-backup.json file containing your entire local app state: settings, download-quality profiles, synced playlists, synced artists, favourites, and (optionally) credentials. On both export and restore you can tick exactly which segments to include — defaults are everything except credentials. The restore-side modal previews the file (export date, app version, per-segment counts) before anything is applied so you can spot the wrong file before clicking apply. Restoring sync state preserves the engine\'s known-track and last-synced timestamps, so a restore doesn\'t trigger a re-download of music already on disk. Replaces the previous Export/Import buttons (which only covered settings + profiles) — old configuration files still import via a fallback for backward-compat.',
      'Credentials are opt-in on both sides -- The Credentials checkbox (Deezer ARL + Spotify client ID/secret/username) defaults OFF for both export and restore, and triggers a confirmation modal when ticked. Sharing a backup file with credentials baked in is a footgun; this keeps it explicit.'
    ]
  },
  {
    version: '1.7.5',
    date: '2026-05-21',
    items: [
      'Bulk "Sync all favourite playlists/artists" at any scale (#70, third fix) -- After v1.7.3 fixed the state-write race and v1.7.4 surfaced bulk failures in the toast, the truncation still hit users with hundreds of favourites. Root cause turned out to live one layer higher: the local API\'s per-IP rate limit (120 requests/minute on /api/sync/*) was silently 429-ing the latter ~60% of the loop\'s sequential POSTs, because 300 favourites fire 300 round-trips inside a single 60-second window. The structural fix replaces the loop with a single bulk endpoint -- POST /api/sync/playlists/bulk and POST /api/sync/artists/bulk -- so one HTTP request adds N entries with one engine pass, one saveState, one rate-limit budget hit. Per-item success/failure surfaces in the toast as before. Works the same at 30, 300, or 3,000 favourites. Note on what to expect after the toast: every favourite is registered immediately, but actual downloads still respect the 3-concurrent-sync cap and drain through the 60-second scheduler -- so a 300-favourite bulk add will trickle in over the next few hours rather than fanning out into 300 simultaneous downloads. Watch the per-entry status on the Sync page; "added" is not the same as "fully downloaded yet."',
      'Stale-favorite detection now works for entries pinned from Favorites (latent #64 bug) -- The single-add server handlers were silently dropping the origin field clients sent, so favourites-origin entries were getting stored as origin: \'manual\'. That meant the "no longer in your Deezer favourites" badge never lit up for entries you pinned via the Favourites view. Both handlers (playlist + artist) now thread origin through end-to-end.',
      'Selectable release types for artist sync (#71) -- Every artist-sync entry on the Sync page now exposes a release-type filter in its edit dialog: Albums, Singles, EPs, Compilations, Features, plus an optional "only download releases after" date threshold. The engine already supported per-entry filters under the hood; this release surfaces them in the UI so you can have one artist sync albums-only while another pulls singles too. Existing entries keep their stored defaults (Albums + EPs).'
    ]
  },
  {
    version: '1.7.4',
    date: '2026-05-20',
    items: [
      'Editable sync entries (#69) -- Every synced-playlist and synced-artist card on the Sync page now has a pencil-icon button. Click it to rename the entry, change the sync schedule, change the download folder, or (for artists) switch first-sync mode between Subscribe-forward, Download-backlog, and From-a-date. The backend already supported all of these updates; this release exposes them in the UI.',
      'Folder-rename safety -- Renaming a sync entry only affects FUTURE downloads. Files already on disk stay in their original folder; the edit dialog says so in-line so renaming never silently orphans an existing library.'
    ]
  },
  {
    version: '1.7.3',
    date: '2026-05-20',
    items: [
      '"Sync all favourite playlists" dropped 20-30 of 50+ entries on Windows (#68) -- Both sync engines called saveState() from multiple paths without serializing the writes. During a bulk add, each new addPlaylist fired its own saveState AND a fire-and-forget sync whose own saveState checkpoints ran in the background — multiple writers raced on the shared .tmp sibling of safeWriteJson, and on Windows NTFS the torn writes silently dropped recently-pushed entries from disk while the in-memory state held all of them. Fixed by serializing every saveState through a single Promise chain so the next JSON.stringify(this.state) only runs after the previous rename has landed.',
      'Soft-skip when 3-concurrent-sync cap is hit -- Previously the engines threw "Maximum concurrent syncs reached (3)" which under bulk add produced ~47 console errors per 50-favourite run and broke fire-and-forget callers. The over-cap path now returns a no-op result and lets the 60-second scheduler retry once active syncs drain.',
      'Bulk "Sync all favourites" now surfaces failures -- Before, failures were console.error\'d but the toast only mentioned successes, leaving you blind to silent drops. The bulk handlers now count failed adds alongside added/skipped and show an explicit error toast when any add fails.'
    ]
  },
  {
    version: '1.7.0–1.7.2',
    date: '2026-05-15 — 2026-05-20',
    items: [
      'Sync robustness pass (#66, #67) -- Scheduled sync now respects the "skip existing files" setting (it was clobbering ReplayGain-tagged files on first sync), and the sync pool no longer freezes when the downloader skips already-on-disk tracks (the skip path was emitting `progress` but not `complete`, stranding workers for the full 5-minute timeout).',
      'Stack hygiene -- Electron 35 → 39 plus axios/vite/postcss bumps and pinned transitive deps. Closed 40 Dependabot alerts across both releases. Pure runtime/build-tool refresh — no app-code changes.'
    ]
  },
  {
    version: '1.6.x',
    date: '2026-05-14 — 2026-05-15',
    items: [
      'Sync engine launch -- One-click sync for favourite playlists (#60) and a new artist sync engine that watches Deezer discographies and auto-pulls new releases (#61). Per-artist release-type filters (Albums / Singles / EPs / Compilations / Features). Subscribe-forward default so pinning a prolific artist doesn\'t pull a 200-album backlog.',
      'Parallel downloads inside sync -- Sync now downloads tracks in parallel up to your `maxConcurrentDownloads` setting, ~3-5× faster on large playlists (400-track playlist: ~30 min → ~6 min at default 5).',
      'Sync state durability -- Atomic state-file writes (staged .tmp + rename), corrupt-file quarantine on the next launch, sync-badge progress (`Syncing 12/87`), and one-click unfavourite / unpin affordances on cards.',
      'Favourites import upgraded -- "Import from Deezer" now prunes favourites you\'ve un-liked on the Deezer side (#64); the Sync page flags entries whose source playlist/artist is no longer in your Deezer favourites.'
    ]
  },
  {
    version: 'Earlier (1.5.x and below)',
    date: '< 2026-05-14',
    items: [
      'Foundational features -- Playlist Sync (M3U, force full sync, large-playlist support), Spotify→Deezer playlist conversion, Link Analyzer, Charts, New Releases, Downloads dashboard with retry grouping, refreshed app icon.',
      'For per-version detail on these releases, see the GitHub Releases page: https://github.com/DRAZY/deemix-remastered/releases'
    ]
  }
]
</script>

<template>
  <div class="space-y-8 max-w-3xl">
    <!-- App Identity -->
    <div class="card p-8 text-center">
      <div class="flex justify-center mb-4">
        <div class="w-20 h-20 rounded-2xl overflow-hidden">
          <img src="/icon.png" alt="Deemix Remastered" class="w-full h-full object-cover" />
        </div>
      </div>
      <h1 class="text-3xl font-bold mb-1">{{ t('about.appName') }}</h1>
      <p class="text-foreground-muted mb-3">{{ t('about.tagline') }}</p>
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/15 text-primary-400 text-sm font-medium">
        v{{ appVersion }}
      </div>
    </div>

    <!-- What's New -->
    <div class="card p-6">
      <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
        {{ t('about.whatsNew') }}
      </h2>
      <div class="space-y-5">
        <div v-for="release in whatsNew" :key="release.version" class="space-y-2">
          <div class="flex items-baseline gap-2 pb-1 border-b border-zinc-800/60">
            <h3 class="text-sm font-semibold text-foreground">
              {{ release.version === 'Earlier' ? 'Earlier releases' : `v${release.version}` }}
            </h3>
            <span class="text-xs text-foreground-muted">{{ release.date }}</span>
          </div>
          <ul class="space-y-1.5">
            <li v-for="(item, i) in release.items" :key="i" class="flex items-start gap-2 text-sm text-foreground-muted">
              <span class="text-primary-400 mt-0.5 flex-shrink-0">&bull;</span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Runtime Info -->
    <div class="card p-6" v-if="runtimeInfo">
      <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        {{ t('about.runtimeInfo') }}
      </h2>
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-background-tertiary rounded-lg p-3">
          <p class="text-xs text-foreground-muted mb-1">Electron</p>
          <p class="text-sm font-mono">{{ runtimeInfo.electron }}</p>
        </div>
        <div class="bg-background-tertiary rounded-lg p-3">
          <p class="text-xs text-foreground-muted mb-1">Chromium</p>
          <p class="text-sm font-mono">{{ runtimeInfo.chromium }}</p>
        </div>
        <div class="bg-background-tertiary rounded-lg p-3">
          <p class="text-xs text-foreground-muted mb-1">Node.js</p>
          <p class="text-sm font-mono">{{ runtimeInfo.node }}</p>
        </div>
        <div class="bg-background-tertiary rounded-lg p-3">
          <p class="text-xs text-foreground-muted mb-1">V8</p>
          <p class="text-sm font-mono">{{ runtimeInfo.v8 }}</p>
        </div>
      </div>
    </div>

    <!-- Links -->
    <div class="card p-6">
      <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        {{ t('about.links') }}
      </h2>
      <div class="space-y-2">
        <button
          @click="openLink('https://github.com/DRAZY/deemix-remastered')"
          class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-background-tertiary transition-colors text-left"
        >
          <svg class="w-5 h-5 text-foreground-muted flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          <div>
            <p class="text-sm font-medium">{{ t('about.githubRepo') }}</p>
            <p class="text-xs text-foreground-muted">{{ t('about.githubRepoDesc') }}</p>
          </div>
          <svg class="w-4 h-4 text-foreground-muted ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
        <button
          @click="openLink('https://github.com/DRAZY/deemix-remastered/issues')"
          class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-background-tertiary transition-colors text-left"
        >
          <svg class="w-5 h-5 text-foreground-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p class="text-sm font-medium">{{ t('about.reportIssue') }}</p>
            <p class="text-xs text-foreground-muted">{{ t('about.reportIssueDesc') }}</p>
          </div>
          <svg class="w-4 h-4 text-foreground-muted ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Credits & License -->
    <div class="card p-6">
      <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        {{ t('about.credits') }}
      </h2>
      <div class="space-y-3 text-sm text-foreground-muted">
        <p>{{ t('about.builtBy') }}</p>
        <p>{{ t('about.inspiredBy') }}</p>
        <div class="pt-3 border-t border-zinc-800">
          <p class="flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            {{ t('about.license') }}
          </p>
        </div>
      </div>
    </div>

    <!-- Disclaimer -->
    <p class="text-xs text-foreground-muted text-center pb-4">
      {{ t('about.disclaimer') }}
    </p>
  </div>
</template>
