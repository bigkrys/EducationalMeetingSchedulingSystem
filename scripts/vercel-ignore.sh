#!/usr/bin/env bash
set -euo pipefail

# Vercel ignore logic: exit 0 to skip the build, non-zero to continue.

# Only allow production deploys from main
if [ "${VERCEL_ENV:-}" = "production" ] && [ "${VERCEL_GIT_COMMIT_REF:-}" != "main" ]; then
  echo "Preventing non-main production deploy"
  exit 0
fi

# Only allow preview deploys from develop (staging)
if [ "${VERCEL_ENV:-}" = "preview" ] && [ "${VERCEL_GIT_COMMIT_REF:-}" != "develop" ]; then
  echo "Skipping preview deploys except develop (staging)"
  exit 0
fi

# For all other cases, do not ignore (run the build)
exit 1

