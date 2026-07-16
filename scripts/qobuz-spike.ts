/**
 * Qobuz de-risk spike (feature/qobuz-integration).
 *
 * Standalone harness to validate the fragile parts of Qobuz integration BEFORE
 * building it into the app. Run with:  bun scripts/qobuz-spike.ts
 *
 * Phase 1 (no credentials needed): scrape app_id + app_secret from the live
 *   web-player bundle and print them. Proves the #1 fragility works today.
 *
 * Phase 2 (needs a paid Qobuz account): if QOBUZ_EMAIL + QOBUZ_PASSWORD are set
 *   in the environment (e.g. sourced from ~/.claude/.env — NEVER committed),
 *   log in, then sign + resolve a getFileUrl for a sample hi-res track and print
 *   the (unencrypted) CDN URL. Optionally downloads a few bytes to confirm it's
 *   a real FLAC. Set QOBUZ_TEST_TRACK_ID to override the sample track.
 *
 * This script writes nothing to the repo and commits no secrets.
 */
import { qobuzAuth, QOBUZ_FORMAT } from '../electron/services/qobuzAuth'

async function main() {
  console.log('=== Qobuz spike · Phase 1: app credentials ===')
  const creds = await qobuzAuth.fetchAppCredentials()
  console.log('app_id     :', creds.appId)
  console.log('app_secret :', creds.appSecret.slice(0, 6) + '…(32 chars)')
  console.log('✓ Credential scrape OK\n')

  const email = process.env.QOBUZ_EMAIL
  const password = process.env.QOBUZ_PASSWORD
  if (!email || !password) {
    console.log('=== Phase 2 skipped ===')
    console.log('Set QOBUZ_EMAIL and QOBUZ_PASSWORD (from ~/.claude/.env) to test')
    console.log('login + getFileUrl against a real subscriber account.')
    return
  }

  console.log('=== Phase 2: login + getFileUrl ===')
  const session = await qobuzAuth.login(email, password)
  console.log('✓ Logged in · userId', session.userId, '· plan', session.credentialLabel ?? '(unknown)')

  const trackId = process.env.QOBUZ_TEST_TRACK_ID || '5966783' // sample
  const fileUrl = await qobuzAuth.getFileUrl(trackId, QOBUZ_FORMAT.FLAC_HIRES_192)
  if (fileUrl.restricted || !fileUrl.url) {
    console.log('⚠ getFileUrl returned no URL (track not eligible at this quality on this account)')
    return
  }
  console.log('✓ getFileUrl OK')
  console.log('   format_id    :', fileUrl.formatId)
  console.log('   bit/sample   :', fileUrl.bitDepth + '-bit /', fileUrl.samplingRate + ' kHz')
  console.log('   mime         :', fileUrl.mimeType)
  console.log('   url (start)  :', fileUrl.url.slice(0, 80) + '…')

  // Confirm it's a real, unencrypted FLAC by sniffing the magic bytes ("fLaC").
  const head = await fetch(fileUrl.url, { headers: { Range: 'bytes=0-3' } })
  const magic = Buffer.from(await head.arrayBuffer()).toString('ascii')
  console.log('   magic bytes  :', JSON.stringify(magic), magic === 'fLaC' ? '✓ real FLAC, no decryption needed' : '(unexpected)')
}

main().catch((e) => {
  console.error('✗ Spike failed:', e.message)
  process.exit(1)
})
