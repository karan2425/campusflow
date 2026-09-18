#!/usr/bin/env bash
#
# One-command push of CampusFlow to GitHub.
#
#   1. Create a token:  https://github.com/settings/tokens?type=beta
#         - Repository access: All repositories (or just the new one)
#         - Permissions: Contents = Read and write
#                        Administration = Read and write   (only needed to CREATE the repo)
#   2. Run:
#         GITHUB_TOKEN=ghp_xxxxxxxx ./scripts/push-to-github.sh
#      optional overrides:
#         GITHUB_OWNER=karan2425 REPO_NAME=campusflow VISIBILITY=public \
#           GITHUB_TOKEN=... ./scripts/push-to-github.sh
#
# The token is never written to disk. Revoke it when you are done.
set -euo pipefail

OWNER="${GITHUB_OWNER:-karan2425}"
REPO="${REPO_NAME:-campusflow}"
VISIBILITY="${VISIBILITY:-public}"
BRANCH="${BRANCH:-main}"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "✗ GITHUB_TOKEN is not set."
  echo "  Create one at https://github.com/settings/tokens?type=beta"
  echo "  then:  GITHUB_TOKEN=ghp_xxx $0"
  exit 1
fi

cd "$(dirname "$0")/.."

if [[ ! -d .git ]]; then
  echo "✗ Not a git repository. Run 'git init' first."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠ Uncommitted changes present — commit them first so they are included."
  git status --short
  exit 1
fi

echo "→ Authenticating as $OWNER"
LOGIN="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  https://api.github.com/user | sed -n 's/.*"login": *"\([^"]*\)".*/\1/p' | head -1)"
echo "  token belongs to: ${LOGIN:-unknown}"

if [[ -n "$LOGIN" && "$LOGIN" != "$OWNER" ]]; then
  echo "⚠ Token belongs to '$LOGIN', not '$OWNER'. Continuing with '$LOGIN' as the owner."
  OWNER="$LOGIN"
fi

echo "→ Creating repository $OWNER/$REPO ($VISIBILITY)"
HTTP="$(curl -sS -o /tmp/gh_create.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO\",\"description\":\"AI-powered college management & placement platform — Next.js, Express, Prisma, PostgreSQL, FastAPI, Gemini, FAISS\",\"private\":$([[ $VISIBILITY == private ]] && echo true || echo false),\"has_issues\":true,\"has_projects\":false,\"auto_init\":false}")"

case "$HTTP" in
  201) echo "  ✓ created" ;;
  422) echo "  • repository already exists — pushing into it" ;;
  *)   echo "  ✗ GitHub returned $HTTP:"; cat /tmp/gh_create.json; exit 1 ;;
esac

echo "→ Pushing $BRANCH"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$OWNER/$REPO.git"

# Push without ever putting the token in .git/config
git -c credential.helper= \
    -c credential.helper='!f(){ echo "username=x-access-token"; echo "password=$GITHUB_TOKEN"; };f' \
    push -u origin "$BRANCH" --force

echo
echo "✓ Done: https://github.com/$OWNER/$REPO"
echo "  Revoke your token now: https://github.com/settings/tokens"
