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
    version: '2.4.2',
    date: '2026-07-24',
    items: [
      'Linux window sizing: on Linux the window can now be resized narrower than before, which helps on smaller displays and lets you place it side by side manually. macOS and Windows are unchanged.'
    ]
  },
  {
    version: '2.4.1',
    date: '2026-07-24',
    items: [
      'Fixed on Linux: 2.4.0 applied the window frame backwards, which left Linux with no title bar and no window controls, and did not restore snapping. Linux now correctly gets a native title bar, so minimize, maximize, and your window manager\'s edge snapping and half tiling all work. This also removes a duplicate title bar that appeared on Windows in 2.4.0. Mac is unaffected.'
    ]
  },
  {
    version: '2.4.0',
    date: '2026-07-24',
    items: [
      'Link Analyzer, multi service: paste a Spotify link and convert it to Deezer, Qobuz, or both. The service picker sits right on the analyzer, and Both compares the two so you can pull each track from wherever it lives.',
      'Cross service availability matrix: in Both mode you see, for every track, whether it is on Deezer, Qobuz, or both, along with how it matched (ISRC or search). Set a preferred service with automatic fallback to the other, or click any track to override it. Tracks on neither service are listed and skipped.',
      'Per track origin: every album and playlist row now expands to its full track list, and each track shows a D or Q chip for where it came from. A mixed download is tagged with both a D and a Q chip on the row so it reads as multi sourced at a glance.',
      'Source chips everywhere: downloads are uniformly tagged now, D for Deezer and Q for Qobuz, so you always know a track\'s origin.',
      'Conversion progress: converting a large playlist shows a live progress bar with real track counts instead of a static Converting message.',
      'Fixed on Linux: the window now uses a native title bar so your desktop\'s edge snapping and half tiling work again (reported on Cinnamon). Mac and Windows keep the custom title bar.'
    ]
  },
  {
    version: '2.3.2',
    date: '2026-07-23',
    items: [
      'Clearer disclaimers. The About notice now covers Deezer, Qobuz, and Spotify and spells out that the app is for personal use with your own accounts, following each service\'s terms. Short reminders were also added at each service\'s connect section in Settings.'
    ]
  },
  {
    version: '2.3.1',
    date: '2026-07-23',
    items: [
      'Fixed: a window closed while maximized now reopens maximized instead of at the normal size. The maximized state is remembered across launches, and the restore-down size is kept so un-maximizing still lands where you expect.'
    ]
  },
  {
    version: '2.3.0',
    date: '2026-07-23',
    items: [
      'Advanced Qobuz connect: if your token was made by another tool (streamrip, qobuz-dl, and the like), Settings, Qobuz now has an optional Advanced section where you can paste that tool\'s App ID and App Secret (and your User ID if you have it) alongside the token. Qobuz ties tokens to the app that created them, so this lets a token from elsewhere connect. The normal username and password login and plain token paste are unchanged.',
      'Album playlist files: with "create playlist file" turned on, album downloads now generate an .m3u8 next to the tracks, the same way playlists do (legacy Deemix parity).',
      'Security: removed an unused image library (sharp) that carried high-severity vulnerabilities. No feature change, just a lighter and safer build.'
    ]
  },
  {
    version: '2.2.3',
    date: '2026-07-22',
    items: [
      'Album covers now open the album (like Spotify, Apple Music, and Deezer) instead of downloading the whole album — the one-click whole-album download is now the GET button that appears on the cover when you hover, so the track list is easy to reach. To download individual songs: open the album, then use Select Tracks.',
      'A hint under the search box now surfaces something the app could already do quietly — paste a Deezer, Spotify, or Qobuz link straight into search, and paste several at once to bulk-download. Localized in every language.',
      'Hardening: Spotify to Deezer conversion no longer misreports a Deezer rate-limit as "no matches" (it retries, then tells you to try again), and truncated downloads are caught instead of saved as corrupt files.'
    ]
  },
  {
    version: '2.2.2',
    date: '2026-07-22',
    items: [
      'The Spotify Link Analyzer no longer fails with an opaque "Failed to parse Spotify response." It now retries temporary Spotify errors and, when a request genuinely can\'t be read, reports the real reason — including that Spotify\'s own editorial and algorithmic playlists (Today\'s Top Hits, RapCaviar, Discover Weekly — links starting 37i9) require a personal Spotify login the app doesn\'t use, following a Spotify API change in late 2024.',
      'Playlist M3U files are now written inside the playlist folder, next to the music, instead of the download root — so they show up where you\'d expect them.'
    ]
  },
  {
    version: '2.2.1',
    date: '2026-07-22',
    items: [
      'Canceling a download now actually stops it. Removing a row from the queue used to only clear it from the screen while the server kept downloading the rest of the album in the background — quitting the app was the only way to stop it. Canceling now halts the remaining tracks immediately, including mid-track, and Clear All does the same.'
    ]
  },
  {
    version: '2.2.0',
    date: '2026-07-20',
    items: [
      'Connect Qobuz with just a token: Settings → Qobuz now has an "Or connect with a token" field for accounts that only hold a user_auth_token or can\'t use the login window — single paste, validated with Qobuz, stored encrypted like every credential.',
      'The retagger now falls back to Qobuz when Deezer can\'t match a file\'s ISRC — matches are accepted only when the ISRC is identical, and rows show a Q chip when Qobuz sourced the tags. Plus: big queues scroll smoothly (browser-native row windowing), album downloads skip a redundant per-track metadata call, and the whole Qobuz era of the app is now translated in all 20 languages.'
    ]
  },
  {
    version: '2.1.2',
    date: '2026-07-19',
    items: [
      'Full genre browsing: the Genres tab is now dual-service. On Qobuz — every genre, with feed tabs (New Releases, Most Streamed, Press Awards, Editor\'s Picks) and a catalog grid that paginates to the end of the genre. On Deezer — Top Tracks and Top Albums now page toward the API\'s 100-entry chart cap.',
      'Security hardening pass — every open CodeQL finding resolved. The Spotify client secret can no longer be written to disk unencrypted under any circumstances (encrypted storage or in-memory only), server error responses are guaranteed stack-trace-free, and the share-link resolver and Deezer proxy pin their destinations even tighter.',
      'Quality-of-life from the late 2.1.1 builds, now formally in the notes: full-title tooltips on truncated names, instant descriptors on every download action icon, the IN LIBRARY chip on duplicate-skipped downloads, and the restored open-folder button on skipped albums.'
    ]
  },
  {
    version: '2.1.1',
    date: '2026-07-19',
    items: [
      'Your download queue and history now survive app updates. They used to live in browser-style storage that macOS updates could wipe — the Transfer Rack and history vanished on every version roll. Both now persist to a real file in the app\'s data folder, alongside your credentials and library index, and existing state migrates automatically.',
      'Large Qobuz playlists and albums now download in full. Qobuz serves track listings 50 at a time and only the first page was fetched — a 273-track playlist queued just 50 tracks. All pages are now followed, so the queue matches the playlist.',
      'Fixed Qobuz getting stuck reporting "session expired" (especially on Windows) even right after a successful reconnect. A wrong app signature and a dead session look identical on the wire, and one was mistaken for the other — signature issues no longer kill your session, and real expiry is still detected.'
    ]
  },
  {
    version: '2.1.0',
    date: '2026-07-18',
    items: [
      'Qobuz is here — true hi-res downloads. Connect your Qobuz account in Settings (a real Qobuz login window; your session is stored encrypted and never written to files), then search Qobuz, paste Qobuz links into the Link Analyzer, or browse the new Channel Q tab: your Purchases and Favorites up top, Qobuz\'s editorial feeds below (New Releases, Editor\'s Picks, Press Awards, Most Streamed), with genre filters, 30-second previews, LOAD MORE / SEE ALL catalog pages, and release-type tabs on artist pages. Downloads are DRM-free FLAC up to 24-bit/192 kHz when your plan and the track allow, fully tagged and organized by your existing folder and naming templates — with complete settings parity with Deezer. A paid Qobuz plan is required.',
      'Quality you can verify: album cards show each release\'s quality ceiling (24/192, CD), and every download reports the tier actually delivered. If a hi-res stream keeps getting cut off, the app steps down one lossless tier only when Bitrate Fallback is on — never silently.',
      'Safety and hygiene: "Delete Files" now moves to the system Trash (never permanent), the download root can never be deleted, downloads cancel instantly mid-stream, and a Genres view lands for Deezer too (#106).'
    ]
  },
  {
    version: '2.0.3',
    date: '2026-07-18',
    items: [
      'Fixed Track Total and Disc Total tags not being written on Deezer downloads (#107). With those options enabled, files were still tagged with just the track/disc number (like "5" instead of "5/12"). Deezer\'s track metadata doesn\'t include the album\'s totals, so the tagger had nothing to write — the totals now come from the album itself and apply to the Track Total / Disc Total tags and the %tracktotal% / %disctotal% filename tokens, on both MP3 and FLAC.'
    ]
  },
  {
    version: '2.0.2',
    date: '2026-07-16',
    items: [
      'Restored the "New Releases" section on the Home tab — and made it show genuinely new, dated releases. Deezer retired the public endpoint that fed it, so the section had quietly disappeared. New Releases now reads Deezer\'s real new-release feed — including your personalized "New releases for you" list when you\'re signed in — newest first, from the last 90 days. The Home tab shows the 30 most recent; See All shows the full window. Old catalog stays out.'
    ]
  },
  {
    version: '2.0.1',
    date: '2026-07-15',
    items: [
      'Fixed lyrics files not matching their audio file\'s name (#104). Synced .lrc (and plain .txt) lyrics were named from the bare track title, so with a naming template like "03 - Song" the lyrics file was called "Song.lrc" and players that match lyrics by filename never found it. Lyrics files now take their name directly from the actual audio file, so they always match — on every download path, including playlist and artist sync.'
    ]
  },
  {
    version: '2.0.0',
    date: '2026-07-14',
    items: [
      'A complete redesign: "Signal Deck." The whole app moves to an industrial-console look — acid chartreuse on blue-black, bold display type, hard edges, and monospaced readouts everywhere. The title bar is now a live status strip with a connection LED, region, quality, real-time throughput, and a clock. The sidebar became a numbered channel rail with a download-activity sparkline. The download panel is a "Transfer Rack": each download is a hardware-style unit with a 16-segment meter and a status edge-light (chartreuse while receiving, green when stored, red on fault, amber on hold). Search is a QUERY command bar with dense console-row results. Signal is the new default theme, but every previous theme is still there, your saved theme is kept, and light mode gets its own tuned "paper console" variant. Under the hood nothing moved: downloads, sync, retag, and settings all behave exactly as before.',
      'A new identity to go with it: the DM/RM "Console Stack" icon — stacked chartreuse letters with a cyan cursor — now lives on your Dock/taskbar, in the sidebar, and on every OS build.',
      'Album and playlist downloads now show their real combined download speed while running, and the "Alternate version" badge is clickable: it lists exactly which tracks were fulfilled from an ISRC-matched alternate release, in the panel and in history.'
    ]
  },
  {
    version: '1.10.34',
    date: '2026-07-13',
    items: [
      'Fixed resync creating wrong-numbered duplicate tracks (#102, #103). When a track was fulfilled from an alternate release, its corrected track/disc numbers could leak into a shared metadata cache and poison a later download of the same track — so a force resync could re-download an existing track under a wrong name like "1-01" instead of its real position. Track metadata is now defensively copied, and album downloads pass the tracklist\'s authoritative position as a backstop.'
    ]
  },
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
    version: 'Earlier',
    date: '< 2026-06-24',
    items: [
      'Earlier 1.9–1.10 releases and foundational features — Sync engine, Spotify→Deezer conversion, Link Analyzer, Charts, New Releases, library dedup, retagging, and many fixes.',
      'Full version-by-version history is on the changelog: https://github.com/DRAZY/deemix-remastered/releases'
    ]
  }
]
</script>

<template>
  <div class="space-y-8 max-w-3xl">
    <!-- App Identity -->
    <div class="bg-background-secondary/60 border border-white/[0.08] p-8 text-center">
      <div class="flex justify-center mb-4">
        <div class="w-20 h-20 overflow-hidden border border-white/[0.08]">
          <img src="/icon.png" alt="Deemix Remastered" class="w-full h-full object-cover" />
        </div>
      </div>
      <h1 class="font-display uppercase text-[26px] tracking-[0.02em] mb-1">{{ t('about.appName') }}</h1>
      <p class="text-foreground-muted mb-3">{{ t('about.tagline') }}</p>
      <div class="inline-flex items-center px-2 py-1 font-mono text-[11px] tracking-[0.08em] bg-primary-500/10 text-primary-400 border border-primary-500/30">
        v{{ appVersion }}
      </div>
    </div>

    <!-- What's New -->
    <div class="bg-background-secondary/60 border border-white/[0.08] p-6">
      <h2 class="font-display text-[15px] uppercase tracking-[0.06em] mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
        {{ t('about.whatsNew') }}
      </h2>
      <div class="space-y-5">
        <div v-for="release in whatsNew" :key="release.version" class="space-y-2">
          <div class="flex items-baseline gap-2 pb-1 border-b border-white/[0.06]">
            <h3 class="font-mono text-[12px] font-semibold text-foreground">
              {{ release.version === 'Earlier' ? 'Earlier releases' : `v${release.version}` }}
            </h3>
            <span class="font-mono text-[10px] tracking-[0.04em] text-foreground-muted">{{ release.date }}</span>
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
    <div class="bg-background-secondary/60 border border-white/[0.08] p-6" v-if="runtimeInfo">
      <h2 class="font-display text-[15px] uppercase tracking-[0.06em] mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        {{ t('about.runtimeInfo') }}
      </h2>
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-background-main/60 border border-white/[0.06] p-3">
          <p class="font-mono text-[9.5px] tracking-[0.2em] uppercase text-foreground-muted mb-1">Electron</p>
          <p class="text-sm font-mono">{{ runtimeInfo.electron }}</p>
        </div>
        <div class="bg-background-main/60 border border-white/[0.06] p-3">
          <p class="font-mono text-[9.5px] tracking-[0.2em] uppercase text-foreground-muted mb-1">Chromium</p>
          <p class="text-sm font-mono">{{ runtimeInfo.chromium }}</p>
        </div>
        <div class="bg-background-main/60 border border-white/[0.06] p-3">
          <p class="font-mono text-[9.5px] tracking-[0.2em] uppercase text-foreground-muted mb-1">Node.js</p>
          <p class="text-sm font-mono">{{ runtimeInfo.node }}</p>
        </div>
        <div class="bg-background-main/60 border border-white/[0.06] p-3">
          <p class="font-mono text-[9.5px] tracking-[0.2em] uppercase text-foreground-muted mb-1">V8</p>
          <p class="text-sm font-mono">{{ runtimeInfo.v8 }}</p>
        </div>
      </div>
    </div>

    <!-- Links -->
    <div class="bg-background-secondary/60 border border-white/[0.08] p-6">
      <h2 class="font-display text-[15px] uppercase tracking-[0.06em] mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        {{ t('about.links') }}
      </h2>
      <div class="space-y-2">
        <button
          @click="openLink('https://github.com/DRAZY/deemix-remastered')"
          class="w-full flex items-center gap-3 p-3 border border-white/[0.06] hover:border-white/20 hover:bg-background-tertiary/50 transition-colors text-left"
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
          class="w-full flex items-center gap-3 p-3 border border-white/[0.06] hover:border-white/20 hover:bg-background-tertiary/50 transition-colors text-left"
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
    <div class="bg-background-secondary/60 border border-white/[0.08] p-6">
      <h2 class="font-display text-[15px] uppercase tracking-[0.06em] mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        {{ t('about.credits') }}
      </h2>
      <div class="space-y-3 text-sm text-foreground-muted">
        <p>{{ t('about.builtBy') }}</p>
        <p>{{ t('about.inspiredBy') }}</p>
        <div class="pt-3 border-t border-white/[0.06]">
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
