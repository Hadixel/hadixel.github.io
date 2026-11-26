#!/usr/bin/env bash
# ==============================================================================
# Kmodern Production Zero-Downtime Deployment Script
#
# Builds the storefront locally (or uses existing build), syncs artifacts to
# the idle slot on the production server, runs health checks, and atomically
# reloads Nginx for zero downtime.
# ==============================================================================

set -euo pipefail

SERVER_IP="${SERVER_IP:-185.141.107.127}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PASS="${SERVER_PASS:-AHadi1386}"
REMOTE_ROOT="/var/www/kmodern"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export RSYNC_RSH="sshpass -p '$SERVER_PASS' ssh -F /dev/null -o StrictHostKeyChecking=no"

SKIP_BUILD=false
EXPLICIT_TARGET=""
DRY_RUN=false

usage() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --skip-build        Skip local Next.js build and deploy existing .next directory
  --target <slot>     Explicit target slot ('blue' or 'green'). Default: auto-detect idle slot
  --dry-run           Print planned actions without modifying anything
  -h, --help          Show this help message
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --target)
      EXPLICIT_TARGET="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      ;;
  esac
done

# Ensure required local tools exist
command -v sshpass >/dev/null 2>&1 || { echo "Error: sshpass is required." >&2; exit 1; }
command -v rsync >/dev/null 2>&1 || { echo "Error: rsync is required." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "Error: curl is required." >&2; exit 1; }

remote_ssh() {
  sshpass -p "$SERVER_PASS" ssh -F /dev/null -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "$@"
}

echo "=== [1/5] Determining Active Slot on Production ==="
ACTIVE_SLOT=$(remote_ssh "cat $REMOTE_ROOT/.active-slot 2>/dev/null || grep -o '31[01]0' /etc/nginx/conf.d/kmodern_upstream.conf 2>/dev/null | head -1" || true)

if [[ "$ACTIVE_SLOT" == "3100" || "$ACTIVE_SLOT" == "blue" ]]; then
  ACTIVE_SLOT="blue"
  IDLE_SLOT="green"
  ACTIVE_PORT=3100
  TARGET_PORT=3110
elif [[ "$ACTIVE_SLOT" == "3110" || "$ACTIVE_SLOT" == "green" ]]; then
  ACTIVE_SLOT="green"
  IDLE_SLOT="blue"
  ACTIVE_PORT=3110
  TARGET_PORT=3100
else
  echo "Warning: Could not determine active slot from server. Defaulting active to green."
  ACTIVE_SLOT="green"
  IDLE_SLOT="blue"
  ACTIVE_PORT=3110
  TARGET_PORT=3100
fi

TARGET_SLOT="${EXPLICIT_TARGET:-$IDLE_SLOT}"
if [[ "$TARGET_SLOT" == "blue" ]]; then
  TARGET_PORT=3100
elif [[ "$TARGET_SLOT" == "green" ]]; then
  TARGET_PORT=3110
else
  echo "Error: Invalid target slot '$TARGET_SLOT'. Must be 'blue' or 'green'." >&2
  exit 1
fi

echo "Active Slot: $ACTIVE_SLOT (Port $ACTIVE_PORT)"
echo "Target Slot: $TARGET_SLOT (Port $TARGET_PORT)"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run enabled. Exiting without changes."
  exit 0
fi

# Step 2: Build locally (fast & reliable, 0 server memory/swap strain)
if [[ "$SKIP_BUILD" == "false" ]]; then
  echo "=== [2/5] Building Storefront Locally with Next.js (Turbopack) ==="
  cd "$REPO_ROOT"
  NEXT_PUBLIC_BASE_URL="https://kmodern.ir" \
  NEXT_PUBLIC_API_URL="https://api.kmodern.ir" \
  NODE_ENV="production" \
  pnpm --filter @kmodern/store build

  # Prune build cache to save transfer size & remote disk
  rm -rf "$REPO_ROOT/apps/store/.next/cache" "$REPO_ROOT/apps/store/.next/dev"
else
  echo "=== [2/5] Skipping Local Build as Requested (--skip-build) ==="
  if [[ ! -d "$REPO_ROOT/apps/store/.next" ]]; then
    echo "Error: $REPO_ROOT/apps/store/.next does not exist! Cannot skip build." >&2
    exit 1
  fi
fi

# Step 3: Sync code & prebuilt artifacts to the server
echo "=== [3/5] Syncing Artifacts to Remote Staging (Target Slot: $TARGET_SLOT) ==="
STAGING_DIR="$REMOTE_ROOT/deployments/staging-$TARGET_SLOT"
remote_ssh "mkdir -p $STAGING_DIR"

# Sync shared packages
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  "$REPO_ROOT/packages/" \
  "$SERVER_USER@$SERVER_IP:$REMOTE_ROOT/packages/"

# Sync store source (without overwriting .next or .env)
rsync -az \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude '.env' \
  "$REPO_ROOT/apps/store/" \
  "$SERVER_USER@$SERVER_IP:$REMOTE_ROOT/apps/store/"

# Sync built .next folder directly to the remote staging directory
rsync -az --delete \
  --exclude 'cache' \
  --exclude 'dev' \
  "$REPO_ROOT/apps/store/.next/" \
  "$SERVER_USER@$SERVER_IP:$STAGING_DIR/.next/"

# Step 4: Execute zero-downtime deployment script on server
echo "=== [4/5] Running Server Zero-Downtime Deployment on Target Port $TARGET_PORT ==="
remote_ssh "mkdir -p $REMOTE_ROOT/shared/next-images-cache $REMOTE_ROOT/media/uploads && ln -sfn $REMOTE_ROOT/media/uploads $REMOTE_ROOT/apps/store/public/uploads"
remote_ssh "bash $REMOTE_ROOT/deploy.sh --target $TARGET_SLOT --prebuilt-dir $STAGING_DIR"

# Step 5: Verification
echo "=== [5/5] Verifying Production Storefront (https://kmodern.ir) ==="
FAILURES=0
for i in {1..5}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 https://kmodern.ir || echo "FAILED")
  if [[ "$CODE" == "200" ]]; then
    echo "Check $i: HTTP $CODE OK"
  else
    echo "Check $i: Unexpected HTTP $CODE"
    FAILURES=$((FAILURES + 1))
  fi
  sleep 0.5
done

if [[ $FAILURES -eq 0 ]]; then
  echo "=================================================================="
  echo " Deployment SUCCEEDED with ZERO DOWNTIME! Active slot: $TARGET_SLOT"
  echo "=================================================================="
else
  echo "Warning: Verification had $FAILURES non-200 responses. Check server logs." >&2
  exit 1
fi
