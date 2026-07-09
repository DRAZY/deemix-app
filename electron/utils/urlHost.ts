// Hostname-based URL matching (Electron-main copy of src/utils/urlHost.ts —
// the main process can't import from the renderer bundle). Replaces fragile
// `url.includes('host')` substring checks with a real host parse so hostile URLs
// like `evil.tld/?x=link.deezer.com` no longer match. Falls back to prepending
// `https://` so scheme-less input still parses, preserving prior behavior.

/** True iff the URL's host is exactly one of `hosts` or a subdomain of one. */
export function urlHasHost(url: string, hosts: string[]): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    try { host = new URL('https://' + url).hostname } catch { return false }
  }
  host = host.toLowerCase().replace(/\.$/, '') // strip FQDN trailing dot
  return hosts.some(h => host === h || host.endsWith('.' + h))
}

/** A Spotify URL (spotify.com and subdomains, spotify.link, or the spotify: URI). */
export function isSpotifyUrl(url: string): boolean {
  return url.startsWith('spotify:') || urlHasHost(url, ['spotify.com', 'spotify.link'])
}
