#!/usr/bin/env bash
set -o pipefail
unset CSC_LINK CSC_KEY_PASSWORD CSC_IDENTITY CSC_NAME
export CSC_IDENTITY_AUTO_DISCOVERY=false

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# Wipe stale mac artifacts so we know everything is fresh
rm -f release/Deemix\ Remastered-1.5.7-arm64.dmg \
      release/Deemix\ Remastered-1.5.7-arm64.dmg.blockmap \
      release/Deemix\ Remastered-1.5.7-universal.dmg \
      release/Deemix\ Remastered-1.5.7-universal.dmg.blockmap
rm -rf release/mac-arm64 release/mac-universal release/mac-universal-*-temp

log "=== macOS arm64 (proper ad-hoc signing) ==="
# -c.mac.identity=- tells electron-builder to use ad-hoc signing (signs the
# bundle including _CodeSignature/CodeResources), as opposed to identity=null
# which skips signing entirely and leaves only the linker stub signature.
npx electron-builder --mac --arm64 -c.mac.identity=- 2>&1 || log "mac-arm64 FAILED"

log "=== Verify arm64 codesign ==="
codesign --display --verbose=2 release/mac-arm64/Deemix\ Remastered.app 2>&1 | grep -E "Identifier|Signature|Sealed" || true
codesign --verify --deep --strict release/mac-arm64/Deemix\ Remastered.app 2>&1 || log "arm64 verify FAILED"

log "=== macOS universal (proper ad-hoc signing) ==="
npx electron-builder --mac --universal -c.mac.identity=- 2>&1 || log "mac-universal FAILED"

log "=== Verify universal codesign ==="
codesign --display --verbose=2 release/mac-universal/Deemix\ Remastered.app 2>&1 | grep -E "Identifier|Signature|Sealed" || true
codesign --verify --deep --strict release/mac-universal/Deemix\ Remastered.app 2>&1 || log "universal verify FAILED"

log "=== DONE ==="
ls -lh release/ | grep -i "1\.5\.7.*\.dmg"
