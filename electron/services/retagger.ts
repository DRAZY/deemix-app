// Retagger — rewrite metadata-only on existing local files using the PUBLIC Deezer API.
//
// Design (see MEMORY/WORK/deemix-v1.9.0-retag/ISA.md):
//  - Identity: read each file's ISRC via music-metadata (MP3 + FLAC), then look the
//    track up on the public API (no ARL): GET /track/isrc:{isrc} -> GET /album/{id}.
//  - Write: MERGE, never replace. The download writers in downloader.ts rebuild the
//    whole tag block (fine for a fresh file); reusing them on an existing file would
//    clobber the user's other tags + embedded artwork. So this module has its own
//    merge-safe writers: MP3 = read-all -> mutate targeted frames -> write-all;
//    FLAC = parse blocks, overlay only selected Vorbis comments, preserve PICTURE +
//    audio bytes verbatim.
//  - Only NON-EMPTY resolved values overwrite; an empty lookup never deletes an
//    existing tag. Files with no ISRC are reported, never guessed.

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'

const NodeID3 = require('node-id3')

export type AudioFormat = 'mp3' | 'flac'
export type MatchStatus = 'matched' | 'no-isrc' | 'unsupported' | 'unreadable'

export interface ScannedFile {
  path: string
  name: string
  format: AudioFormat | null
  isrc: string | null
  status: MatchStatus
}

// The retaggable fields (subset of the app's tag settings that the public API
// can actually source). Mirrors the keys used in metadataSettings.tags.
export interface RetagFields {
  title?: boolean
  artist?: boolean
  album?: boolean
  albumArtist?: boolean
  trackNumber?: boolean
  trackTotal?: boolean
  discNumber?: boolean
  isrc?: boolean
  year?: boolean
  date?: boolean
  bpm?: boolean
  genre?: boolean
  trackLength?: boolean
  explicitLyrics?: boolean
  albumBarcode?: boolean // UPC
  albumLabel?: boolean
}

// Normalized metadata resolved from the public Deezer endpoints (or supplied
// directly by the download flow, which already holds authoritative track/album
// data — see applyMergeFromMeta).
export interface ResolvedMeta {
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNumber: string
  trackTotal: string
  discNumber: string
  isrc: string
  upc: string
  label: string
  year: string
  date: string
  bpm: string
  genre: string      // joined with "; " — split into multiple Vorbis GENRE comments for FLAC
  duration: string   // seconds (track length); written as TLEN ms (MP3) / LENGTH s (FLAC)
  explicit: boolean
}

export interface TagChange {
  field: string
  from: string | null
  to: string
}

export interface RetagResult {
  path: string
  status: 'updated' | 'skipped' | 'failed' | 'preview'
  changes: TagChange[]
  // Selected fields Deezer had no value for (e.g. an album with no genre).
  // Lets the UI say "not available on Deezer" instead of silently skipping.
  unavailable?: string[]
  reason?: string
  error?: string
}

// --- HTTP helper (public Deezer API, no auth) -----------------------------

function getJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve({}) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('Deezer API request timed out')))
    req.on('error', reject)
  })
}

// --- Identity (read ISRC) -------------------------------------------------

function formatOf(filePath: string): AudioFormat | null {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.mp3') return 'mp3'
  if (ext === '.flac') return 'flac'
  return null
}

/** Read the file's ISRC. Uses music-metadata (handles both ID3 and Vorbis). */
export async function readIsrc(filePath: string): Promise<string | null> {
  try {
    // music-metadata is ESM-only; dynamic import keeps us compatible with the
    // CommonJS main process (same pattern as `await import('https')`).
    const mm: any = await import('music-metadata')
    const meta = await mm.parseFile(filePath, { duration: false, skipCovers: true })
    const isrc = meta?.common?.isrc
    if (Array.isArray(isrc) && isrc.length > 0) return String(isrc[0]).trim() || null
    if (typeof isrc === 'string' && isrc.trim()) return isrc.trim()
    return null
  } catch {
    return null
  }
}

// --- Resolve (public API lookup) ------------------------------------------

/** Look up a track by ISRC on the public API and normalize track + album metadata. */
export async function resolveByIsrc(isrc: string): Promise<ResolvedMeta | null> {
  const track = await getJson(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`)
  if (!track || track.error || !track.id) return null

  let album: any = {}
  const albumId = track.album?.id
  if (albumId) {
    album = await getJson(`https://api.deezer.com/album/${albumId}`)
    if (album?.error) album = {}
  }

  const releaseDate: string = album.release_date || track.release_date || ''
  const str = (v: any) => (v === null || v === undefined ? '' : String(v))

  // Album genres live on the public album endpoint; "All" (id 0) is noise.
  const genreNames: string[] = Array.isArray(album.genres?.data)
    ? album.genres.data.map((g: any) => str(g?.name)).filter((n: string) => n && n.toLowerCase() !== 'all')
    : []

  return {
    title: str(track.title),
    artist: str(track.artist?.name),
    album: str(album.title || track.album?.title),
    albumArtist: str(album.artist?.name || track.artist?.name),
    trackNumber: str(track.track_position),
    trackTotal: str(album.nb_tracks),
    discNumber: str(track.disk_number),
    isrc: str(track.isrc),
    upc: typeof album.upc === 'string' ? album.upc : '',
    label: typeof album.label === 'string' ? album.label : '',
    year: releaseDate ? releaseDate.split('-')[0] : '',
    date: releaseDate,
    bpm: track.bpm ? str(track.bpm) : '',
    genre: genreNames.join('; '),
    duration: track.duration ? str(track.duration) : '',
    explicit: track.explicit_lyrics === true
  }
}

// --- Field plan (which tags to overlay, with their new values) ------------

interface PlannedField {
  field: string // human label
  value: string // non-empty new value
}

/**
 * Build the list of fields to overlay, honoring user selection.
 * A selected field whose Deezer value is empty goes to `unavailable` (so the UI
 * can say "not available on Deezer" instead of silently doing nothing).
 */
function planFields(meta: ResolvedMeta, fields: RetagFields): { plan: PlannedField[]; unavailable: string[] } {
  const plan: PlannedField[] = []
  const unavailable: string[] = []
  const add = (on: boolean | undefined, field: string, value: string) => {
    if (!on) return
    if (value) plan.push({ field, value })
    else unavailable.push(field)
  }
  add(fields.title, 'title', meta.title)
  add(fields.artist, 'artist', meta.artist)
  add(fields.album, 'album', meta.album)
  add(fields.albumArtist, 'albumArtist', meta.albumArtist)
  add(fields.trackNumber, 'trackNumber', meta.trackNumber)
  add(fields.trackTotal, 'trackTotal', meta.trackTotal)
  add(fields.discNumber, 'discNumber', meta.discNumber)
  add(fields.isrc, 'isrc', meta.isrc)
  add(fields.year, 'year', meta.year)
  add(fields.date, 'date', meta.date)
  add(fields.bpm, 'bpm', meta.bpm)
  add(fields.genre, 'genre', meta.genre)
  add(fields.trackLength, 'trackLength', meta.duration)
  // explicit is a boolean we always represent as 1/0 when enabled — always available.
  if (fields.explicitLyrics) plan.push({ field: 'explicitLyrics', value: meta.explicit ? '1' : '0' })
  add(fields.albumBarcode, 'albumBarcode', meta.upc)
  add(fields.albumLabel, 'albumLabel', meta.label)
  return { plan, unavailable }
}

// --- MP3 merge writer (read-all -> mutate targeted -> write-all) ----------

function applyMp3(filePath: string, plan: PlannedField[], dryRun: boolean): TagChange[] {
  const existing: any = NodeID3.read(filePath) || {}
  const changes: TagChange[] = []
  // Work on a copy so write-all preserves every existing frame.
  const tags: any = { ...existing }
  const udt: Array<{ description: string; value: string }> = Array.isArray(existing.userDefinedText)
    ? existing.userDefinedText.map((e: any) => ({ ...e }))
    : []

  for (const { field, value } of plan) {
    switch (field) {
      case 'title': record(changes, field, existing.title, value); tags.title = value; break
      case 'artist': record(changes, field, existing.artist, value); tags.artist = value; break
      case 'album': record(changes, field, existing.album, value); tags.album = value; break
      case 'albumArtist': record(changes, field, existing.performerInfo, value); tags.performerInfo = value; break
      case 'trackNumber': {
        const combined = existing.trackNumber && String(existing.trackNumber).includes('/')
          ? String(existing.trackNumber).split('/')[1] ? `${value}/${String(existing.trackNumber).split('/')[1]}` : value
          : value
        record(changes, field, existing.trackNumber, combined); tags.trackNumber = combined; break
      }
      case 'trackTotal': {
        const cur = existing.trackNumber ? String(existing.trackNumber).split('/')[0] : ''
        const combined = cur ? `${cur}/${value}` : `/${value}`
        record(changes, 'trackTotal', existing.trackNumber, combined); tags.trackNumber = combined; break
      }
      case 'discNumber': record(changes, field, existing.partOfSet, value); tags.partOfSet = value; break
      case 'isrc': record(changes, field, existing.ISRC, value); tags.ISRC = value; break
      case 'year': record(changes, field, existing.year, value); tags.year = value; break
      case 'date': record(changes, field, existing.date, value); tags.date = value; break
      case 'bpm': record(changes, field, existing.bpm, value); tags.bpm = value; break
      case 'genre': record(changes, field, existing.genre, value); tags.genre = value; break
      case 'trackLength': {
        // TLEN frame is milliseconds; the resolved value is seconds (matches download writer).
        const ms = (parseInt(value, 10) * 1000).toString()
        record(changes, 'trackLength', existing.length, ms); tags.length = ms; break
      }
      case 'albumLabel': record(changes, field, existing.publisher, value); tags.publisher = value; break
      case 'albumBarcode': {
        const prev = udt.find((e) => e.description === 'BARCODE')
        record(changes, 'albumBarcode', prev?.value ?? null, value)
        if (prev) prev.value = value
        else udt.push({ description: 'BARCODE', value })
        tags.userDefinedText = udt
        break
      }
      case 'explicitLyrics': {
        // iTunes advisory TXXX frame (matches download writer's ITUNESADVISORY).
        const prev = udt.find((e) => e.description === 'ITUNESADVISORY')
        record(changes, 'explicitLyrics', prev?.value ?? null, value)
        if (prev) prev.value = value
        else udt.push({ description: 'ITUNESADVISORY', value })
        tags.userDefinedText = udt
        break
      }
    }
  }

  if (!dryRun && changes.length > 0) {
    const ok = NodeID3.write(tags, filePath)
    if (!ok) throw new Error('NodeID3.write failed')
  }
  return changes
}

function record(changes: TagChange[], field: string, from: any, to: string) {
  const fromStr = from === null || from === undefined ? null : String(from)
  if (fromStr === to) return // no-op; don't list unchanged fields
  changes.push({ field, from: fromStr, to })
}

// --- FLAC merge writer (overlay Vorbis comments, preserve PICTURE + audio) -

interface FlacBlock { type: number; isLast: boolean; data: Buffer }

const FLAC_FIELD_TO_KEY: Record<string, string> = {
  title: 'TITLE', artist: 'ARTIST', album: 'ALBUM', albumArtist: 'ALBUMARTIST',
  trackNumber: 'TRACKNUMBER', trackTotal: 'TRACKTOTAL', discNumber: 'DISCNUMBER',
  isrc: 'ISRC', year: 'YEAR', date: 'DATE', bpm: 'BPM', genre: 'GENRE',
  trackLength: 'LENGTH', explicitLyrics: 'EXPLICIT',
  albumBarcode: 'BARCODE', albumLabel: 'LABEL'
}

function applyFlac(filePath: string, plan: PlannedField[], dryRun: boolean): TagChange[] {
  const flacData = fs.readFileSync(filePath)
  if (flacData.toString('utf8', 0, 4) !== 'fLaC') throw new Error('Not a valid FLAC file')

  // Parse metadata blocks (mirror of downloader.ts block parser).
  const blocks: FlacBlock[] = []
  let offset = 4
  while (offset < flacData.length) {
    const headerByte = flacData.readUInt8(offset)
    const isLast = (headerByte & 0x80) !== 0
    const type = headerByte & 0x7f
    const length = flacData.readUIntBE(offset + 1, 3)
    if (type === 127) break
    blocks.push({ type, isLast, data: flacData.slice(offset + 4, offset + 4 + length) })
    offset += 4 + length
    if (isLast) break
  }
  const audioDataOffset = offset
  const audioData = flacData.slice(audioDataOffset)

  // Parse the existing VORBIS_COMMENT (type 4) into vendor + comment strings.
  let vendor = 'Deemix Remastered'
  let comments: string[] = []
  const vc = blocks.find((b) => b.type === 4)
  if (vc) {
    let p = 0
    const vlen = vc.data.readUInt32LE(p); p += 4
    vendor = vc.data.toString('utf8', p, p + vlen); p += vlen
    const count = vc.data.readUInt32LE(p); p += 4
    for (let i = 0; i < count; i++) {
      const clen = vc.data.readUInt32LE(p); p += 4
      comments.push(vc.data.toString('utf8', p, p + clen)); p += clen
    }
  }

  // Overlay only the planned keys; capture before/after for the change report.
  const changes: TagChange[] = []
  for (const { field, value } of plan) {
    const key = FLAC_FIELD_TO_KEY[field]
    if (!key) continue
    const matches = (c: string) => c.toUpperCase().startsWith(key + '=')
    if (field === 'genre') {
      // FLAC natively supports multiple GENRE comments; the resolved value is
      // "; "-joined, so split it back out (matches the download writer).
      const prev = comments.filter(matches).map((c) => c.slice(key.length + 1)).join('; ') || null
      if (prev === value) continue
      changes.push({ field, from: prev, to: value })
      comments = comments.filter((c) => !matches(c))
      for (const g of value.split('; ')) comments.push(`${key}=${g}`)
      continue
    }
    const prevEntry = comments.find(matches)
    const prev = prevEntry ? prevEntry.slice(key.length + 1) : null
    if (prev === value) continue
    changes.push({ field, from: prev, to: value })
    comments = comments.filter((c) => !matches(c))
    comments.push(`${key}=${value}`)
  }

  if (dryRun || changes.length === 0) return changes

  // Re-serialize: keep every block in original order, swapping only the
  // VORBIS_COMMENT payload (preserves PICTURE/SEEKTABLE/CUESHEET/etc).
  const newVc = serializeVorbis(vendor, comments)
  const outBlocks: { type: number; data: Buffer }[] = []
  let replaced = false
  for (const b of blocks) {
    if (b.type === 1) continue // drop PADDING (cosmetic; audio bytes unaffected)
    if (b.type === 4) { outBlocks.push({ type: 4, data: newVc }); replaced = true }
    else outBlocks.push({ type: b.type, data: b.data })
  }
  if (!replaced) {
    // No existing comment block — insert right after STREAMINFO (index 0).
    const insertAt = outBlocks.length > 0 && outBlocks[0].type === 0 ? 1 : 0
    outBlocks.splice(insertAt, 0, { type: 4, data: newVc })
  }

  const chunks: Buffer[] = [Buffer.from('fLaC')]
  outBlocks.forEach((b, i) => {
    const isLast = i === outBlocks.length - 1
    const header = Buffer.alloc(4)
    header.writeUInt8((isLast ? 0x80 : 0x00) | b.type, 0)
    header.writeUIntBE(b.data.length, 1, 3)
    chunks.push(header, b.data)
  })
  chunks.push(audioData)
  fs.writeFileSync(filePath, Buffer.concat(chunks))
  return changes
}

function serializeVorbis(vendor: string, comments: string[]): Buffer {
  const vendorBytes = Buffer.from(vendor, 'utf8')
  const commentBuffers = comments.map((c) => Buffer.from(c, 'utf8'))
  let size = 4 + vendorBytes.length + 4
  for (const cb of commentBuffers) size += 4 + cb.length
  const buf = Buffer.alloc(size)
  let p = 0
  buf.writeUInt32LE(vendorBytes.length, p); p += 4
  vendorBytes.copy(buf, p); p += vendorBytes.length
  buf.writeUInt32LE(commentBuffers.length, p); p += 4
  for (const cb of commentBuffers) {
    buf.writeUInt32LE(cb.length, p); p += 4
    cb.copy(buf, p); p += cb.length
  }
  return buf
}

// --- Orchestration --------------------------------------------------------

/**
 * Merge-write tags onto an existing file from already-resolved metadata.
 * The download flow calls this directly with authoritative track/album data
 * (exact IDs — no ISRC reverse-lookup ambiguity); the standalone retag calls it
 * after resolving by ISRC.
 */
export function applyMergeFromMeta(filePath: string, meta: ResolvedMeta, fields: RetagFields, dryRun: boolean): RetagResult {
  const fmt = formatOf(filePath)
  if (!fmt) return { path: filePath, status: 'skipped', changes: [], reason: 'unsupported format' }

  const { plan, unavailable } = planFields(meta, fields)
  if (plan.length === 0) {
    return {
      path: filePath, status: 'skipped', changes: [], unavailable,
      reason: unavailable.length ? 'selected tags not available on Deezer' : 'no tags selected'
    }
  }

  try {
    const changes = fmt === 'flac' ? applyFlac(filePath, plan, dryRun) : applyMp3(filePath, plan, dryRun)
    if (changes.length === 0) return { path: filePath, status: 'skipped', changes: [], unavailable, reason: 'tags already up to date' }
    return { path: filePath, status: dryRun ? 'preview' : 'updated', changes, unavailable }
  } catch (e: any) {
    return { path: filePath, status: 'failed', changes: [], unavailable, error: e?.message || String(e) }
  }
}

/** Retag (or preview) a single file by reverse ISRC lookup, then merge-write. */
export async function retagFile(filePath: string, fields: RetagFields, dryRun: boolean): Promise<RetagResult> {
  const fmt = formatOf(filePath)
  if (!fmt) return { path: filePath, status: 'skipped', changes: [], reason: 'unsupported format' }

  let isrc: string | null
  try { isrc = await readIsrc(filePath) } catch { return { path: filePath, status: 'failed', changes: [], error: 'could not read file tags' } }
  if (!isrc) return { path: filePath, status: 'skipped', changes: [], reason: 'no ISRC in file' }

  let meta: ResolvedMeta | null
  try { meta = await resolveByIsrc(isrc) } catch (e: any) { return { path: filePath, status: 'failed', changes: [], error: `lookup failed: ${e?.message || e}` } }
  if (!meta) return { path: filePath, status: 'failed', changes: [], error: `no Deezer match for ISRC ${isrc}` }

  return applyMergeFromMeta(filePath, meta, fields, dryRun)
}

/** Recursively scan a folder for .mp3/.flac files and read each one's ISRC. */
export async function scanFolder(folder: string): Promise<ScannedFile[]> {
  const out: ScannedFile[] = []
  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.isFile() && formatOf(full)) out.push({ path: full, name: e.name, format: formatOf(full), isrc: null, status: 'no-isrc' })
    }
  }
  walk(folder)
  // Read ISRC for each (local I/O; bounded concurrency keeps memory sane).
  const concurrency = 8
  for (let i = 0; i < out.length; i += concurrency) {
    const batch = out.slice(i, i + concurrency)
    await Promise.all(batch.map(async (f) => {
      try {
        f.isrc = await readIsrc(f.path)
        f.status = f.isrc ? 'matched' : 'no-isrc'
      } catch {
        f.status = 'unreadable'
      }
    }))
  }
  return out
}
