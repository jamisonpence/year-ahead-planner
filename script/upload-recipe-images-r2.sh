#!/usr/bin/env bash
#
# Upload the local recipe images to Cloudflare R2.
#
# The R2 dashboard refuses more than 100 files at once and Wrangler uploads a
# single object per invocation, so this uses rclone, which parallelises and
# resumes.
#
# Credentials are read from the environment and never written to disk or stored
# in this repo. Set them in your shell right before running:
#
#   export R2_ACCOUNT_ID="your-account-id"
#   export R2_ACCESS_KEY_ID="..."
#   export R2_SECRET_ACCESS_KEY="..."
#   ./script/upload-recipe-images-r2.sh
#
# Re-running is safe. rclone skips objects already present with a matching size
# and modification time, so an interrupted run resumes where it stopped.

set -euo pipefail

BUCKET="${R2_BUCKET:-mylifos-images}"
PREFIX="${R2_PREFIX:-recipe-images}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/client/public/recipe-images"

# ── Preflight ────────────────────────────────────────────────────────────────
missing=()
[[ -z "${R2_ACCOUNT_ID:-}" ]]        && missing+=("R2_ACCOUNT_ID")
[[ -z "${R2_ACCESS_KEY_ID:-}" ]]     && missing+=("R2_ACCESS_KEY_ID")
[[ -z "${R2_SECRET_ACCESS_KEY:-}" ]] && missing+=("R2_SECRET_ACCESS_KEY")
if (( ${#missing[@]} )); then
  echo "✗ Missing environment variable(s): ${missing[*]}" >&2
  echo "  See the header of this script for how to set them." >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "✗ rclone is not installed. Install it with:  brew install rclone" >&2
  exit 1
fi

if [[ ! -d "$SRC" ]]; then
  echo "✗ Source folder not found: $SRC" >&2
  exit 1
fi

LOCAL_COUNT=$(find "$SRC" -type f -name '*.webp' | wc -l | tr -d ' ')
echo "Source:      $SRC"
echo "Local files: $LOCAL_COUNT"
echo "Destination: r2:$BUCKET/$PREFIX"
echo

# ── rclone remote, defined entirely through the environment ──────────────────
export RCLONE_CONFIG_R2_TYPE="s3"
export RCLONE_CONFIG_R2_PROVIDER="Cloudflare"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_REGION="auto"
# Needed when the API token is scoped to a single bucket rather than the account.
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET="true"

# ── Upload ───────────────────────────────────────────────────────────────────
# --header-upload writes real Cache-Control metadata onto every object, which a
# zone Cache Rule cannot do — this is what makes `immutable` possible.
rclone copy "$SRC" "r2:$BUCKET/$PREFIX" \
  --transfers=32 \
  --checkers=32 \
  --s3-chunk-size=16M \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --progress \
  --stats-one-line

# ── Verify ───────────────────────────────────────────────────────────────────
echo
echo "Verifying…"
REMOTE_COUNT=$(rclone size "r2:$BUCKET/$PREFIX" --json | sed -n 's/.*"count":\([0-9]*\).*/\1/p')
echo "Local:  $LOCAL_COUNT files"
echo "Remote: $REMOTE_COUNT objects"

if [[ "$LOCAL_COUNT" == "$REMOTE_COUNT" ]]; then
  echo
  echo "✓ All $REMOTE_COUNT objects uploaded."
  echo "  Spot-check:  https://images.mylifos.com/$PREFIX/1-pot-black-bean-soup.webp"
else
  echo
  echo "✗ Count mismatch — re-run this script, it will only send what's missing." >&2
  exit 1
fi
