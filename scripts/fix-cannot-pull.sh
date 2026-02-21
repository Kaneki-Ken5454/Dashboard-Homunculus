#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/fix-cannot-pull.sh [remote] [base_branch]
# Defaults:
#   remote=origin, base_branch=main

REMOTE="${1:-origin}"
BASE_BRANCH="${2:-main}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$CURRENT_BRANCH" == "$BASE_BRANCH" ]]; then
  echo "❌ You are on '$BASE_BRANCH'. Checkout your feature branch first."
  exit 1
fi

echo "➡️  Fetching latest from $REMOTE/$BASE_BRANCH"
git fetch "$REMOTE" "$BASE_BRANCH"

echo "➡️  Rebasing $CURRENT_BRANCH onto $REMOTE/$BASE_BRANCH"
if git rebase "$REMOTE/$BASE_BRANCH"; then
  echo "✅ Rebase successful."
  exit 0
fi

echo "⚠️ Rebase stopped due to conflicts."
echo "Resolve conflicts in your editor, then run:"
echo "  git add <resolved-files>"
echo "  git rebase --continue"
echo
echo "If you want to cancel the rebase:"
echo "  git rebase --abort"
