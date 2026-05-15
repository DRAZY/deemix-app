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
    version: '1.6.6',
    date: '2026-05-15',
    items: [
      'Security: 24 Dependabot alerts closed via dependency bumps -- axios 1.6 → 1.15.2 (closes 14 alerts including 5 highs around prototype pollution, header injection, SSRF), vite 6.0 → 6.4.2 (closes 2 alerts including a high-severity arbitrary file read via the dev-server WebSocket), postcss 8.4 → 8.5.10 (closes 1 XSS alert), plus an overrides block pinning four transitive build-time deps (lodash, @xmldom/xmldom, ip-address, follow-redirects) for 7 more alerts including 4 highs. None of these are runtime-shipped in the app — this is a pure stack hygiene pass. No API changes, no behavior changes.',
      'Electron 35 → 39 major bump deliberately deferred to v1.7.0 to keep this release\'s rollback surface clean.'
    ]
  },
  {
    version: '1.6.5',
    date: '2026-05-15',
    items: [
      'Sync list could be silently lost (Windows) -- Both sync engines used a non-atomic file write for their state. If the process was killed mid-write (Windows Update reboot, antivirus, sudden power loss), the on-disk JSON could end up truncated; the next launch silently reset state to empty and the next save overwrote the corrupt-but-recoverable file with the empty default — destroying the user\'s pinned playlists and artists. Fixed with two surgical changes: state JSON is now staged to a .tmp sibling and atomically renamed into place (rename is atomic on NTFS / APFS / ext4), and any unreadable state file is renamed to a .corrupt-<timestamp> sibling before in-memory state resets, so the bytes survive for forensic recovery.',
      'Affected user note -- If you launched a previous build and saw your sync list go empty, those bytes were already overwritten by the previous version and cannot be auto-recovered. From 1.6.5 forward, any future corruption event is preserved next to the live state file.'
    ]
  },
  {
    version: '1.6.4',
    date: '2026-05-15',
    items: [
      'Remove from favorites, directly from the card -- Every playlist and artist card on the Favorites tabs now has a small X button in the top-left corner. Click it to remove the item from your local favorites cache; any sync entry sourced from that item is auto-removed too. Doesn\'t touch Deezer — re-importing will bring it back if it\'s still favorited on Deezer\'s side.',
      'Sync / Pin buttons are now toggles -- The Sync button on playlist cards and the Pin to Sync button on artist cards used to flip to a disabled "Synced" / "Pinned" state once added. Both are now toggles — click again to remove just the sync entry while keeping the item in favorites. Hover the button to see "Unsync" / "Unpin" to confirm what the click will do.'
    ]
  },
  {
    version: '1.6.3',
    date: '2026-05-15',
    items: [
      'Un-favorited playlists/artists no longer linger (#64) -- "Import from Deezer" was additive-only; now it also prunes locally-cached favorites that you\'ve un-liked on Deezer. The Sync page surfaces a "No longer in your Deezer favorites" notice on sync entries whose source has been un-favorited, with a one-click Remove. Manual sync entries (added directly via the Sync page, not via Favorites → Pin to Sync) are never auto-flagged.',
      'Smarter Import toast -- Was "Imported N favorites"; now shows {imported / pruned / unchanged} plus a follow-up count of any sync entries that just went stale.'
    ]
  },
  {
    version: '1.6.2',
    date: '2026-05-14',
    items: [
      'Sync is 3-5x Faster -- Playlist sync and artist sync now download tracks in parallel up to your configured maxConcurrentDownloads (default 5). Previously sync was serialized to one track at a time regardless of the setting — a 400-track playlist took ~30 minutes; it now takes ~6 minutes at the default, or ~3 minutes if you bump maxConcurrentDownloads to 10. Per-track retry semantics, success/failure aggregation, and the "only mark successfully-downloaded tracks as known" rule are all preserved.',
      'Artist Sync Parallelism -- Each artist sync now downloads its album\'s tracks in parallel (within-album). The cross-album loop stays sequential so the "Album X/Y, currently downloading Z" progress UI still tells you which album is active.'
    ]
  },
  {
    version: '1.6.1',
    date: '2026-05-14',
    items: [
      'Sync Badge Progress -- The "Syncing…" badge on favorite playlist and artist cards now shows the actual progress (e.g., "Syncing 12/87") so you can tell at a glance that the engine is working through the tracklist instead of just spinning. Behaviour fix: previously the badge gave no indication of progress for long-running syncs.',
      'About Page Refresh -- Reorganized "What\'s New" by version with clear date stamps; older releases are summarized for readability.'
    ]
  },
  {
    version: '1.6.0',
    date: '2026-05-14',
    items: [
      'Favorite Playlist One-Click Sync (#60) -- Each row on Favorites → Playlists now has a Sync button that pins the playlist to the sync engine with a 24-hour schedule. A new "Sync all favorite playlists" button at the top bulk-pins everything not already in sync, skipping duplicates. Each card shows a 5-state status badge (Syncing / Synced / Partial / Sync error / Sync pending).',
      'Artist Sync Engine (#61) -- New parallel sync engine that watches pinned Deezer artists\' discographies and auto-downloads new releases on a schedule. Pin an artist from Favorites → Artists; the engine compares the artist\'s /albums against album IDs you\'ve already seen.',
      'Subscribe-Forward First Sync (default) -- On first sync of a newly-pinned artist, the engine captures the current discography as "already known" without downloading anything. From that point forward, only NEW releases trigger downloads. Prevents accidentally pulling a 200-album backlog for prolific artists. Two other first-sync modes available: download-backlog and date-threshold.',
      'Default Artist Filters -- Albums on, EPs on, Singles off, Compilations off, Features off. Configurable per artist at pin time.',
      'Synced Artists Section on Sync Page -- Live progress per artist (shows the current album being downloaded), failed-album expansion, force re-check (right-click), enable/disable, and remove.'
    ]
  },
  {
    version: '1.5.8',
    date: '2026-05-11',
    items: [
      'Missing Cover Art Fix -- Album, playlist, and artist cover images no longer get stuck as the music-note placeholder after a transient network blip. Cards now fall through to the next available cover size and reset cleanly when reused for a different item.',
      'macOS Unsigned-Build Gatekeeper Fix -- Unsigned .dmg artifacts now carry a proper ad-hoc bundle signature so Gatekeeper offers the "Open Anyway" override in System Settings.'
    ]
  },
  {
    version: '1.5.7',
    date: '2026-05-11',
    items: [
      'Deezer CDN Migration Fix -- Resolves the "getaddrinfo ENOTFOUND e-cdns-proxy-*.dzcdn.net" download error introduced when Deezer retired its legacy sharded track CDN. All downloads now go exclusively through the modern Media API.',
      'Clearer Track-Unavailable Errors -- Error message now correctly distinguishes between a missing track and a CDN/DNS failure.'
    ]
  },
  {
    version: 'Earlier',
    date: '< 2026-05-11',
    items: [
      'Playlist Sync (M3U, force full sync, large-playlist support, sync toast fix)',
      'Link Analyzer (timeout protection, region-restricted fallback, clearer errors)',
      'Browse & Discovery (New Releases page, Charts, Spotify public/private badge)',
      'Downloads (statistics dashboard, duplicate album detection, Download Next, retry grouping, default concurrency increase to 5)',
      'Metadata & Files (playlist cover artwork, compilation album fix, track number preservation, delete-files fix)',
      'Refreshed app icon (cobalt + lime paper-cut design)'
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
