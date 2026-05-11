#!/usr/bin/env bash
set -o pipefail
unset CSC_LINK CSC_KEY_PASSWORD CSC_IDENTITY CSC_NAME
export CSC_IDENTITY_AUTO_DISCOVERY=false

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "=== macOS arm64 (unsigned) ==="
npx electron-builder --mac --arm64 -c.mac.identity=null 2>&1 || log "mac-arm64 FAILED"

log "=== macOS universal (unsigned) ==="
npx electron-builder --mac --universal -c.mac.identity=null 2>&1 || log "mac-universal FAILED"

log "=== DONE ==="
ls -lh release/ | grep -i "1\.5\.7.*\.dmg"
