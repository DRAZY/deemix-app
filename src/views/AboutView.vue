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

// Compact format: 1-3 short bullets per entry, lump older patch releases
// into ranges, link out to GitHub Releases for full per-version detail.
const whatsNew: ReleaseNotes[] = [
  {
    version: '1.10.32',
    date: '2026-07-08',
    items: [
      'Some minor feature enhancements and refinements.'
    ]
  },
  {
    version: '1.10.31',
    date: '2026-07-08',
    items: [
      'Wired up ReplayGain tag writing. The Settings toggle for "Replay Gain" existed for a long time but never actually did anything. Now, when you turn it on, the app writes a standard ReplayGain track-gain tag (an ID3 frame on MP3, a Vorbis comment on FLAC) using Deezer\'s own per-track gain value, the same way the original Deemix did it. Players that understand ReplayGain, like foobar2000, VLC, and Rockbox, use that tag to even out playback volume, so a download can sound closer to how the same track sounds inside the Deezer app instead of playing at the full, un-normalized level of the master. It is metadata only and changes nothing about the audio itself, which stays a bit-for-bit copy. It is off by default, and you can also add it to files you already downloaded from the Refresh tags option or the Retag view. Note that most DJ software does its own volume analysis and ignores this tag, so it mainly helps regular music players.'
    ]
  },
  {
    version: '1.10.30',
    date: '2026-07-06',
    items: [
      'Downloads now show a small badge when a track did not arrive exactly as requested, so two behaviors that used to be silent are now visible. If you ask for 320 kbps or FLAC and Deezer only has a lower bitrate for that track, the download shows a "Lower bitrate" badge, so you know the file was served at what the catalog had rather than re-encoded. And when the exact track is not available for your account (usually region or rights) and the app substitutes an ISRC-matched copy from another release, it shows an "Alternate version" badge, because a different release can be a different master and sound a little different from the one you picked. Hover either badge for the details. Nothing about how audio is downloaded changed. Files are still a bit-for-bit copy of Deezer\'s source. This only makes these two existing outcomes visible instead of hidden.'
    ]
  },
  {
    version: '1.10.29',
    date: '2026-07-03',
    items: [
      'Fixed the album progress bar so the percentage matches the track count. An album could show "1/10" tracks next to a 59% bar at the same time, which looked contradictory. That happened because the percentage was based on how many bytes had downloaded across every track running at once, while the count only reflects tracks that have fully finished, and the concurrency limit lets several tracks download in parallel. The bar now simply tracks the fraction of tracks finished, so 1 of 10 shows as 10%. Single-track downloads still show smooth progress as before.'
    ]
  },
  {
    version: '1.10.28',
    date: '2026-06-30',
    items: [
      'Added an option to resume interrupted downloads on startup (#98). If a download was still going when you closed the app, it can now continue automatically the next time you open it, instead of waiting for you to click retry. Find it under Settings → Downloads → "Resume interrupted downloads on startup". It only runs once you are logged in, already-downloaded tracks are skipped so it picks up where it left off, and it respects your concurrency and pacing limits. Off by default.'
    ]
  },
  {
    version: '1.10.27',
    date: '2026-06-29',
    items: [
      'Confirmed and hardened download concurrency during syncs (#97). The concurrency limit is shared across everything, so running several syncs at once never goes over the number you set (verified directly). The one edge case: a sync that started the moment you opened the app could briefly use the built-in default before your saved setting was applied. Your concurrency and pacing settings now take effect the instant the app starts, before any sync runs.'
    ]
  },
  {
    version: '1.10.26',
    date: '2026-06-25',
    items: [
      'Fixed the album tag sometimes not matching the folder name during sync (#96). The folder is named after the release being downloaded, but the album tag was taken only from the track\'s own metadata — so for tracks that Deezer relinks to a different release, the folder and the tag could name different albums. The album tag now uses the same source as the folder, so they always agree (for both MP3 and FLAC).'
    ]
  },
  {
    version: '1.10.25',
    date: '2026-06-24',
    items: [
      'Fixed Sync ignoring your "create CD folders" setting for multi-disc albums (#95). When syncing an artist, multi-disc albums were dropped straight into the album folder instead of CD1/CD2 subfolders — even with the setting on — which could also create duplicates of albums you\'d already downloaded into CD folders from the artist page. Synced multi-disc albums now go into their CD subfolders, and synced downloads now match album-page downloads for folder names and tags in general.'
    ]
  },
  {
    version: '1.10.24',
    date: '2026-06-24',
    items: [
      'Fixed "Retry failed tracks" putting the retried files in your main download folder instead of back in the album or playlist folder they belong to (#94). The retry used to forget which album or playlist a track came from, so the files landed loose in the download root and you had to find and move them yourself. Now a retried track goes back into its original album folder (with the same naming, tags, and disc layout as the rest of the album) or its playlist folder. Downloading a standalone single is unchanged.'
    ]
  },
  {
    version: '1.10.23',
    date: '2026-06-22',
    items: [
      'Fixed artist sync silently skipping albums it thought were "already downloaded" when they weren\'t (#93). Sync kept an internal list of albums it considered done and trusted it over what was actually on disk — so an album that only partly downloaded (or was never downloaded) got marked complete and skipped on every future sync, and never showed up in the failed list. Now an album is only marked done when all its tracks actually downloaded; tracks that hit a temporary error are retried on the next sync (up to a few times), and genuinely unavailable tracks are reported instead of hidden.',
      'Pinning an artist to Sync from your Favourites now asks how to handle their existing catalog — "Download full discography now" (the new default), "Watch for new releases only," or from a date. Previously it silently chose "watch only," so pinning an artist downloaded nothing and could look broken. (Tip: if some albums are missing on an already-synced artist, right-click its sync button → Force Full Sync to re-pull everything.)'
    ]
  },
  {
    version: '1.10.22',
    date: '2026-06-19',
    items: [
      'Fixed full artist resyncs sometimes skipping a random-looking handful of albums (#93). On a large discography the app could hit Deezer\'s request limit while listing an artist\'s catalog, and the albums that got rate-limited were silently dropped with no retry — which is why it felt random and was hard to reproduce. Artist and playlist sync now pace those catalog lookups and automatically back off and retry instead of dropping anything. In testing, a 90-release artist went from ~40 albums skipped under load to zero.',
      'The Sync page\'s row buttons now show reliable, instant tooltips. Hovering the sync / edit / enable / remove icons used to show only one inconsistent label (sometimes the wrong one bleeding over from a neighboring button) — each button now shows its own label correctly and immediately.'
    ]
  },
  {
    version: '1.10.21',
    date: '2026-06-16',
    items: [
      'New optional setting: "Skip tracks already in my library" (Settings → Downloads, off by default). When on, the app skips downloading any recording you already have — matched by ISRC, not filename — so the same song on a different album, single, or compilation won\'t pile up as a duplicate. Tracks without an ISRC are always downloaded, and nothing is ever deleted.',
      'Got an existing collection? Turn the setting on and click "Index existing library" once — it scans your download folder so the de-dup works against everything you already have, not just new downloads.'
    ]
  },
  {
    version: '1.10.20',
    date: '2026-06-15',
    items: [
      'The Sync page can now be sorted and filtered. Each list (synced playlists and synced artists) has its own search box and a sort menu — by date added, name, last synced, status, or number of tracks downloaded — plus an ascending/descending toggle, so finding a specific playlist or artist in a long list is fast. Your sort choice is remembered between visits; the default order is unchanged.',
      'Clearer artist-separator label (#89). The comma+space option that outputs "Artist A, Artist B" was confusingly labeled "Standard specification (null byte)" — it\'s now "Comma + space (, ) — default" so it\'s easy to find. The separator itself works exactly as before.'
    ]
  },
  {
    version: '1.10.19',
    date: '2026-06-10',
    items: [
      'Pause now actually pauses a download in progress. Previously the Pause button only stopped the next tracks in the queue from starting — whatever was already downloading streamed to the end. Now pressing Pause stops the current download(s) mid-stream, and Resume picks them back up and finishes them. (Paused tracks restart from the beginning on resume, which is near-instant for music files.)'
    ]
  },
  {
    version: '1.10.18',
    date: '2026-06-09',
    items: [
      'Fixed slow skipping of already-downloaded files when Natural Download Pacing was on. Pacing was delaying every track before checking whether it already existed, so re-downloading a library you already have crawled. Skips are now instant again — pacing only applies to tracks actually being downloaded.',
      'Dragging a download up or down the list now actually reorders the download queue, not just the on-screen list — so it really does change what downloads next. (The ↑ "Download next" button still jumps a track straight to the front.)',
      'Fixed the Pause button on the bottom download bar, which previously did nothing. It now pauses and resumes downloads, and shows a play icon while paused.',
      'Clarified the "Release Type" tag label in Settings — it now reads "Release Type (Album / Single / EP)" with a tooltip explaining it, instead of the cryptic "(RELEASETYPE)".'
    ]
  },
  {
    version: '1.10.17',
    date: '2026-06-07',
    items: [
      'Added "Natural Download Pacing" (Settings → Downloads) with three levels: Off (default), Balanced, and Cautious. On Balanced or Cautious, the app adds small random delays between downloads so a large batch doesn\'t hit Deezer all at once — which can reduce the chance Deezer flags your account for unusual activity and prompts a password reset. Off behaves exactly as before at full speed; Balanced spaces downloads moderately; Cautious is slowest and safest. For the most natural pattern, pair Cautious with Concurrent Downloads set to 1.'
    ]
  },
  {
    version: '1.10.15',
    date: '2026-06-05',
    items: [
      'Fixed applying your ARL token in Settings not actually logging the app in. The Settings panel would show "Logged in as <you>", but the sidebar still said "Login with Deezer / Login required to download" and downloads stayed blocked — because the Apply button logged in the server session without updating the app\'s shared login state. Apply now logs in app-wide.'
    ]
  },
  {
    version: '1.10.14',
    date: '2026-06-05',
    items: [
      'Fixed the Release Type tag not being written on downloads (it only appeared if you retagged afterward). The setting was being dropped before it reached the downloader, so new downloads silently skipped it. RELEASETYPE is now written on download as intended; existing retagging is unchanged.'
    ]
  },
  {
    version: '1.10.13',
    date: '2026-06-04',
    items: [
      'You can now backfill the Release Type tag onto music you already downloaded. The Retag Library and the album/playlist "Refresh tags" actions now write RELEASETYPE too, so existing libraries get the same album/single/EP separation in Navidrome without re-downloading. (Same EP caveat applies — Deezer sometimes mislabels EPs.)'
    ]
  },
  {
    version: '1.10.12',
    date: '2026-06-04',
    items: [
      'Added a Release Type tag (RELEASETYPE) so servers like Navidrome can automatically separate albums, singles, and EPs. Enabled by default; toggle it under Settings → Metadata tags. Note: the type comes from Deezer, which is reliable for albums/singles/compilations but sometimes mislabels EPs — so EP detection is best-effort.'
    ]
  },
  {
    version: '1.10.11',
    date: '2026-06-04',
    items: [
      'Extended the v1.10.10 quota fix to the rest of the app: downloading all your favorite albums, downloading selected search results, and pasting a batch of links are now paced the same way, with the same retry-and-report behavior so nothing gets silently dropped. The download path itself also now backs off on rate-limit errors.'
    ]
  },
  {
    version: '1.10.10',
    date: '2026-06-04',
    items: [
      'Fixed "Quota limit exceeded" errors when downloading a large artist discography. The app was firing metadata requests too fast while building the list, tripping Deezer\'s rate limit — which could silently drop some releases from the download queue (even with concurrent downloads set to 1). Requests are now paced, retried with smarter backoff, and any release that still can\'t be loaded is reported instead of vanishing.'
    ]
  },
  {
    version: '1.10.9',
    date: '2026-06-03',
    items: [
      'Fixed the album artist tag on "Various Artists" releases: the folder was already named correctly, but the ALBUMARTIST tag was getting the individual track\'s artist instead of "Various Artists". Tags now match the folder.'
    ]
  },
  {
    version: '1.10.8',
    date: '2026-05-30',
    items: [
      'Fixed downloads that failed with "Track unavailable on Deezer" even though the song plays fine — common on compilation/playlist versions of a track. The app now falls back to the original single release (matched by ISRC) and downloads that instead, the same move you\'d make by hand.'
    ]
  },
  {
    version: '1.10.7',
    date: '2026-05-27',
    items: [
      'Retag Library is now album-aware: it tags every file in an album folder from the one real Deezer album, so track numbers and totals are correct even for songs that were also released as singles (which previously got mis-tagged as 1-of-1).',
      'Results now show a "✓ Already correct" note for tags that already match Deezer, so nothing looks silently skipped.'
    ]
  },
  {
    version: '1.10.2',
    date: '2026-05-27',
    items: [
      'The "Refresh tags" button on albums/playlists now fills in every tag Deezer offers for that release, instead of only the ones enabled in Settings.',
      'The Retag Library now tells you why a tag didn\'t change — "Already up to date" or "Not available on Deezer" (some albums genuinely have no genre on Deezer) — instead of a silent skip.'
    ]
  },
  {
    version: '1.10.1',
    date: '2026-05-26',
    items: [
      'Polish: "Refresh tags" now reads as a tag refresh in the queue (not a download), and is kept out of your download history and stats. Refreshing an album you haven\'t downloaded no longer marks it as downloaded.'
    ]
  },
  {
    version: '1.10.0',
    date: '2026-05-26',
    items: [
      'Retag now has a "Refresh tags" button on any album or playlist — it rewrites tags on the files you already have from that exact release (correct barcode/label every time), with no re-download.',
      'Retag can now write more fields: Genre, Track Length, and Explicit — all from Deezer\'s public catalog.'
    ]
  },
  {
    version: '1.9.0',
    date: '2026-05-26',
    items: [
      'New Retag Library tool (closes #77) — point it at a folder and it rewrites tags on your existing files from Deezer, no re-download and the audio is left untouched. Great for backfilling UPC/Label on older downloads. Matches by ISRC; uses the public catalog (no account needed).'
    ]
  },
  {
    version: '1.8.2',
    date: '2026-05-25',
    items: [
      'UPC and Label now write correctly into file tags when selected (fixes #76). The embedded-tag path still read the empty private-API fields; it now sources both from the public album API, same as the v1.8.1 template fix.'
    ]
  },
  {
    version: '1.8.1',
    date: '2026-05-24',
    items: [
      '%barcode% / %upc% in folder + filename templates now actually substitute the album UPC (fixes #75). v1.8.0 wired the variable but read it from the private track API, which omits the field — sources the value from the public album API instead.'
    ]
  },
  {
    version: '1.8.0',
    date: '2026-05-24',
    items: [
      'New %barcode% / %upc% folder template variable (closes #74) — distinguishes same-titled releases (e.g. a single "abcd" vs an album "abcd") so they don\'t collide on disk.',
      'Per-profile picker in Backup and Restore — expand the Profiles row to back up or restore only the profiles you choose. v1.7.9 backup files keep working unchanged.'
    ]
  },
  {
    version: '1.7.9',
    date: '2026-05-24',
    items: [
      'Restore no longer duplicates profiles on name collision — custom-name match overwrites in place, built-in name match renames to "(Restored)".',
      'New "Semicolon + space" artist-separator option (closes #73). Existing "Semicolon" unchanged.'
    ]
  },
  {
    version: '1.7.8',
    date: '2026-05-22',
    items: [
      'Restore modal now closes on completion with a confirmation toast.',
      'Section renamed to "Backup and Restore Settings" for clarity. Closed ws CVE GHSA-58qx-3vcg-4xpx via overrides.'
    ]
  },
  {
    version: '1.7.3 – 1.7.5',
    date: '2026-05-20 — 2026-05-21',
    items: [
      'Bulk "Sync all favourites" works at any scale (#68, #70) — replaced per-item loop with bulk endpoints; serialized state writes fix Windows drops.',
      'Editable sync entries with pencil icon (#69) — rename, reschedule, change folder, or change first-sync mode per entry.',
      'Selectable release types for artist sync (#71) — Albums / Singles / EPs / Compilations / Features filters per artist.'
    ]
  },
  {
    version: '1.7.0 – 1.7.2',
    date: '2026-05-15 — 2026-05-20',
    items: [
      'Sync robustness pass (#66, #67) — scheduled sync respects "skip existing"; downloader no longer strands workers on skip.',
      'Stack hygiene — Electron 35 → 39, axios/vite/postcss bumps, 40 Dependabot alerts closed.'
    ]
  },
  {
    version: '1.6.x',
    date: '2026-05-14 — 2026-05-15',
    items: [
      'Sync engine launch — one-click sync for favourite playlists (#60) and artist discographies (#61) with per-artist release-type filters.',
      'Parallel downloads inside sync, atomic state-file writes, corrupt-file quarantine, sync-badge progress, and "no longer in favourites" detection (#64).'
    ]
  },
  {
    version: 'Earlier',
    date: '< 2026-05-14',
    items: [
      'Foundational features — Playlist Sync, Spotify→Deezer conversion, Link Analyzer, Charts, New Releases, Downloads dashboard.',
      'Full per-version detail: https://github.com/DRAZY/deemix-remastered/releases'
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
