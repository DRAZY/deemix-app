// Library index for opt-in "skip duplicates already in my library" (de-dup by ISRC).
//
// Identity = ISRC (stable across album versions), NOT filename/path. The index maps
// ISRC -> the on-disk path of a file we already have. When the toggle is on, a new
// download whose ISRC is already in the index is skipped (it's the same recording,
// just a different release/playlist). Tracks with no ISRC are never deduped.
//
// Persisted as library-index.json in userData, written race-safe via safeWriteJson
// + a serialized save-promise chain (same pattern as playlistSync/artistSync).
import { app } from 'electron'
import { join, extname } from 'path'
import * as fs from 'fs'
import { readFile, readdir, stat } from 'fs/promises'
import { safeWriteJson } from './playlistSync'
import { readIsrc } from './retagger'

interface LibraryIndexEntry {
  path: string
  addedAt: string
}

interface LibraryIndexState {
  version: 1
  byIsrc: Record<string, LibraryIndexEntry>
}

const AUDIO_EXTS = new Set(['.mp3', '.flac'])

class LibraryIndex {
  private state: LibraryIndexState = { version: 1, byIsrc: {} }
  private loaded = false
  private savePromise: Promise<void> = Promise.resolve()

  private getPath(): string {
    return join(app.getPath('userData'), 'library-index.json')
  }

  private norm(isrc: string): string {
    return isrc.trim().toUpperCase()
  }

  /** Load the index from disk once. Safe to call repeatedly. */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    try {
      const data = await readFile(this.getPath(), 'utf-8')
      const parsed = JSON.parse(data)
      if (parsed && typeof parsed === 'object' && parsed.byIsrc && typeof parsed.byIsrc === 'object') {
        this.state = { version: 1, byIsrc: parsed.byIsrc }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error('[LibraryIndex] Failed to load index:', err.message)
      }
      this.state = { version: 1, byIsrc: {} }
    }
    this.loaded = true
  }

  private save(): Promise<void> {
    this.savePromise = this.savePromise.then(async () => {
      try {
        await safeWriteJson(this.getPath(), this.state)
      } catch (err: any) {
        console.error('[LibraryIndex] Failed to save index:', err.message)
      }
    })
    return this.savePromise
  }

  /**
   * Return the existing on-disk path for this ISRC, or null if we don't have it.
   * Evicts stale entries (file moved/deleted by the user) so a re-download proceeds.
   */
  findExisting(isrc: string | null | undefined): string | null {
    if (!isrc) return null
    const key = this.norm(isrc)
    const entry = this.state.byIsrc[key]
    if (!entry) return null
    if (!fs.existsSync(entry.path)) {
      delete this.state.byIsrc[key]
      this.save()
      return null
    }
    return entry.path
  }

  /** Record an ISRC -> path mapping. Keeps the first still-on-disk entry we saw. */
  add(isrc: string | null | undefined, filePath: string): void {
    if (!isrc || !filePath) return
    const key = this.norm(isrc)
    const existing = this.state.byIsrc[key]
    if (existing && fs.existsSync(existing.path)) return // already tracked and valid
    this.state.byIsrc[key] = { path: filePath, addedAt: new Date().toISOString() }
    this.save()
  }

  count(): number {
    return Object.keys(this.state.byIsrc).length
  }

  /**
   * One-time backfill: walk a folder recursively, read each audio file's ISRC, and
   * populate the index so the feature works against a pre-existing library.
   * Returns counts so the UI can report what happened.
   */
  async buildFromFolder(
    rootPath: string,
    onProgress?: (scanned: number) => void
  ): Promise<{ scanned: number; indexed: number; noIsrc: number }> {
    await this.ensureLoaded()
    let scanned = 0
    let indexed = 0
    let noIsrc = 0

    const files: string[] = []
    const walk = async (dir: string): Promise<void> => {
      let entries: string[]
      try {
        entries = await readdir(dir)
      } catch {
        return
      }
      for (const name of entries) {
        const full = join(dir, name)
        let st
        try {
          st = await stat(full)
        } catch {
          continue
        }
        if (st.isDirectory()) {
          await walk(full)
        } else if (AUDIO_EXTS.has(extname(name).toLowerCase())) {
          files.push(full)
        }
      }
    }
    await walk(rootPath)

    for (const file of files) {
      scanned++
      try {
        const isrc = await readIsrc(file)
        if (isrc) {
          const key = this.norm(isrc)
          // Don't clobber an existing valid entry; first seen wins.
          if (!this.state.byIsrc[key] || !fs.existsSync(this.state.byIsrc[key].path)) {
            this.state.byIsrc[key] = { path: file, addedAt: new Date().toISOString() }
          }
          indexed++
        } else {
          noIsrc++
        }
      } catch {
        noIsrc++
      }
      if (onProgress && scanned % 50 === 0) onProgress(scanned)
    }

    await this.save()
    if (onProgress) onProgress(scanned)
    return { scanned, indexed, noIsrc }
  }
}

export const libraryIndex = new LibraryIndex()
