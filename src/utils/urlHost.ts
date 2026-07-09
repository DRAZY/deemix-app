// Hostname-based URL matching. Replaces fragile `url.includes('deezer.com')`
// substring checks (which also match hostile URLs like `evil.tld/?x=deezer.com`)
// with a real host parse. Falls back to prepending `https://` so scheme-less
// pastes ("open.spotify.com/track/...") still match, preserving prior behavior.

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

/**
 * Test free-form text for a URL whose host matches — for paste/search detection
 * where a "Share" payload often wraps the link in descriptive words
 * ("Listen to X on Deezer: https://link.deezer.com/s/abc"). Tries the whole
 * string first, then the first http(s) URL found inside it. Preserves the old
 * substring-style detection while still matching by real hostname.
 */
export function textContainsHostUrl(text: string, hosts: string[]): boolean {
  if (urlHasHost(text, hosts)) return true
  const m = text.match(/https?:\/\/[^\s]+/i)
  return !!m && urlHasHost(m[0], hosts)
}

/** A Deezer web/share URL (deezer.com and subdomains, or deezer.page.link). */
export function isDeezerUrl(url: string): boolean {
  return urlHasHost(url, ['deezer.com', 'deezer.page.link'])
}

/** A Spotify URL (spotify.com and subdomains, spotify.link, or the spotify: URI). */
export function isSpotifyUrl(url: string): boolean {
  return url.startsWith('spotify:') || urlHasHost(url, ['spotify.com', 'spotify.link'])
}
