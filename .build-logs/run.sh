#!/usr/bin/env bash
set -o pipefail
export CSC_IDENTITY_AUTO_DISCOVERY=false
export WIN_CSC_LINK=""
export CSC_LINK=""

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "=== Step 0: Vite renderer build ==="
bun run build:vite 2>&1 || { log "vite build FAILED"; exit 10; }

log "=== Step 1: macOS universal (Intel + ARM) ==="
npx electron-builder --mac --universal 2>&1 || log "mac-universal FAILED (continuing)"

log "=== Step 2: macOS arm64 ==="
npx electron-builder --mac --arm64 2>&1 || log "mac-arm64 FAILED (continuing)"

log "=== Step 3: Windows x64 ==="
npx electron-builder --win --x64 2>&1 || log "win-x64 FAILED (continuing)"

log "=== Step 4: Windows arm64 ==="
npx electron-builder --win --arm64 2>&1 || log "win-arm64 FAILED (continuing)"

log "=== Step 5: Linux x64 ==="
PATH="$PWD/scripts/build-tools:$PATH" npx electron-builder --linux --x64 2>&1 || log "linux-x64 FAILED (continuing)"

log "=== Step 6: Linux arm64 ==="
PATH="$PWD/scripts/build-tools:$PATH" npx electron-builder --linux --arm64 2>&1 || log "linux-arm64 FAILED (continuing)"

log "=== DONE ==="
ls -lh release/ | grep -i "1\.5\.7"
