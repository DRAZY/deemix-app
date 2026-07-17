// Map Qobuz's release_type to the app's record_type vocabulary (Deezer's),
// which drives the artist-page discography tabs (Albums / EPs / Singles /
// Compilations). Qobuz release types seen across their API and web player:
// album, single, ep (also epSingle/epMini in some payloads), compilation,
// live, download. live/download have no Deezer equivalent — they stay under
// 'album' so they remain visible in the primary tabs. When Qobuz omits the
// field entirely we default to 'album' rather than guessing from track
// counts — the tabs should never misclassify.
export function qobuzRecordType(album: any): string {
  const rt = String(album?.release_type || album?.product_type || '').toLowerCase()
  if (rt === 'ep' || rt === 'epmini') return 'ep'
  if (rt === 'single' || rt === 'epsingle') return 'single'
  if (rt === 'compilation' || rt === 'compile') return 'compile'
  return 'album'
}
