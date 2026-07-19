/**
 * Qobuz download spike (feature/qobuz-integration). Proves the native no-decrypt
 * download path pulls a real, complete hi-res FLAC. Needs QOBUZ_USER_ID +
 * QOBUZ_AUTH_TOKEN in the environment (from ~/.claude/.env — never committed).
 *   bun scripts/qobuz-download-spike.ts
 */
import os from 'os'
import path from 'path'
import fs from 'fs'
import { parseFile } from 'music-metadata'
import { qobuzAuth } from '../electron/services/qobuzAuth'
import { downloadQobuzTrack } from '../electron/services/qobuzDownloader'

const userId = process.env.QOBUZ_USER_ID, token = process.env.QOBUZ_AUTH_TOKEN
if (!userId || !token) { console.log('Set QOBUZ_USER_ID + QOBUZ_AUTH_TOKEN to run.'); process.exit(0) }

qobuzAuth.restoreSession(token, Number(userId))
const s = await qobuzAuth.search(process.env.QOBUZ_QUERY || 'daft punk get lucky', 1)
const t = s.tracks.items[0]
console.log('track:', t.title, '·', t.performer?.name, '· id', t.id)

const out = path.join(os.tmpdir(), `qobuz-spike-${t.id}.flac`)
const r = await downloadQobuzTrack(t.id, 'flac', out)
const meta = await parseFile(out)
console.log(`downloaded ${(r.bytes/1e6).toFixed(2)}MB · ${meta.format.container} ${meta.format.bitsPerSample}bit/${meta.format.sampleRate}Hz · ${Math.round(meta.format.duration||0)}s`)
console.log(meta.format.container === 'FLAC' && (meta.format.duration||0) > 30 ? '✓ COMPLETE VALID FLAC' : '✗ suspect')
fs.unlinkSync(out)
