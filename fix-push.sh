#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "→ Removing stale lock files..."
rm -f .git/index.lock
rm -f .git/HEAD.lock
rm -f .git/refs/heads/main.lock
rm -f .git/COMMIT_EDITMSG.lock

echo "→ Staging all changes..."
git add -A

echo "→ Committing..."
git commit -m "Politics: FEC campaign finance + House vote XML fixes

- FEC campaign finance dropdown for federal reps (total raised,
  PAC vs individual split, top contributing employers)
- House vote parser rewritten to handle XML format
- Milestone-based range detection replaces binary search

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

echo "→ Pushing..."
git push origin main

echo "✓ Done! Railway will deploy in ~2 minutes."
