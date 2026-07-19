// Shared album-context builder — single source of truth for the album-level
// metadata that drives consistent folder structure (incl. CD subfolders for
// multi-disc albums), folder/file naming templates, and tags.
//
// Used by BOTH the manual album-page download (server.handleDownloadAlbum /
// fetchAlbumContext, #94) and artist sync (artistSync, #95) so a synced track
// lands in the SAME folder — and carries the same tags — as a manual album
// download. Divergence here is exactly what caused #95 (sync ignored CD folders
// because it never built this context).
export interface AlbumContext {
  albumId: number | string
  albumTitle: string
  albumArtist: string
  artistPicture?: string
  totalDiscs?: number
  totalTracks?: number
  explicitLyrics?: boolean
  isCompilation?: boolean
  recordType?: string
  upc?: string
  label?: string
}

// Build the context from a public-API album object (`/album/{id}`) plus its
// tracklist (`/album/{id}/tracks`). `tracksData` drives disc count + explicit
// status; both callers already fetch the tracklist, so no extra request here.
export function buildAlbumContext(
  albumId: number | string,
  albumInfo: any,
  tracksData: any[]
): AlbumContext {
  // Total discs — drives CD folder creation for multi-disc albums.
  const totalDiscs = Math.max(...tracksData.map((t: any) => t.disk_number || 1), 1)
  // Total tracks — feeds the Track Total tag / %tracktotal% (#107). Prefer the
  // authoritative album count; fall back to the tracklist length.
  const totalTracks = Number(albumInfo.nb_tracks) || tracksData.length || undefined
  // Explicit status from actual track data. Album-level explicit_content_lyrics
  // is unreliable (code 4 = "partial"); flag the album explicit if ANY track is
  // code 1.
  const hasExplicitTracks = tracksData.some((t: any) => t.explicit_content_lyrics === 1)
  // For compilations (record_type "compile"), Deezer sets the album artist to
  // "Various Artists" — this keeps all tracks in the same folder.
  return {
    albumId,
    albumTitle: albumInfo.title || 'Unknown Album',
    albumArtist: albumInfo.artist?.name || 'Unknown Artist',
    artistPicture: albumInfo.artist?.picture_xl || albumInfo.artist?.picture_big || albumInfo.artist?.picture_medium || undefined,
    totalDiscs,
    totalTracks,
    explicitLyrics: hasExplicitTracks,
    isCompilation: albumInfo.record_type === 'compile',
    // Full record_type (album/single/ep/compile) for the RELEASETYPE tag (#82)
    recordType: typeof albumInfo.record_type === 'string' ? albumInfo.record_type : '',
    // v1.8.1: surface UPC so %barcode% / %upc% folder + filename templates have a
    // value (trackInfo.ALB_UPC is undefined on private-API track fetches).
    upc: typeof albumInfo.upc === 'string' ? albumInfo.upc : '',
    // v1.8.2: surface label for the same reason.
    label: typeof albumInfo.label === 'string' ? albumInfo.label : ''
  }
}
